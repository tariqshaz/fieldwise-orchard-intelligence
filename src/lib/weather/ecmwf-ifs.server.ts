/**
 * Server-only ECMWF Open Data IFS adapter.
 *
 * How a forecast is retrieved
 * ---------------------------
 *  1. The most recent IFS run that ECMWF has actually published for the
 *     requested resolution is found by probing candidate cycles newest first.
 *     A run that has not been published yet answers 404 and is skipped.
 *  2. For every forecast step, ECMWF's `.index` file for that step is read.
 *     It states the exact byte range of every field inside the matching
 *     `.grib2` file, so the fields are fetched with a `Range` request rather
 *     than by downloading a 95 MB file.
 *  3. The response is checked: it must be a 206 whose `Content-Range` is the
 *     range that was asked for.
 *  4. The message is decoded, and it is checked to be the parameter, the run
 *     and the lead time that were requested — a field that is anything else
 *     is refused rather than reported.
 *  5. The grid cell nearest the AOI centroid is selected with the same rule
 *     ecCodes applies (including its tie-break towards the lower index), and
 *     the value is converted to the unit the product reports.
 *
 * Only the two fixed public sample AOIs may be sent to ECMWF, and only their
 * centroids leave the process. Imported or private boundaries are never
 * requested from the provider.
 *
 * Failure visibility
 * ------------------
 * Every field of every step is attempted independently. A field that cannot
 * be fetched or decoded is listed in that step's `missingFields`, the product
 * status becomes `partial`, and only a run where nothing at all could be
 * decoded becomes `unavailable`.
 */

import { selectGridCell, resolveWeatherAoi } from "./aoi.ts";
import { WEATHER_ERROR_MESSAGES } from "./errors.ts";
import { decodeGrib2Field } from "./grib2-decode.server.ts";
import { selectNearestGridCell, type Grib2GridSelection } from "./grib2.ts";
import type { EcmwfForecastFrame, EcmwfIfsForecast, WeatherError, WeatherStatus } from "./types.ts";

const ROOT = "https://data.ecmwf.int/forecasts";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_INDEX_BYTES = 8_000_000;
const MAX_FIELD_BYTES = 8_000_000;
const MAX_CONCURRENT_REQUESTS = 6;
/**
 * How many fields are decoded at the same time.
 *
 * A 0.1° field holds 6.48 million values, so a handful of them in flight
 * already costs hundreds of megabytes. The limit keeps the peak bounded.
 */
const MAX_CONCURRENT_DECODES = 1;
const MAX_CYCLES_PROBED = 8;
const CYCLE_LOOKBACK_HOURS = 48;
/** Forecast lead times requested, in hours: the first three days at 3-hour steps. */
const FETCH_STEPS = Array.from({ length: 24 }, (_, i) => (i + 1) * 3);

/** The two ECMWF Open Data IFS resolutions this slice offers. */
export type EcmwfResolution = "0.1_deg" | "0.25_deg";

interface ResolutionSpec {
  /** Directory ECMWF publishes the resolution under. */
  dir: "0p25" | "0p1";
  /** File name suffix; the 0.1° surface fields live in their own file. */
  fileSuffix: string;
  /** Grid spacing in degrees. */
  degrees: number;
}

const RESOLUTIONS: Record<EcmwfResolution, ResolutionSpec> = {
  "0.25_deg": { dir: "0p25", fileSuffix: "", degrees: 0.25 },
  "0.1_deg": { dir: "0p1", fileSuffix: "-sfc", degrees: 0.1 },
};

/**
 * The ECMWF parameters this slice requests.
 *
 * The identity of a field is checked against GRIB2's own parameter tables
 * rather than against a decoder's name lookup, because ECMWF's local
 * parameter table is not resolvable by every decoder. `2t` is a WMO
 * parameter; `tp` is an ECMWF local one (category 1, number 193, centre 98).
 */
