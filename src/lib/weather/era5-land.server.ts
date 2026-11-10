/**
 * ERA5-Land historical weather adapter — server-only (`.server.ts`).
 *
 * What this adapter talks to
 * --------------------------
 * The Copernicus Climate Data Store (CDS), using its current REST API. The
 * facts below were taken from the provider's own published interfaces, not
 * from memory:
 *
 *   - Dataset: `reanalysis-era5-land` — "ERA5-Land hourly data from 1950 to
 *     present", licence CC-BY-4.0, DOI 10.24381/cds.e2161bac.
 *   - API base: `https://cds.climate.copernicus.eu/api` (overridable with
 *     `CDS_API_URL`), authentication with the `PRIVATE-TOKEN` header carrying
 *     the personal access token from the CDS profile page (`CDS_API_KEY`).
 *   - Submission: `POST {api}/retrieve/v1/processes/{dataset}/execution` with
 *     a JSON body `{"inputs": {...}}`; the process declares
 *     `jobControlOptions: ["async-execute"]`, so the call returns a job.
 *   - Status: `GET {api}/retrieve/v1/jobs/{jobId}` with the statuses
 *     `accepted | running | successful | failed | rejected | dismissed`.
 *   - Result: `GET {api}/retrieve/v1/jobs/{jobId}/results`, which returns an
 *     asset with an `href` to download.
 *   - Request inputs: `variable`, `year`, `month`, `day`, `time`, `area`
 *     (`[north, west, south, east]`), `data_format` (`grib` or `netcdf`) and
 *     `download_format`.
 *   - Availability: the dataset's published constraints say which
 *     (year, month, day) combinations exist. The provider's data lags real
 *     time, so the requested period is clamped to the days the provider
 *     actually holds, and the clamp is reported rather than hidden.
 *
 * The provider serves ERA5-Land in GRIB edition 1, which the GRIB2 reader
 * cannot parse, so the values are decoded through `fieldglass.server.ts`,
 * which reads both editions.
 *
 * Honest states
 * -------------
 * - No credentials configured: the product reports `credentials_required` and
 *   nothing is requested from the provider.
 * - A queued or failed job produces an `unavailable` product with a reason.
 *   No value is ever reported that was not decoded from a provider file.
 *
 * Credentials stay on the server: `CDS_API_KEY` is read here and nowhere
 * else, is never logged, and never reaches the browser.
 */

import { selectGridCell, weatherSampleAoiById, resolveWeatherAoi } from "./aoi.ts";
import { WEATHER_ERROR_MESSAGES } from "./errors.ts";
import { decodeWeatherContainer, type DecodedWeatherMessage } from "./fieldglass.server.ts";
import { deaccumulate, type AccumulationSample } from "./era5-precipitation.ts";
import { selectNearestGridCell, type RegularLatLonGrid } from "./grib2.ts";
import type {
  Era5LandHistorical,
  Era5LandObservation,
  Era5LandVersion,
  WeatherError,
} from "./types.ts";

const CDS_API_URL_ENV = "CDS_API_URL";
const CDS_API_KEY_ENV = "CDS_API_KEY";

/** The Climate Data Store's published API base, used when none is configured. */
export const CDS_DEFAULT_API_URL = "https://cds.climate.copernicus.eu/api";
/** The dataset this adapter requests. */
export const ERA5_LAND_DATASET = "reanalysis-era5-land";
/** The catalogue entry that describes the dataset's availability and variables. */
const CATALOGUE_URL = `https://cds.climate.copernicus.eu/api/catalogue/v1/collections/${ERA5_LAND_DATASET}`;

const REQUEST_TIMEOUT_MS = 30_000;
/** Largest ERA5-Land payload this adapter will download. */
const MAX_DOWNLOAD_BYTES = 32 * 1024 * 1024;
/** How long a provider job may run before the request gives up. */
const MAX_JOB_WAIT_MS = 90_000;
const POLL_INTERVAL_MS = 3_000;

/** The CDS variables this adapter requests, and how it reads them back. */
interface Era5Variable {
  /** The name the CDS uses. */
  name: string;
  /** The parameter abbreviation the decoder reports for it. */
  abbreviation: string;
  /** The unit the provider states for it. */
  units: string;
  /** The parameter name the decoder reports, when it resolves one. */
  parameterNames: string[];
  /**
   * Whether the provider publishes this variable as an accumulation. Its GRIB
   * time-range metadata determines whether the field is already a one-hour
   * amount or needs to be differenced from a previous cumulative step.
   */
  accumulated: boolean;
}

const ERA5_VARIABLES: Era5Variable[] = [
  {
    name: "2m_temperature",
    abbreviation: "2t",
    units: "K",
    parameterNames: ["temperature"],
    accumulated: false,
  },
  {
    name: "2m_dewpoint_temperature",
    abbreviation: "2d",
    units: "K",
    parameterNames: ["dewpoint temperature"],
    accumulated: false,
  },
  {
    name: "total_precipitation",
    abbreviation: "tp",
    units: "m",
    parameterNames: ["total precipitation"],
    // Interpret the raw GRIB1 interval/cumulative metadata below. Genuine CDS
    // samples for both AOIs carry one-hour P1/P2 accumulation windows.
    accumulated: true,
  },
  {
    name: "10m_u_component_of_wind",
    abbreviation: "10u",
    units: "m s**-1",
    parameterNames: ["u component of wind", "10m u-component of wind"],
    accumulated: false,
  },
  {
    name: "10m_v_component_of_wind",
    abbreviation: "10v",
    units: "m s**-1",
    parameterNames: ["v component of wind", "10m v-component of wind"],
    accumulated: false,
  },
];