interface ParameterSpec {
  /** The name ECMWF's index files use. */
  indexParam: "2t" | "tp";
  /** GRIB2 discipline. */
  discipline: number;
  /** GRIB2 parameter category. */
  category: number;
  /** GRIB2 parameter number. */
  number: number;
  /** Originating centre, when the parameter comes from a local table. */
  localCentre: number | null;
  /** GRIB2 product definition template number. */
  productTemplate: number;
  /** The unit the ECMWF parameter table gives the parameter. */
  units: string;
  /** Whether the value accumulates from the start of the run to the lead time. */
  accumulated: boolean;
  /** Plausible range of the raw value, used to catch a mis-decoded field. */
  plausible: [number, number];
}

const PARAMETERS: Record<"2t" | "tp", ParameterSpec> = {
  "2t": {
    indexParam: "2t",
    discipline: 0,
    category: 0,
    number: 0,
    localCentre: null,
    productTemplate: 0,
    units: "K",
    accumulated: false,
    plausible: [180, 350],
  },
  tp: {
    indexParam: "tp",
    discipline: 0,
    category: 1,
    number: 193,
    localCentre: 98,
    productTemplate: 8,
    units: "m",
    accumulated: true,
    plausible: [0, 30],
  },
};

/** An entry of an ECMWF `.index` file. */
export interface IndexEntry {
  date: string;
  time: string;
  step: string;
  levtype: string;
  param: string;
  _offset: number;
  _length: number;
}

/** One IFS run. */
export interface Cycle {
  /** The run date, as YYYYMMDD. */
  date: string;
  /** The run hour, as "00", "06", "12" or "18". */
  cycle: string;
}

export class EcmwfIfsError extends Error {
  readonly code: "provider_error" | "timeout" | "provider_response_invalid" | "internal";
  /** The HTTP status, when the failure came from a provider response. */
  readonly status: number | null;
  constructor(code: EcmwfIfsError["code"], message: string, status: number | null = null) {
    super(message);
    this.name = "EcmwfIfsError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Check that a provider honoured a byte-range request exactly.
 *
 * A server that ignores the range and answers with the whole file is a
 * failure, not a larger success: the point of the range is to transfer one
 * field, not a 95 MB file.
 */
export function validateRangeResponse(
  status: number,
  contentRange: string | null,
  start: number,
  end: number,
): boolean {
  if (status !== 206 || !contentRange) return false;
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
  return Boolean(
    match && Number(match[1]) === start && Number(match[2]) === end && Number(match[3]) > end,
  );
}

/**
 * A counting semaphore that bounds how many provider requests are in flight.
 *
 * The slot is handed straight to the next waiter when a request finishes, so
 * the limit is never exceeded.
 */
class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.active--;
  }
}

const requestSemaphore = new Semaphore(MAX_CONCURRENT_REQUESTS);
const decodeSemaphore = new Semaphore(MAX_CONCURRENT_DECODES);

/** Fetch a URL, optionally as a byte range, with a bounded size and a timeout. */
async function fetchBounded(
  url: string,
  maxBytes: number,
  range?: { start: number; end: number },
): Promise<Uint8Array> {
  return requestSemaphore.run(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const headers = range ? { Range: `bytes=${range.start}-${range.end}` } : undefined;
      const response = await fetch(url, { headers, signal: controller.signal, redirect: "follow" });
      if (range) {
        const expectedLength = range.end - range.start + 1;
        const contentRange = response.headers.get("content-range");
        if (!validateRangeResponse(response.status, contentRange, range.start, range.end)) {
          await response.body?.cancel();
          throw new EcmwfIfsError(
            "provider_response_invalid",
            "ECMWF did not honor the requested byte range.",
            response.status,
          );
        }
        const declared = Number(response.headers.get("content-length"));
        if (Number.isFinite(declared) && declared !== expectedLength) {
          await response.body?.cancel();
          throw new EcmwfIfsError(
            "provider_response_invalid",
            "ECMWF returned an unexpected byte-range length.",
            response.status,
          );
        }
        maxBytes = Math.min(maxBytes, expectedLength);
      } else if (!response.ok) {
        await response.body?.cancel();
        throw new EcmwfIfsError(
          "provider_error",
          WEATHER_ERROR_MESSAGES.provider_error(response.status),
          response.status,
        );
      }
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        await response.body?.cancel();
        throw new EcmwfIfsError(
          "provider_response_invalid",
          "ECMWF response exceeded the configured size limit.",
          response.status,
        );
      }
      if (!response.body) {
        throw new EcmwfIfsError(
          "provider_response_invalid",
          "ECMWF returned an empty response.",
          response.status,
        );
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new EcmwfIfsError(
            "provider_response_invalid",
            "ECMWF response exceeded the configured size limit.",
            response.status,
          );
        }
        chunks.push(value);
      }
      if (range && size !== range.end - range.start + 1) {
        throw new EcmwfIfsError(
          "provider_response_invalid",
          "ECMWF byte-range response length did not match its index record.",
          response.status,
        );
      }
      const result = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return result;
    } catch (error) {
      if (error instanceof EcmwfIfsError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new EcmwfIfsError("timeout", WEATHER_ERROR_MESSAGES.timeout);
      }
      throw new EcmwfIfsError("provider_error", "ECMWF Open Data could not be reached.");
    } finally {
      clearTimeout(timeout);
    }
  });
}