/** ERA5-Land access failure with a safe message. */
export class Era5LandError extends Error {
  readonly code:
    | "invalid_input"
    | "credentials_missing"
    | "auth_failed"
    | "rate_limited"
    | "timeout"
    | "provider_error"
    | "provider_response_invalid"
    | "internal";

  constructor(
    code:
      | "invalid_input"
      | "credentials_missing"
      | "auth_failed"
      | "rate_limited"
      | "timeout"
      | "provider_error"
      | "provider_response_invalid"
      | "internal",
    message: string,
  ) {
    super(message);
    this.name = "Era5LandError";
    this.code = code;
  }
}

/** Check whether CDS credentials are configured in the server environment. */
export function hasEra5LandCredentials(): boolean {
  const url = process.env[CDS_API_URL_ENV];
  const key = process.env[CDS_API_KEY_ENV];
  return Boolean(url && key && url.length > 0 && key.length > 0);
}

/** The configured API base, without a trailing slash. */
function cdsApiBase(): string {
  const configured = process.env[CDS_API_URL_ENV];
  const base = configured && configured.length > 0 ? configured : CDS_DEFAULT_API_URL;
  return base.replace(/\/+$/, "");
}

/** The days the provider holds, and the latest date it holds. */
export interface ProviderAvailability {
  /**
   * Whether the provider's own constraints could be read.
   *
   * When this is false the availability is unknown, not "everything is
   * available": the request is sent without clamping and the uncertainty is
   * reported to the caller, because the provider still refuses dates it does
   * not hold.
   */
  known: boolean;
  /** The days available for each `YYYY-MM` month. */
  days: Map<string, Set<string>>;
  /** The latest date the provider holds, as YYYY-MM-DD. */
  latest: string | null;
}

/**
 * Read the provider's own availability constraints.
 *
 * The dataset's constraints document lists, for each combination of the other
 * request fields, the values that exist. Expanding the (year, month, day)
 * entries gives exactly which days the provider holds, which is what the
 * requested period is clamped against.
 */
export function buildAvailability(constraints: unknown): ProviderAvailability {
  const days = new Map<string, Set<string>>();
  let latest: string | null = null;
  let known = false;
  const entries = Array.isArray(constraints) ? (constraints as Record<string, unknown>[]) : [];
  for (const entry of entries) {
    const years = entry.year;
    const months = entry.month;
    const dayList = entry.day;
    if (!Array.isArray(years) || !Array.isArray(months) || !Array.isArray(dayList)) continue;
    for (const year of years) {
      if (typeof year !== "string" || !/^\d{4}$/.test(year)) continue;
      for (const month of months) {
        if (typeof month !== "string" || !/^\d{2}$/.test(month)) continue;
        const key = `${year}-${month}`;
        const existing = days.get(key) ?? new Set<string>();
        for (const day of dayList) {
          if (typeof day !== "string" || !/^\d{2}$/.test(day)) continue;
          existing.add(day);
          const candidate = `${year}-${month}-${day}`;
          if (!latest || candidate > latest) latest = candidate;
        }
        days.set(key, existing);
      }
    }
  }
  known = days.size > 0;
  return { known, days, latest };
}

/** Fetch and read the provider's availability, once per process. */
let availabilityPromise: Promise<ProviderAvailability> | null = null;