/** The ECMWF file URL for one run, one lead time and one file kind. */
function runFile(
  cycle: Cycle,
  step: number,
  resolution: EcmwfResolution,
  ext: "grib2" | "index",
): string {
  const { dir, fileSuffix } = RESOLUTIONS[resolution];
  return `${ROOT}/${cycle.date}/${cycle.cycle}z/ifs/${dir}/oper/${cycle.date}${cycle.cycle}0000-${step}h-oper-fc${fileSuffix}.${ext}`;
}

/**
 * Keep the index entries of the requested surface step.
 *
 * Entries with an implausible byte range are dropped rather than passed on:
 * a negative offset or a length beyond the size limit cannot describe a
 * field this adapter is willing to read.
 */
export function parseEcmwfIndex(text: string, requestedStep: number): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry: Partial<IndexEntry>;
    try {
      entry = JSON.parse(line) as Partial<IndexEntry>;
    } catch {
      continue;
    }
    if (entry.step !== String(requestedStep) || entry.levtype !== "sfc") continue;
    if (
      !entry.date ||
      !entry.time ||
      !entry.param ||
      !Number.isSafeInteger(entry._offset) ||
      !Number.isSafeInteger(entry._length)
    )
      continue;
    if (entry._offset! < 0 || entry._length! <= 0 || entry._length! > MAX_FIELD_BYTES) continue;
    entries.push(entry as IndexEntry);
  }
  return entries;
}

/** Read the index of one run and lead time. */
async function fetchIndex(
  cycle: Cycle,
  step: number,
  resolution: EcmwfResolution,
): Promise<IndexEntry[]> {
  const bytes = await fetchBounded(runFile(cycle, step, resolution, "index"), MAX_INDEX_BYTES);
  return parseEcmwfIndex(new TextDecoder().decode(bytes), step);
}

/**
 * The candidate runs, newest first.
 *
 * Every six-hourly boundary within the look-back window is a candidate. The
 * newest ones are frequently not published yet, which the probe discovers.
 */
function candidateCycles(now: Date): Cycle[] {
  const cycles: Cycle[] = [];
  const oldest = now.getTime() - CYCLE_LOOKBACK_HOURS * 3_600_000;
  for (let time = now.getTime(); time >= oldest; time -= 6 * 3_600_000) {
    const instant = new Date(time);
    const hour = instant.getUTCHours();
    const cycle = String(hour - (hour % 6)).padStart(2, "0");
    const date = instant.toISOString().slice(0, 10).replaceAll("-", "");
    if (!cycles.some((candidate) => candidate.date === date && candidate.cycle === cycle)) {
      cycles.push({ date, cycle });
    }
  }
  return cycles;
}

/** The issue time of a run, as an instant. */
function cycleIssueTime(cycle: Cycle): number {
  return Date.parse(
    `${cycle.date.slice(0, 4)}-${cycle.date.slice(4, 6)}-${cycle.date.slice(6, 8)}T${cycle.cycle}:00:00Z`,
  );
}