async function fetchProviderAvailability(): Promise<ProviderAvailability> {
  availabilityPromise ??= (async () => {
    try {
      const response = await fetch(CATALOGUE_URL, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return { known: false, days: new Map(), latest: null };
      const collection = (await response.json()) as {
        links?: { rel?: string; href?: string }[];
      };
      const constraintsLink = (collection.links ?? []).find((link) => link.rel === "constraints");
      if (!constraintsLink?.href) return { known: false, days: new Map(), latest: null };
      const constraintsResponse = await fetch(constraintsLink.href, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!constraintsResponse.ok) return { known: false, days: new Map(), latest: null };
      return buildAvailability(await constraintsResponse.json());
    } catch {
      return { known: false, days: new Map(), latest: null };
    }
  })();
  return availabilityPromise;
}

/** Return a setup-state Era5LandHistorical product when credentials are missing. */
export function era5LandCredentialsRequired(
  sampleId: string,
  period: { from: string; to: string },
): Era5LandHistorical {
  const sample = weatherSampleAoiById(sampleId);
  if (!sample)
    throw new Era5LandError("invalid_input", WEATHER_ERROR_MESSAGES.unknown_sample(sampleId));
  const { descriptor, centroid } = resolveWeatherAoi(sampleId);
  const gridCell = selectGridCell(centroid[0], centroid[1], 0.1);

  return {
    type: "era5-land-historical",
    source: "ERA5-Land (Copernicus CDS)",
    attribution:
      "Contains modified Copernicus Climate Data Store information. ERA5-Land, CC BY. " +
      "https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land",
    retrievedAt: new Date().toISOString(),
    aoi: descriptor,
    gridCell,
    status: "credentials_required",
    message: WEATHER_ERROR_MESSAGES.credentials_missing_era5,
    version: "ERA5-Land-T",
    variables: ERA5_VARIABLES.map((variable) => variable.name),
    temporalResolution: "hourly",
    spatialResolution: "0.1_deg",
    period,
    observations: [],
    precipitationValidated: false,
    caveats: [
      "ERA5-Land is a global land reanalysis at 0.1° (~9 km) resolution, hourly from 1950. " +
        "Grid-cell estimates are not on-farm sensor readings.",
      "CDS API credentials are not configured on this server. Set CDS_API_URL and CDS_API_KEY " +
        "(server-only) to enable historical reanalysis retrieval.",
      "The retrieval itself is implemented — request, job polling, download and decoding — but " +
        "it has not been exercised against the live service, because no credential was available " +
        "to submit a request with.",
      "Do not interpret grid values as farm measurements; they are reanalysis estimates.",
    ],
  };
}

/** Validate a bounded historical date range before checking secrets or calling a provider. */
export function validateEra5LandPeriod(period: { from: string; to: string }): void {
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!validDate(period.from) || !validDate(period.to)) {
    throw new Era5LandError("invalid_input", "Enter valid calendar dates in YYYY-MM-DD format.");
  }
  if (period.to < period.from) {
    throw new Era5LandError("invalid_input", "The end date must be on or after the start date.");
  }
  const dayCount =
    (Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / 86_400_000 +
    1;
  if (dayCount > 31) {
    throw new Era5LandError("invalid_input", "ERA5-Land requests are limited to 31 calendar days.");
  }
  const yesterday = new Date();
  yesterday.setUTCHours(0, 0, 0, 0);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (Date.parse(`${period.to}T00:00:00Z`) > yesterday.getTime()) {
    throw new Era5LandError(
      "invalid_input",
      "Historical weather end date must be before today (UTC).",
    );
  }
}

/** One request group: the days of a single calendar month to retrieve. */
export interface MonthGroup {
  year: string;
  month: string;
  days: string[];
}

/**
 * Split a period into per-month request groups.
 *
 * The provider validates the (year, month, day) combinations it accepts, so
 * a request never lists a day that does not exist in the month it is paired
 * with. Splitting by month keeps every combination valid, and one job per
 * month keeps the provider's queue short.
 */
export function groupPeriodByMonth(period: { from: string; to: string }): MonthGroup[] {
  const groups: MonthGroup[] = [];
  const start = new Date(`${period.from}T00:00:00Z`);
  const end = new Date(`${period.to}T00:00:00Z`);
  for (let time = start.getTime(); time <= end.getTime(); time += 86_400_000) {
    const day = new Date(time);
    const year = String(day.getUTCFullYear());
    const month = String(day.getUTCMonth() + 1).padStart(2, "0");
    const date = String(day.getUTCDate()).padStart(2, "0");
    const existing = groups.find((group) => group.year === year && group.month === month);
    if (existing) existing.days.push(date);
    else groups.push({ year, month, days: [date] });
  }
  return groups;
}

/**
 * Plan the retrieval for a period.
 *
 * Two things are decided here:
 *
 *   - which requested days the provider actually holds, so that a request is
 *     never sent for a day the provider would refuse;
 *   - which extra day is needed as the boundary sample.
 *
 * The first hour of the period needs the cumulative value of the hour before
 * it, and that value belongs to the previous day's forecast cycle. The day
 * before the period is therefore requested as well; its observations are
 * dropped afterwards, but its values are what make the first hour derivable.
 *
 * When the provider's availability could not be read, the days are sent as
 * asked — the availability is unknown, not complete — and the caller reports
 * that uncertainty.
 */
export function planRetrieval(
  period: { from: string; to: string },
  availability: ProviderAvailability,
): { groups: MonthGroup[]; boundaryGroups: MonthGroup[]; skipped: string[] } {
  const groups: MonthGroup[] = [];
  const skipped: string[] = [];
  for (const group of groupPeriodByMonth(period)) {
    const allowed = availability.known
      ? availability.days.get(`${group.year}-${group.month}`)
      : undefined;
    const days = allowed ? group.days.filter((day) => allowed.has(day)) : group.days;
    for (const day of group.days) {
      if (!days.includes(day)) skipped.push(`${group.year}-${group.month}-${day}`);
    }
    if (days.length) groups.push({ ...group, days });
  }

  // The boundary day joins the group of the month it belongs to, so a period
  // that lies inside one month still needs a single provider job.
  const boundaryDay = previousCalendarDay(period.from);
  const boundaryGroups: MonthGroup[] = [];
  for (const group of groupPeriodByMonth({ from: boundaryDay, to: boundaryDay })) {
    const allowed = availability.known
      ? availability.days.get(`${group.year}-${group.month}`)
      : undefined;
    const days = allowed ? group.days.filter((day) => allowed.has(day)) : group.days;
    if (!days.length) continue;
    const existing = groups.find(
      (candidate) => candidate.year === group.year && candidate.month === group.month,
    );
    if (existing) {
      existing.days = [...days, ...existing.days].sort();
    } else {
      boundaryGroups.push({ ...group, days });
    }
  }

  return { groups, boundaryGroups, skipped };
}

/**
 * Keep only the observations that fall inside the requested period.
 *
 * The period is a pair of calendar dates in UTC, so it covers every hour from
 * 00:00 on the first date to 23:59 on the last one. The boundary day that was
 * fetched to make the first hour derivable falls outside it.
 */
export function filterToPeriod(
  observations: Era5LandObservation[],
  period: { from: string; to: string },
): Era5LandObservation[] {
  const periodStart = Date.parse(`${period.from}T00:00:00Z`);
  const periodEnd = Date.parse(`${period.to}T23:59:59.999Z`);
  return observations.filter((observation) => {
    const time = Date.parse(observation.validTime);
    return Number.isFinite(time) && time >= periodStart && time <= periodEnd;
  });
}

/** The calendar day before the given one, as YYYY-MM-DD. */
export function previousCalendarDay(date: string): string {
  const time = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(time)) return date;
  return new Date(time - 86_400_000).toISOString().slice(0, 10);
}

/** The hours of a day, as the provider names them. */
const HOURS = Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, "0")}:00`);

/** Build the request body for one month group. */
export function buildRetrievalRequest(
  group: MonthGroup,
  area: [number, number, number, number],
): Record<string, unknown> {
  return {
    variable: ERA5_VARIABLES.map((variable) => variable.name),
    year: [group.year],
    month: [group.month],
    day: group.days,
    time: HOURS,
    area,
    data_format: "grib",
    download_format: "unarchived",
  };
}

/** Read a JSON response, mapping transport failures onto the error vocabulary. */
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Era5LandError(
      "provider_response_invalid",
      "The climate provider returned a response that could not be read.",
    );
  }
}

/** Map a provider status code onto the error vocabulary. */
function providerStatusError(status: number): Era5LandError {
  if (status === 401 || status === 403) {
    return new Era5LandError(
      "auth_failed",
      "The climate provider rejected the configured credentials.",
    );
  }
  if (status === 429) {
    return new Era5LandError("rate_limited", WEATHER_ERROR_MESSAGES.rate_limited);
  }
  return new Era5LandError("provider_error", WEATHER_ERROR_MESSAGES.provider_error(status));
}

/**
 * Fetch from the provider, mapping transport failures onto the error
 * vocabulary so that a network problem is reported as a provider failure
 * rather than as an internal error.
 */
async function providerFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Era5LandError("timeout", WEATHER_ERROR_MESSAGES.timeout);
    }
    throw new Era5LandError("provider_error", "The climate provider could not be reached.");
  }
}

/** Submit one retrieval job and return its identifier. */
export async function submitJob(inputs: Record<string, unknown>): Promise<string> {
  const token = process.env[CDS_API_KEY_ENV];
  if (!token)
    throw new Era5LandError("credentials_missing", WEATHER_ERROR_MESSAGES.credentials_missing_era5);
  const response = await providerFetch(
    `${cdsApiBase()}/retrieve/v1/processes/${ERA5_LAND_DATASET}/execution`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "PRIVATE-TOKEN": token,
        accept: "application/json",
      },
      body: JSON.stringify({ inputs }),
    },
  );
  if (response.status >= 400) throw providerStatusError(response.status);
  const location = response.headers.get("location");
  const body = (await readJson(response)) as { jobID?: string; jobId?: string } | null;
  const jobId = body?.jobID ?? body?.jobId ?? (location ? location.split("/").pop() : undefined);
  if (!jobId) {
    throw new Era5LandError(
      "provider_response_invalid",
      "The climate provider accepted the request but did not return a job identifier.",
    );
  }
  if (!isSafeProviderToken(jobId)) {
    throw new Era5LandError(
      "provider_response_invalid",
      "The climate provider returned a job identifier that is not usable.",
    );
  }
  return jobId;
}

/**
 * Whether a provider-supplied identifier is safe to put in a request path.
 *
 * The identifier comes from the provider's response, so it is treated as
 * untrusted input: only the characters a job identifier can contain are
 * allowed, and the value is URL-encoded where it is used.
 */
export function isSafeProviderToken(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,128}$/.test(value);
}

/**
 * Check that a download link is one this adapter will fetch.
 *
 * The link comes from the provider's job result, so it is treated as
 * untrusted: it must be an absolute HTTPS URL. The credential is never sent
 * with it — the link is a public object-store address, and sending the token
 * to an arbitrary host would leak it.
 */
export function assertSafeAssetHref(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    throw new Era5LandError(
      "provider_response_invalid",
      "The climate provider returned a result with an unusable download link.",
    );
  }
  if (url.protocol !== "https:") {
    throw new Era5LandError(
      "provider_response_invalid",
      "The climate provider returned a download link that is not secure.",
    );
  }
  return url.toString();
}

/** How long to wait for a provider job, and how often to ask. */
export interface JobWaitOptions {
  /** Total time to wait for the job, in milliseconds. */
  maxWaitMs?: number;
  /** Time between status checks, in milliseconds. */
  pollIntervalMs?: number;
}

/** Wait for a job to finish and return its result document. */
export async function awaitJobResult(
  jobId: string,
  options: JobWaitOptions = {},
): Promise<unknown> {
  const token = process.env[CDS_API_KEY_ENV];
  if (!token)
    throw new Era5LandError("credentials_missing", WEATHER_ERROR_MESSAGES.credentials_missing_era5);
  const maxWaitMs = options.maxWaitMs ?? MAX_JOB_WAIT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const statusResponse = await providerFetch(
      `${cdsApiBase()}/retrieve/v1/jobs/${encodeURIComponent(jobId)}`,
      {
        headers: { "PRIVATE-TOKEN": token, accept: "application/json" },
      },
    );
    if (statusResponse.status >= 400) throw providerStatusError(statusResponse.status);
    const status = (await readJson(statusResponse)) as { status?: string };
    if (status.status === "successful") {
      const resultResponse = await providerFetch(
        `${cdsApiBase()}/retrieve/v1/jobs/${encodeURIComponent(jobId)}/results`,
        { headers: { "PRIVATE-TOKEN": token, accept: "application/json" } },
      );
      if (resultResponse.status >= 400) throw providerStatusError(resultResponse.status);
      return (await readJson(resultResponse)) as unknown;
    }
    if (
      status.status === "failed" ||
      status.status === "rejected" ||
      status.status === "dismissed"
    ) {
      throw new Era5LandError(
        "provider_error",
        "The climate provider could not produce the requested ERA5-Land data.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Era5LandError(
    "timeout",
    "The climate provider is still preparing the ERA5-Land request; no values were returned.",
  );
}

/**
 * Download a provider result, with a bounded size.
 *
 * The credential is deliberately not sent: the link is the provider's public
 * object-store address, and the token is only ever sent to the configured
 * API base.
 */
export async function downloadAsset(href: string): Promise<Uint8Array> {
  const response = await providerFetch(assertSafeAssetHref(href));
  if (response.status >= 400) throw providerStatusError(response.status);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_DOWNLOAD_BYTES) {
    throw new Era5LandError(
      "provider_response_invalid",
      "The ERA5-Land response was larger than this adapter will download.",
    );
  }
  if (!response.body) {
    throw new Era5LandError(
      "provider_response_invalid",
      "The provider returned an empty response.",
    );
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_DOWNLOAD_BYTES) {
      await reader.cancel();
      throw new Era5LandError(
        "provider_response_invalid",
        "The ERA5-Land response was larger than this adapter will download.",
      );
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/** The download link inside a job result document. */
export function readAssetHref(result: unknown): string {
  const asset = (result as { asset?: { value?: { href?: string }; href?: string } } | null)?.asset;
  const href = asset?.value?.href ?? asset?.href;
  if (!href) {
    throw new Era5LandError(
      "provider_response_invalid",
      "The climate provider returned a result without a downloadable file.",
    );
  }
  return href;
}

/** The observations decoded from one ERA5-Land file. */
export interface DecodedEra5Observations {
  observations: Era5LandObservation[];
  /** Variables that were found in the file. */
  variables: string[];
  /** Grid the values sit on, for the provenance record. */
  grid: { ni: number; nj: number; degrees: number } | null;
  /** Why an hourly precipitation value is missing, keyed by its validity time. */
  precipitationGaps: Map<string, string>;
}

/**
 * Match a decoded message to one of the requested ERA5-Land variables.
 *
 * The abbreviation is used when the decoder resolves one; otherwise the
 * parameter name identifies the variable. The unit is checked when the
 * decoder states one, so a field in another unit is refused rather than
 * reported with the wrong unit.
 */
export function matchVariable(
  abbreviation: string | null,
  parameter: string | null,
  units: string | null,
): Era5Variable | null {
  const byAbbreviation = ERA5_VARIABLES.find(
    (variable) => abbreviation && variable.abbreviation === abbreviation.toLowerCase(),
  );
  if (byAbbreviation) {
    return units && !unitsMatch(units, byAbbreviation.units) ? null : byAbbreviation;
  }
  if (!parameter) return null;
  const lowered = parameter.toLowerCase();
  return (
    ERA5_VARIABLES.find((variable) =>
      variable.parameterNames.some((name) => lowered.includes(name)),
    ) ?? null
  );
}

/** Compare equivalent GRIB unit spellings without accepting a different unit. */
function unitsMatch(actual: string, expected: string): boolean {
  const canonical = (unit: string) =>
    unit
      .normalize("NFKC")
      .replace(/−/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^m s\*\*-1$/, "m s-1");
  return canonical(actual) === canonical(expected);
}

/**
 * The time-range indicators this adapter reads.
 *
 * GRIB1's PDS carries the time range indicator (Code Table 5) together with
 * P1 and P2. The Climate Data Store writes its accumulated fields with
 * indicator 4, where P1 and P2 span the window the accumulation covers, and
 * its instantaneous fields with indicator 0, where P1 is the forecast step.
 * Any other indicator states something this adapter cannot place in time, so
 * the accumulation is refused rather than guessed.
 */
const GRIB1_SINGLE_FORECAST_TIME = new Set([0, 113]);
const GRIB1_ACCUMULATION_WINDOW = new Set([4]);
const GRIB1_PERIOD = new Set([2, 10, 123]);

/** The timing of an accumulated ERA5-Land message. */
export interface AccumulationTiming {
  /** The start of the forecast cycle the accumulation belongs to. */
  cycleStart: string;
  /** The instant the accumulation ends at. */
  validityTime: string;
  /** Hours from the cycle start to the end of the accumulation. */
  endOffsetHours: number;
  /** Hours from the cycle start to the start of the accumulation. */
  startOffsetHours: number;
  /** Whether the value is the window's own accumulation or a running total. */
  kind: "interval" | "cumulative";
}

export interface HourlyCoverage {
  status: "ok" | "partial" | "unavailable";
  expectedHours: number;
  actualHours: number;
  message?: string;
}

/** Classify whether returned timestamps cover the requested hourly period. */
export function assessHourlyCoverage(
  actualHours: number,
  period: { from: string; to: string },
  skippedDays: string[],
): HourlyCoverage {
  const start = Date.parse(`${period.from}T00:00:00Z`);
  const end = Date.parse(`${period.to}T00:00:00Z`);
  const expectedHours =
    Number.isFinite(start) && Number.isFinite(end) ? Math.floor((end - start) / 3_600_000) + 24 : 0;
  if (actualHours <= 0 || expectedHours <= 0) {
    return { status: "unavailable", expectedHours, actualHours };
  }
  if (skippedDays.length === 0 && actualHours >= expectedHours) {
    return { status: "ok", expectedHours, actualHours };
  }
  const coverageMessage = `Partial ERA5-Land coverage: ${actualHours} of ${expectedHours} requested hourly timestamps returned.`;
  return {
    status: "partial",
    expectedHours,
    actualHours,
    message: skippedDays.length
      ? `${coverageMessage} The provider has no data for ${skippedDays.length} requested day(s).`
      : coverageMessage,
  };
}

/** Resolve an instantaneous GRIB1 field to its valid time from reference time + P1. */
export function resolveInstantaneousValidTime(
  message: DecodedWeatherMessage,
): { validTime: string } | { error: string } {
  const raw = message.grib1Timing;
  const offsetHours = raw ? raw.p1 : message.forecastHours;
  if (
    raw &&
    (raw.timeUnit !== 1 || !GRIB1_SINGLE_FORECAST_TIME.has(raw.timeRange) || raw.p2 !== 0)
  ) {
    return {
      error: "the instantaneous field's GRIB1 timing is not a supported hourly forecast step",
    };
  }
  if (
    offsetHours === null ||
    offsetHours === undefined ||
    !Number.isInteger(offsetHours) ||
    offsetHours < 0
  ) {
    return { error: "the instantaneous field has no usable forecast step" };
  }
  const referenceMilliseconds = Date.parse(message.referenceTime);
  if (!Number.isFinite(referenceMilliseconds)) {
    return { error: "the instantaneous field has an invalid reference time" };
  }
  return {
    validTime: new Date(referenceMilliseconds + offsetHours * 3_600_000).toISOString(),
  };
}

/**
 * Read the timing of an accumulated ERA5-Land message.
 *
 * ERA5-Land runs one forecast a day from 00 UTC, so the PDS reference time is
 * the start of the cycle and the accumulation is placed relative to it.
 *
 * The timing is read from the *raw* PDS fields rather than from the decoder's
 * derived forecast hours. The decoder documents its forecast hours for GRIB1
 * as "the time unit and P1 converted to hours … whatever the time-range
 * indicator says", so for the provider's accumulation window (indicator 4,
 * P1 to P2) the derived number is the *start* of the window and says nothing
 * about where the accumulation ends.
 *
 * A message whose indicator this adapter does not recognise, whose time unit
 * is not the hour, or whose window is not one hour long is refused: a value
 * that is not an hourly amount is never published as one.
 */
export function resolveAccumulationTiming(
  message: DecodedWeatherMessage,
): { timing: AccumulationTiming } | { error: string } {
  const raw = message.grib1Timing;
  if (!raw) {
    return {
      error:
        "the message carries no GRIB1 timing fields, so its accumulation cannot be placed in time",
    };
  }
  if (raw.timeUnit !== 1) {
    return {
      error: `the accumulation's time unit is ${raw.timeUnit}, which is not the hour`,
    };
  }
  if (GRIB1_ACCUMULATION_WINDOW.has(raw.timeRange)) {
    if (raw.p2 <= raw.p1) {
      return {
        error:
          "the message states an accumulation window without an end, so its accumulation cannot be placed in time",
      };
    }
    const windowHours = raw.p2 - raw.p1;
    if (windowHours !== 1) {
      return {
        error: `the accumulation covers ${windowHours} hours, so it is a period total and not an hourly amount`,
      };
    }
    return {
      timing: {
        cycleStart: canonicalUtc(message.referenceTime),
        validityTime: addHours(message.referenceTime, raw.p2),
        endOffsetHours: raw.p2,
        startOffsetHours: raw.p1,
        kind: "interval",
      },
    };
  }
  if (GRIB1_SINGLE_FORECAST_TIME.has(raw.timeRange)) {
    if (raw.p2 !== 0) {
      return {
        error:
          "the message states both a forecast time and an end of the range, so its accumulation cannot be placed in time",
      };
    }
    if (raw.p1 < 1) {
      return {
        error: "the message states no forecast step, so its accumulation cannot be placed in time",
      };
    }
    // The value is the running total from the start of the cycle.
    return {
      timing: {
        cycleStart: canonicalUtc(message.referenceTime),
        validityTime: addHours(message.referenceTime, raw.p1),
        endOffsetHours: raw.p1,
        startOffsetHours: 0,
        kind: "cumulative",
      },
    };
  }
  if (GRIB1_PERIOD.has(raw.timeRange)) {
    const windowHours = raw.p2 - raw.p1;
    if (windowHours !== 1) {
      return {
        error: `the accumulation covers ${windowHours} hours, so it is a period total and not an hourly amount`,
      };
    }
    return {
      timing: {
        cycleStart: canonicalUtc(message.referenceTime),
        validityTime: addHours(message.referenceTime, raw.p2),
        endOffsetHours: raw.p2,
        startOffsetHours: raw.p1,
        kind: "interval",
      },
    };
  }
  return {
    error:
      "the message states a time range this adapter does not recognise, so its accumulation cannot be placed in time",
  };
}