/**
 * Find the newest run that publishes both requested parameters.
 *
 * A run that is not up yet answers 404 and the next candidate is tried; any
 * other failure is reported, because it is not evidence that the run is
 * missing.
 */
async function selectAvailableCycle(now: Date, resolution: EcmwfResolution): Promise<Cycle> {
  const candidates = candidateCycles(now).slice(0, MAX_CYCLES_PROBED);
  for (const cycle of candidates) {
    try {
      const entries = await fetchIndex(cycle, 3, resolution);
      const wanted = Object.values(PARAMETERS).map((spec) => spec.indexParam);
      if (wanted.every((param) => entries.some((entry) => entry.param === param))) {
        return cycle;
      }
    } catch (error) {
      // A run that has not been published yet answers 404; anything else is
      // a real failure and is reported rather than silently skipped.
      if (error instanceof EcmwfIfsError && error.status === 404) continue;
      throw error;
    }
  }
  throw new EcmwfIfsError(
    "provider_error",
    "No recent ECMWF IFS run with both 2 m temperature and precipitation is available.",
  );
}

/** A decoded, validated field at the AOI's grid cell. */
interface DecodedField {
  /** The value in the parameter's own unit (K for 2t, m for tp). */
  value: number;
  /** The unit of `value`. */
  units: string;
  /** The centre of the grid cell that was sampled. */
  cellCenter: [number, number];
  /** The run's issue time, as an instant. */
  issueTime: number;
  /** The time the field is valid for, as an instant. */
  validTime: number;
}

/**
 * Check that a decoded message is the parameter, run and lead time asked for.
 *
 * Every check here is a refusal rather than a correction: a message that is
 * not what was requested is not usable, and silently accepting it would put a
 * value from the wrong field or the wrong run into the forecast.
 */
function assertFieldIsRequested(
  field: Awaited<ReturnType<typeof decodeGrib2Field>>,
  spec: ParameterSpec,
  step: number,
  expectedIssueTime: number,
  expectedValidTime: number,
): void {
  if (field.discipline !== spec.discipline) {
    throw new Error(`GRIB2 discipline ${field.discipline} does not match the requested parameter.`);
  }
  if (field.parameterCategory !== spec.category || field.parameterNumber !== spec.number) {
    throw new Error(
      `GRIB2 parameter ${field.parameterCategory}/${field.parameterNumber} does not match the requested parameter.`,
    );
  }
  if (field.localCentre !== spec.localCentre) {
    throw new Error("GRIB2 parameter does not come from the expected parameter table.");
  }
  if (field.productTemplate !== spec.productTemplate) {
    throw new Error(
      `GRIB2 product template ${field.productTemplate} does not match the requested parameter.`,
    );
  }
  if (Date.parse(field.referenceTime) !== expectedIssueTime) {
    throw new Error("GRIB2 reference time does not match the selected run.");
  }
  if (spec.accumulated) {
    const accumulation = field.statistics.find((step_) => step_.process === 1);
    if (!accumulation || accumulation.lengthUnit !== 1 || accumulation.length !== step) {
      throw new Error("GRIB2 message does not accumulate over the requested lead time.");
    }
    if (Date.parse(field.rangeEnd ?? "") !== expectedValidTime) {
      throw new Error("GRIB2 accumulation does not end at the requested valid time.");
    }
  } else {
    if (field.forecastHours !== step) {
      throw new Error("GRIB2 forecast step does not match the index record.");
    }
    if (field.rangeEnd !== null) {
      throw new Error("GRIB2 message is a time range, not a value at a single time.");
    }
  }
  // The decoder resolves units from the parameter tables it knows. ECMWF's
  // local table is not in every decoder, so an unresolved unit is accepted
  // here and the unit from the ECMWF parameter table is reported instead.
  if (field.units !== null && field.units !== spec.units) {
    throw new Error(`unexpected unit for ${spec.indexParam}: ${field.units}`);
  }
}

/**
 * Decode one field and sample it at the AOI's grid cell.
 */