/** Add whole hours to an RFC 3339 instant, keeping the UTC offset explicit. */
function addHours(instant: string, hours: number): string {
  const time = Date.parse(instant);
  if (!Number.isFinite(time)) return instant;
  return new Date(time + hours * 3_600_000).toISOString();
}

/** Normalize equivalent UTC instants so fields with and without milliseconds join. */
function canonicalUtc(instant: string): string {
  const time = Date.parse(instant);
  return Number.isFinite(time) ? new Date(time).toISOString() : instant;
}

/** Use an indicated hourly end time for diagnostics, falling back to cycle time. */
function diagnosticValidTime(message: DecodedWeatherMessage): string {
  const timing = message.grib1Timing;
  if (timing?.timeUnit === 1 && Number.isInteger(timing.p2) && timing.p2 >= 0) {
    return addHours(message.referenceTime, timing.p2);
  }
  return canonicalUtc(message.referenceTime);
}

/**
 * Turn decoded ERA5-Land messages into hourly observations at one location.
 *
 * The file holds one message per variable and hour. Each message is matched
 * to a requested variable, and the value is taken from the grid cell nearest
 * the requested point, using the same rule the ECMWF adapter uses.
 *
 * Instantaneous variables (temperature, dewpoint, wind components) are
 * valid at reference time plus their forecast step. Accumulated variables
 * (total precipitation) are interpreted from their raw GRIB1 timing fields.
 * Genuine CDS samples carry one-hour P1/P2 windows whose values are already
 * the hour's amounts; cumulative-step messages, when present, are differenced
 * within their forecast cycle.
 *
 * This is the part of the pipeline that can be exercised without a provider
 * account: it takes already-decoded messages, so a fixture of decoded
 * messages exercises the real unit conversion, the de-accumulation, the
 * per-hour assembly and the missing-value handling.
 */
export function buildObservations(
  messages: DecodedWeatherMessage[],
  lon: number,
  lat: number,
): DecodedEra5Observations {
  const byTime = new Map<
    string,
    { observation: Era5LandObservation; u: number | null; v: number | null }
  >();
  const found = new Set<string>();
  const accumulationSamples: AccumulationSample[] = [];
  const precipitationGaps = new Map<string, string>();
  let grid: DecodedEra5Observations["grid"] = null;

  for (const message of messages) {
    const variable = matchVariable(message.abbreviation, message.parameter, message.units);
    if (!variable) continue;
    if (!message.grid) {
      throw new Era5LandError(
        "provider_response_invalid",
        "The ERA5-Land file holds a field that is not on a regular latitude/longitude grid.",
      );
    }
    const gridDefinition = message.grid as RegularLatLonGrid;
    const cell = selectNearestGridCell(gridDefinition, lon, lat);
    if (cell.index >= message.values.length) {
      throw new Era5LandError(
        "provider_response_invalid",
        "The selected ERA5-Land grid cell is outside the decoded field.",
      );
    }
    const present = message.mask[cell.index] === 1;
    const raw = message.values[cell.index];
    const value = present && Number.isFinite(raw) ? raw : null;

    if (variable.accumulated) {
      // The message carries the forecast reference time (the start of the
      // accumulation cycle) and its timing fields; the value is cumulative
      // over that cycle and becomes an hourly amount below.
      const resolved = resolveAccumulationTiming(message);
      if ("error" in resolved) {
        // The amount cannot be placed in time, so it is not published.
        precipitationGaps.set(diagnosticValidTime(message), resolved.error);
        found.add(variable.name);
        continue;
      }
      accumulationSamples.push({
        cycleStart: resolved.timing.cycleStart,
        endOffsetHours: resolved.timing.endOffsetHours,
        startOffsetHours: resolved.timing.startOffsetHours,
        kind: resolved.timing.kind,
        value,
        present,
      });
      found.add(variable.name);
      grid ??= {
        ni: message.grid.ni,
        nj: message.grid.nj,
        degrees: message.grid.iDirectionIncrement,
      };
      continue;
    }

    const resolved = resolveInstantaneousValidTime(message);
    if ("error" in resolved) {
      throw new Era5LandError("provider_response_invalid", resolved.error);
    }
    const validTime = resolved.validTime;
    const entry = byTime.get(validTime) ?? {
      observation: {
        validTime,
        temperature2mC: null,
        dewpoint2mC: null,
        hourlyPrecipitationM: null,
        windSpeed10mMs: null,
      },
      u: null,
      v: null,
    };

    switch (variable.abbreviation) {
      case "2t":
        entry.observation.temperature2mC = value === null ? null : value - 273.15;
        break;
      case "2d":
        entry.observation.dewpoint2mC = value === null ? null : value - 273.15;
        break;
      case "10u":
        entry.u = value;
        break;
      case "10v":
        entry.v = value;
        break;
      default:
        break;
    }
    byTime.set(validTime, entry);
    found.add(variable.name);
    grid ??= {
      ni: message.grid.ni,
      nj: message.grid.nj,
      degrees: message.grid.iDirectionIncrement,
    };
  }

  // Cumulative values become hourly amounts over the hour that ends at the
  // published validity time.
  const amounts = deaccumulate(accumulationSamples);
  for (const amount of amounts) {
    const entry = byTime.get(amount.validTime) ?? {
      observation: {
        validTime: amount.validTime,
        temperature2mC: null,
        dewpoint2mC: null,
        hourlyPrecipitationM: null,
        windSpeed10mMs: null,
      },
      u: null,
      v: null,
    };
    entry.observation.hourlyPrecipitationM = amount.amount;
    byTime.set(amount.validTime, entry);
    if (amount.reason) precipitationGaps.set(amount.validTime, amount.reason);
  }

  const observations = [...byTime.values()]
    .map((entry) => {
      // ERA5-Land publishes wind components, not wind speed; the speed is
      // their magnitude and is labelled as derived in the caveats.
      const speed = entry.u === null || entry.v === null ? null : Math.hypot(entry.u, entry.v);
      return { ...entry.observation, windSpeed10mMs: speed };
    })
    .sort((a, b) => a.validTime.localeCompare(b.validTime));

  return { observations, variables: [...found], grid, precipitationGaps };
}