async function decodeField(
  bytes: Uint8Array,
  param: "2t" | "tp",
  step: number,
  lon: number,
  lat: number,
  expectedIssueTime: number,
  expectedValidTime: number,
): Promise<DecodedField> {
  const spec = PARAMETERS[param];
  const field = await decodeSemaphore.run(() => decodeGrib2Field(bytes));
  assertFieldIsRequested(field, spec, step, expectedIssueTime, expectedValidTime);

  const cell: Grib2GridSelection = selectNearestGridCell(field.grid, lon, lat);
  if (cell.index >= field.values.length) {
    throw new Error("selected grid point is outside the decoded data array.");
  }
  if (field.mask[cell.index] !== 1) {
    throw new Error("selected grid point is missing from this field.");
  }
  const raw = field.values[cell.index];
  if (!Number.isFinite(raw)) {
    throw new Error("selected grid point did not decode to a number.");
  }
  if (raw < spec.plausible[0] || raw > spec.plausible[1]) {
    throw new Error(`decoded value is outside the plausible range for ${param}.`);
  }
  return {
    value: raw,
    units: spec.units,
    cellCenter: [cell.cellLongitude, cell.cellLatitude],
    issueTime: expectedIssueTime,
    validTime: expectedValidTime,
  };
}

/**
 * Fetch and decode one field of one lead time.
 *
 * The byte range comes from ECMWF's own index, so the request transfers the
 * field and nothing else.
 */
async function retrieveIndexedField(
  entries: IndexEntry[],
  cycle: Cycle,
  step: number,
  param: "2t" | "tp",
  resolution: EcmwfResolution,
  lon: number,
  lat: number,
  expectedIssueTime: number,
  expectedValidTime: number,
): Promise<DecodedField> {
  const entry = entries.find((item) => item.param === param);
  if (!entry) throw new Error(`ECMWF index has no ${param} field for step ${step}h.`);
  const start = entry._offset;
  const end = start + entry._length - 1;
  if (!Number.isSafeInteger(end) || end < start || entry._length > MAX_FIELD_BYTES) {
    throw new Error("ECMWF index byte range is invalid.");
  }
  const bytes = await fetchBounded(runFile(cycle, step, resolution, "grib2"), MAX_FIELD_BYTES, {
    start,
    end,
  });
  return decodeField(bytes, param, step, lon, lat, expectedIssueTime, expectedValidTime);
}

/**
 * Turn the number of decoded fields into a product status.
 *
 * A run where some fields decoded is `partial`, not `ok`: the forecast is
 * incomplete and the missing fields are listed.
 */
export function forecastStatusFromCounts(successes: number, total: number): WeatherStatus {
  if (successes === 0) return "unavailable";
  return successes === total ? "ok" : "partial";
}

/** The attribution shown next to ECMWF Open Data values. */
const ATTRIBUTION =
  "Contains modified Copernicus data. ECMWF Open Data IFS forecast, CC BY 4.0. https://www.ecmwf.int/en/forecasts/datasets/open-data";

/**
 * Retrieve the ECMWF Open Data IFS forecast for one sample AOI.
 *
 * Only the two fixed public sample AOIs may be requested; the provider sees
 * nothing but the centroid of one of them.
 */