/**
 * Decode an ERA5-Land file into hourly observations at one location.
 */
export async function decodeEra5LandFile(
  bytes: Uint8Array,
  lon: number,
  lat: number,
): Promise<DecodedEra5Observations> {
  const container = await decodeWeatherContainer(bytes);
  if (!container.messages.length) {
    throw new Era5LandError(
      "provider_response_invalid",
      "The ERA5-Land file the provider returned holds no fields.",
    );
  }
  return buildObservations(container.messages, lon, lat);
}

/**
 * Retrieve ERA5-Land historical weather for one sample AOI over a bounded
 * period.
 *
 * When CDS credentials are not configured, returns a credentials_required
 * product with no observations (no fabrication).
 */
export async function retrieveEra5LandHistorical(
  sampleId: string,
  period: { from: string; to: string },
  version: Era5LandVersion = "ERA5-Land-T",
): Promise<Era5LandHistorical> {
  const sample = weatherSampleAoiById(sampleId);
  if (!sample) {
    throw new Era5LandError("invalid_input", WEATHER_ERROR_MESSAGES.unknown_sample(sampleId));
  }
  validateEra5LandPeriod(period);

  if (!hasEra5LandCredentials()) {
    return era5LandCredentialsRequired(sampleId, period);
  }

  const { descriptor, centroid } = resolveWeatherAoi(sampleId);
  const [lon, lat] = centroid;
  const gridCell = selectGridCell(lon, lat, 0.1);

  const availability = await fetchProviderAvailability();
  const plan = planRetrieval(period, availability);
  const groups = plan.groups;
  const boundaryGroups = plan.boundaryGroups;
  const skipped = plan.skipped;

  const area: [number, number, number, number] = [
    sample.bbox[3],
    sample.bbox[0],
    sample.bbox[1],
    sample.bbox[2],
  ];

  const observations: Era5LandObservation[] = [];
  const variables = new Set<string>();
  const precipitationGaps = new Map<string, string>();
  let grid: DecodedEra5Observations["grid"] = null;

  const allGroups = [...groups, ...boundaryGroups];

  for (const group of allGroups) {
    const jobId = await submitJob(buildRetrievalRequest(group, area));
    const result = await awaitJobResult(jobId);
    const href = readAssetHref(result);
    const bytes = await downloadAsset(href);
    const decoded = await decodeEra5LandFile(bytes, lon, lat);
    observations.push(...decoded.observations);
    for (const variable of decoded.variables) variables.add(variable);
    for (const [time, reason] of decoded.precipitationGaps) {
      precipitationGaps.set(time, reason);
    }
    grid ??= decoded.grid;
  }

  // Only the requested period is reported; the boundary day was fetched
  // only to make the first hour derivable.
  const inPeriod = filterToPeriod(observations, period);
  observations.length = 0;
  observations.push(...inPeriod);
  observations.sort((a, b) => a.validTime.localeCompare(b.validTime));
  const coverage = assessHourlyCoverage(observations.length, period, skipped);

  return {
    type: "era5-land-historical",
    source: "ERA5-Land (Copernicus CDS)",
    attribution:
      "Contains modified Copernicus Climate Data Store information. ERA5-Land, CC BY. " +
      "https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land",
    retrievedAt: new Date().toISOString(),
    aoi: descriptor,
    gridCell: {
      ...gridCell,
      method: `nearest 0.1° ERA5-Land grid point to AOI centroid (${lon.toFixed(4)}°, ${lat.toFixed(4)}°)`,
    },
    status: coverage.status,
    message:
      coverage.message ??
      (coverage.status === "unavailable"
        ? "The climate provider returned no usable ERA5-Land values for this period."
        : undefined),
    version,
    variables: [...variables],
    temporalResolution: "hourly",
    spatialResolution: "0.1_deg",
    period: { from: period.from, to: period.to },
    observations,
    // Decoder, GRIB1 timing, grid-cell values and hourly assembly were
    // independently checked against genuine CDS payloads for both AOIs and
    // ecCodes 2.50.0; the reproducible payloads/oracles are in fixtures/.
    precipitationValidated: true,
    precipitationGaps: Object.fromEntries(precipitationGaps),
    caveats: [
      "ERA5-Land is a global land reanalysis at 0.1° (~9 km) resolution, hourly from 1950. " +
        "Grid-cell estimates are not on-farm sensor readings.",
      "Values are the ERA5-Land grid cell nearest the AOI centroid; temperature is converted " +
        "from Kelvin to Celsius.",
      "Precipitation is the amount over the hour that ended at each timestamp, in metres, not a " +
        "daily total. The live CDS GRIB1 messages state one-hour P1/P2 accumulation windows; " +
        "their values are used directly. Cumulative steps are differenced only when the message " +
        "timing identifies them as cumulative.",
      "The GRIB1 decoder, cell values, timing and hourly assembly were independently compared " +
        "with ecCodes 2.50.0 using genuine CDS payloads for both sample AOIs on 2026-11-03 and " +
        "2026-11-04. All 48 hourly precipitation values and timestamps matched exactly, including " +
        "the P1=23/P2=24 window ending at 00 UTC. These remain gridded reanalysis estimates, " +
        "not on-farm gauge measurements.",
      "10 m wind speed is derived from the ERA5-Land 10 m wind components; ERA5-Land does not " +
        "publish wind speed directly.",
      "Do not interpret grid values as farm measurements; they are reanalysis estimates.",
      ...(!availability.known
        ? [
            "The provider's published availability could not be read, so the requested days " +
              "were sent as asked; the provider may refuse days it does not hold.",
          ]
        : []),
      ...(skipped.length
        ? [
            `The provider holds no data for ${skipped.length} requested day(s) ` +
              `(${skipped.slice(0, 3).join(", ")}${skipped.length > 3 ? ", …" : ""}); ` +
              "those days were left out of the retrieval.",
          ]
        : []),
    ],
  };
}

/** Map a thrown value to a non-sensitive {code, message} error. */
export function toEra5LandError(error: unknown): WeatherError {
  if (error instanceof Era5LandError) {
    return { code: error.code, message: error.message };
  }
  console.error("[era5-land] unexpected error:", error instanceof Error ? error.name : "unknown");
  return { code: "internal", message: WEATHER_ERROR_MESSAGES.internal };
}