export async function retrieveEcmwfIfsForecast(
  sampleId: string,
  resolution: EcmwfResolution = "0.1_deg",
): Promise<EcmwfIfsForecast> {
  const { descriptor, centroid } = resolveWeatherAoi(sampleId);
  const [lon, lat] = centroid;
  const gridResolutionDeg = RESOLUTIONS[resolution].degrees;

  const cycle = await selectAvailableCycle(new Date(), resolution);
  const issueTime = cycleIssueTime(cycle);
  const issueTimeIso = new Date(issueTime).toISOString();

  const frames: EcmwfForecastFrame[] = [];
  let successCount = 0;
  const total = FETCH_STEPS.length * 2;
  let sampledCell: [number, number] | null = null;

  // Lead times are independent of each other, so they are fetched in
  // parallel; the semaphore bounds how many requests are in flight.
  const stepFrames = await Promise.all(
    FETCH_STEPS.map(async (stepHours) => {
      const validTime = issueTime + stepHours * 3_600_000;
      const missingFields: string[] = [];
      let temperature2mC: number | null = null;
      let totalPrecipitationM: number | null = null;

      // One index per lead time: it states the byte range of every field in
      // that lead time's file, so both parameters are located from it.
      let entries: IndexEntry[];
      try {
        entries = await fetchIndex(cycle, stepHours, resolution);
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "The ECMWF index could not be read.";
        missingFields.push(`2t: ${reason}`, `tp: ${reason}`);
        return {
          stepHours,
          validTime: new Date(validTime).toISOString(),
          temperature2mC,
          totalPrecipitationM,
          windSpeed10mMs: null,
          missingFields,
        } satisfies EcmwfForecastFrame;
      }

      const outcomes = await Promise.all(
        (["2t", "tp"] as const).map(async (param) => {
          try {
            const field = await retrieveIndexedField(
              entries,
              cycle,
              stepHours,
              param,
              resolution,
              lon,
              lat,
              issueTime,
              validTime,
            );
            return { param, field } as const;
          } catch (error) {
            return { param, error } as const;
          }
        }),
      );

      for (const outcome of outcomes) {
        if ("error" in outcome) {
          const reason =
            outcome.error instanceof Error
              ? outcome.error.message
              : "The field could not be retrieved or decoded.";
          missingFields.push(`${outcome.param}: ${reason}`);
          continue;
        }
        successCount++;
        sampledCell ??= outcome.field.cellCenter;
        if (outcome.param === "2t") temperature2mC = outcome.field.value - 273.15;
        else totalPrecipitationM = outcome.field.value;
      }

      const frame: EcmwfForecastFrame = {
        stepHours,
        validTime: new Date(validTime).toISOString(),
        temperature2mC,
        totalPrecipitationM,
        windSpeed10mMs: null,
        missingFields,
      };
      return frame;
    }),
  );

  for (const frame of stepFrames) frames.push(frame);

  const status = forecastStatusFromCounts(successCount, total);
  const failedCount = total - successCount;
  const snapped = selectGridCell(lon, lat, gridResolutionDeg);
  const cellCenter = sampledCell ?? snapped.cellCenter ?? null;

  return {
    type: "ecmwf-ifs-forecast",
    source: "ECMWF Open Data IFS",
    attribution: ATTRIBUTION,
    retrievedAt: new Date().toISOString(),
    aoi: descriptor,
    gridCell: {
      method: `nearest ${gridResolutionDeg}° IFS grid point to AOI centroid (${lon.toFixed(4)}°, ${lat.toFixed(4)}°)`,
      gridResolutionDeg,
      cellCenter,
    },
    status,
    message:
      status === "ok"
        ? undefined
        : status === "partial"
          ? `${successCount} of ${total} requested temperature/precipitation values decoded; ${failedCount} are explicitly marked missing.`
          : "No forecast values could be decoded. See per-step field errors for the provider or decoding failure.",
    model: "ifs",
    resolution,
    issueTime: issueTimeIso,
    horizonHours: FETCH_STEPS.length * 3,
    steps: FETCH_STEPS,
    frames,
    caveats: [
      "Forecast model grid-cell values are not station observations or on-farm sensor readings.",
      "Temperature is converted from Kelvin to Celsius; total precipitation is metres accumulated from forecast initialization to each lead time.",
      "Forecast skill decreases with lead time. The endpoint is a rolling archive, not a historical forecast archive.",
      ...(status === "ok"
        ? []
        : [
            "Some requested fields or steps could not be retrieved or decoded; consult each frame's missingFields.",
          ]),
    ],
  };
}

/** Map a thrown value to a non-sensitive {code, message} error. */
export function toEcmwfError(error: unknown): WeatherError {
  if (error instanceof EcmwfIfsError) return { code: error.code, message: error.message };
  console.error("[ecmwf-ifs] unexpected error:", error instanceof Error ? error.name : "unknown");
  return { code: "internal", message: WEATHER_ERROR_MESSAGES.internal };
}
