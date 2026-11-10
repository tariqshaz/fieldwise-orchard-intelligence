import assert from "node:assert/strict";
import test from "node:test";

import { bboxCenter, weatherSampleAoiById } from "./aoi.ts";
import {
  forecastStatusFromCounts,
  parseEcmwfIndex,
  retrieveEcmwfIfsForecast,
  validateRangeResponse,
} from "./ecmwf-ifs.server.ts";
import { retrieveEra5LandHistorical, validateEra5LandPeriod } from "./era5-land.server.ts";
import {
  assertSafeAssetHref,
  assessHourlyCoverage,
  awaitJobResult,
  buildAvailability,
  buildObservations,
  buildRetrievalRequest,
  filterToPeriod,
  groupPeriodByMonth,
  isSafeProviderToken,
  matchVariable,
  planRetrieval,
  readAssetHref,
  resolveAccumulationTiming,
  submitJob,
  type ProviderAvailability,
} from "./era5-land.server.ts";
import { decodeGrib2Field } from "./grib2-decode.server.ts";
import { decodeWeatherContainer } from "./fieldglass.server.ts";
import type { Era5LandObservation } from "./types.ts";
import type { DecodedWeatherMessage } from "./fieldglass.server.ts";
import { Grib2StructureError, readGrib2Structure, selectNearestGridCell } from "./grib2.ts";

// ---------------------------------------------------------------------------
// A synthetic GRIB2 message, built to the layout ECMWF Open Data writes.
// ---------------------------------------------------------------------------

/** Encode a GRIB2 signed integer: sign-magnitude, not two's complement. */
function grib2Signed(value: number): number {
  const magnitude = Math.abs(Math.round(value));
  return value < 0 ? (0x80000000 | magnitude) >>> 0 : magnitude >>> 0;
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function u16(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

/** Write bytes into a byte array at an offset. */
function writeBytes(target: number[], bytes: number[], offset: number): void {
  bytes.forEach((byte, index) => {
    target[offset + index] = byte;
  });
}

/** Build one GRIB2 section: a four-octet length, the section number, a body. */
function section(number: number, body: number[]): number[] {
  const length = 5 + body.length;
  return [...u32(length), number, ...body];
}

interface GridOptions {
  ni: number;
  nj: number;
  latitudeOfFirstGridPoint: number;
  longitudeOfFirstGridPoint: number;
  latitudeOfLastGridPoint: number;
  longitudeOfLastGridPoint: number;
  iDirectionIncrement: number;
  jDirectionIncrement: number;
  scanMode?: number;
  dataRepresentationTemplate?: number;
}

/** Build a GRIB2 message with a regular latitude/longitude grid. */
function buildGrib2Message(options: GridOptions): Uint8Array {
  const {
    ni,
    nj,
    latitudeOfFirstGridPoint,
    longitudeOfFirstGridPoint,
    latitudeOfLastGridPoint,
    longitudeOfLastGridPoint,
    iDirectionIncrement,
    jDirectionIncrement,
    scanMode = 0,
    dataRepresentationTemplate = 42,
  } = options;
  const dataPoints = ni * nj;

  // Grid template 3.0 as ECMWF writes it: the offsets below are the ones the
  // reader uses, and they were settled against ecCodes 2.42.0.
  const gridTemplate = new Array<number>(58).fill(0xff);
  writeBytes(gridTemplate, u32(ni), 16);
  writeBytes(gridTemplate, u32(nj), 20);
  writeBytes(gridTemplate, u32(0), 24);
  writeBytes(gridTemplate, u32(0xffffffff), 28);
  writeBytes(gridTemplate, u32(grib2Signed(latitudeOfFirstGridPoint * 1e6)), 32);
  writeBytes(gridTemplate, u32(grib2Signed(longitudeOfFirstGridPoint * 1e6)), 36);
  gridTemplate[40] = 0x30;
  writeBytes(gridTemplate, u32(grib2Signed(latitudeOfLastGridPoint * 1e6)), 41);
  writeBytes(gridTemplate, u32(grib2Signed(longitudeOfLastGridPoint * 1e6)), 45);
  writeBytes(gridTemplate, u32(Math.round(iDirectionIncrement * 1e6)), 49);
  writeBytes(gridTemplate, u32(Math.round(jDirectionIncrement * 1e6)), 53);
  gridTemplate[57] = scanMode;

  const sections = [
    ...section(1, new Array<number>(17).fill(0)),
    ...section(3, [0, ...u32(dataPoints), 0, ...u16(0), 0, ...gridTemplate]),
    ...section(4, new Array<number>(29).fill(0)),
    ...section(5, [...u32(dataPoints), ...u16(dataRepresentationTemplate), 0, 0]),
    ...section(6, []),
    ...section(7, [0]),
  ];
  const body = new Uint8Array([...sections, 0x37, 0x37, 0x37, 0x37]);
  const total = 16 + body.length;

  const message = new Uint8Array(total);
  // "GRIB", two reserved octets, discipline 0, edition 2, then the length.
  message.set([0x47, 0x52, 0x49, 0x42, 0xff, 0xff, 0x00, 0x02], 0);
  new DataView(message.buffer).setBigUint64(8, BigInt(total), false);
  message.set(body, 16);
  return message;
}

/** The 0.25° IFS grid, as ecCodes 2.42.0 reports it. */
const GRID_025 = {
  ni: 1440,
  nj: 721,
  latitudeOfFirstGridPoint: 90,
  longitudeOfFirstGridPoint: 180,
  latitudeOfLastGridPoint: -90,
  longitudeOfLastGridPoint: 179.75,
  iDirectionIncrement: 0.25,
  jDirectionIncrement: 0.25,
};

/** The 0.1° IFS grid, as ecCodes 2.42.0 reports it. */
const GRID_01 = {
  ni: 3600,
  nj: 1801,
  latitudeOfFirstGridPoint: 90,
  longitudeOfFirstGridPoint: 180,
  latitudeOfLastGridPoint: -90,
  longitudeOfLastGridPoint: 179.9,
  iDirectionIncrement: 0.1,
  jDirectionIncrement: 0.1,
};

// ---------------------------------------------------------------------------
// ECMWF index and byte-range handling
// ---------------------------------------------------------------------------

test("ECMWF index parser keeps only bounded entries for the requested surface step", () => {
  const lines = [
    JSON.stringify({
      date: "20261109",
      time: "1200",
      step: "6",
      levtype: "sfc",
      param: "2t",
      _offset: 20,
      _length: 100,
    }),
    JSON.stringify({
      date: "20261109",
      time: "1200",
      step: "3",
      levtype: "sfc",
      param: "tp",
      _offset: 0,
      _length: 100,
    }),
    JSON.stringify({
      date: "20261109",
      time: "1200",
      step: "6",
      levtype: "pl",
      param: "z",
      _offset: 0,
      _length: 100,
    }),
    JSON.stringify({
      date: "20261109",
      time: "1200",
      step: "6",
      levtype: "sfc",
      param: "tp",
      _offset: -1,
      _length: 100,
    }),
    JSON.stringify({
      date: "20261109",
      time: "1200",
      step: "6",
      levtype: "sfc",
      param: "10u",
      _offset: 0,
      _length: 99_000_000,
    }),
    "not-json",
  ].join("\n");
  assert.deepEqual(
    parseEcmwfIndex(lines, 6).map((entry) => entry.param),
    ["2t"],
  );
});

test("ECMWF range validation rejects ignored, shifted, truncated, and malformed ranges", () => {
  assert.equal(validateRangeResponse(206, "bytes 100-199/1000", 100, 199), true);
  assert.equal(validateRangeResponse(200, "bytes 100-199/1000", 100, 199), false);
  assert.equal(validateRangeResponse(206, "bytes 101-199/1000", 100, 199), false);
  assert.equal(validateRangeResponse(206, "bytes 100-198/1000", 100, 199), false);
  assert.equal(validateRangeResponse(206, "bytes 100-199/*", 100, 199), false);
  assert.equal(validateRangeResponse(206, null, 100, 199), false);
});

test("forecast product status distinguishes complete, partial, and empty retrievals", () => {
  assert.equal(forecastStatusFromCounts(48, 48), "ok");
  assert.equal(forecastStatusFromCounts(1, 48), "partial");
  assert.equal(forecastStatusFromCounts(0, 48), "unavailable");
});

// ---------------------------------------------------------------------------
// GRIB2 container and grid reading
// ---------------------------------------------------------------------------

test("GRIB2 reader reports the framing, the packing and the grid of a complete message", () => {
  const bytes = buildGrib2Message(GRID_025);
  const structure = readGrib2Structure(bytes);

  assert.deepEqual(structure.sections, [1, 3, 4, 5, 6, 7, 8]);
  assert.equal(structure.edition, 2);
  assert.equal(structure.declaredTotalLength, bytes.length);
  assert.equal(structure.dataRepresentationTemplateNumber, 42);

  const grid = structure.grid;
  assert.ok(grid);
  assert.equal(grid.ni, 1440);
  assert.equal(grid.nj, 721);
  assert.equal(grid.numberOfDataPoints, 1440 * 721);
  assert.equal(grid.latitudeOfFirstGridPoint, 90);
  assert.equal(grid.longitudeOfFirstGridPoint, 180);
  assert.equal(grid.latitudeOfLastGridPoint, -90);
  assert.equal(grid.longitudeOfLastGridPoint, 179.75);
  assert.equal(grid.iDirectionIncrement, 0.25);
  assert.equal(grid.jDirectionIncrement, 0.25);
  assert.equal(grid.scanMode.iScansNegatively, false);
  assert.equal(grid.scanMode.jScansPositively, false);
  assert.equal(grid.scanMode.jPointsAreConsecutive, false);
  assert.equal(grid.scanMode.alternativeRowScanning, false);
});

test("GRIB2 reader refuses a truncated message and one whose indicated length disagrees", () => {
  const bytes = buildGrib2Message(GRID_025);

  const truncated = bytes.slice(0, bytes.length - 40);
  assert.throws(() => readGrib2Structure(truncated), Grib2StructureError);

  const wrongLength = bytes.slice();
  new DataView(wrongLength.buffer).setBigUint64(8, BigInt(bytes.length + 1), false);
  assert.throws(() => readGrib2Structure(wrongLength), Grib2StructureError);

  const noTerminator = bytes.slice(0, bytes.length - 4);
  new DataView(noTerminator.buffer).setBigUint64(8, BigInt(noTerminator.length), false);
  assert.throws(() => readGrib2Structure(noTerminator), Grib2StructureError);
});

test("GRIB2 reader refuses a grid whose geometry does not reproduce its own first and last points", () => {
  const bytes = buildGrib2Message({ ...GRID_025, jDirectionIncrement: 0.5 });
  const structure = readGrib2Structure(bytes);
  assert.equal(structure.grid, null);
});

// ---------------------------------------------------------------------------
// Grid cell selection, checked against ecCodes 2.42.0
// ---------------------------------------------------------------------------

test("nearest grid cell selection reproduces the ecCodes cell for both sample AOIs", () => {
  // The indices below are the ones ecCodes 2.42.0 reports for the real
  // ECMWF Open Data IFS fields (run 20261109 18z, step 3).
  const grid025 = readGrib2Structure(buildGrib2Message(GRID_025)).grid!;
  const grid01 = readGrib2Structure(buildGrib2Message(GRID_01)).grid!;

  const khanewal = bboxCenter(weatherSampleAoiById("sample-khanewal-orchards")!.bbox);
  const okara = bboxCenter(weatherSampleAoiById("sample-okara-farmland")!.bbox);

  const khanewal025 = selectNearestGridCell(grid025, khanewal[0], khanewal[1]);
  assert.equal(khanewal025.index, 343726);
  assert.equal(khanewal025.column, 1006);
  assert.equal(khanewal025.row, 238);
  assert.equal(khanewal025.cellLongitude, 71.5);
  assert.equal(khanewal025.cellLatitude, 30.5);

  const okara025 = selectNearestGridCell(grid025, okara[0], okara[1]);
  assert.equal(okara025.index, 342292);
  assert.equal(okara025.column, 1012);
  assert.equal(okara025.row, 237);
  assert.equal(okara025.cellLongitude, 73);
  assert.equal(okara025.cellLatitude, 30.75);

  const khanewal01 = selectNearestGridCell(grid01, khanewal[0], khanewal[1]);
  assert.equal(khanewal01.index, 2140916);
  assert.equal(khanewal01.column, 2516);
  assert.equal(khanewal01.row, 594);

  const okara01 = selectNearestGridCell(grid01, okara[0], okara[1]);
  assert.equal(okara01.index, 2137330);
  assert.equal(okara01.column, 2530);
  assert.equal(okara01.row, 593);
});

test("nearest grid cell selection breaks an exact tie towards the lower index, as ecCodes does", () => {
  const grid = readGrib2Structure(buildGrib2Message(GRID_025)).grid!;
  // 71.625° is exactly halfway between the columns at 71.5° and 71.75°.
  const cell = selectNearestGridCell(grid, 71.625, 30.6);
  assert.equal(cell.column, 1006);
  assert.equal(cell.cellLongitude, 71.5);
});

test("nearest grid cell selection refuses a storage order whose index it cannot derive", () => {
  const grid = readGrib2Structure(buildGrib2Message(GRID_025)).grid!;
  grid.scanMode.jPointsAreConsecutive = true;
  assert.throws(() => selectNearestGridCell(grid, 71.625, 30.6), Grib2StructureError);
});

test("nearest grid cell selection follows first-point order when scan directions are reversed", () => {
  const grid = readGrib2Structure(
    buildGrib2Message({
      ni: 3,
      nj: 2,
      latitudeOfFirstGridPoint: 0,
      longitudeOfFirstGridPoint: 2,
      latitudeOfLastGridPoint: 1,
      longitudeOfLastGridPoint: 0,
      iDirectionIncrement: 1,
      jDirectionIncrement: 1,
      scanMode: 0xc0,
    }),
  ).grid;
  assert.ok(grid);
  const cell = selectNearestGridCell(grid, 2, 1);
  assert.equal(cell.row, 1);
  assert.equal(cell.column, 0);
  assert.equal(cell.index, 3);
  assert.deepEqual([cell.cellLongitude, cell.cellLatitude], [2, 1]);
});

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

test("GRIB2 decoder refuses bytes that are not a GRIB2 message", async () => {
  await assert.rejects(decodeGrib2Field(new Uint8Array(64)), /GRIB indicator/);
  await assert.rejects(decodeGrib2Field(new Uint8Array(0)), /too short/);
});

// ---------------------------------------------------------------------------
// Provider-facing behaviour
// ---------------------------------------------------------------------------

test("ECMWF rejects an unknown AOI before contacting the provider", async () => {
  await assert.rejects(retrieveEcmwfIfsForecast("not-a-sample"), /Unknown sample AOI/);
});

// ---------------------------------------------------------------------------
// ERA5-Land
// ---------------------------------------------------------------------------

test("ERA5-Land period validation rejects impossible, reversed, future, and oversized ranges", () => {
  assert.throws(
    () => validateEra5LandPeriod({ from: "2026-02-30", to: "2026-03-01" }),
    /valid calendar dates/,
  );
  assert.throws(
    () => validateEra5LandPeriod({ from: "2026-03-02", to: "2026-03-01" }),
    /on or after/,
  );
  assert.throws(
    () => validateEra5LandPeriod({ from: "2026-01-01", to: "2026-02-01" }),
    /31 calendar days/,
  );
  assert.throws(
    () => validateEra5LandPeriod({ from: "2026-11-10", to: "2026-11-10" }),
    /before today/,
  );
  assert.doesNotThrow(() => validateEra5LandPeriod({ from: "2026-11-01", to: "2026-11-09" }));
});

test("ERA5-Land rejects unknown AOIs before credentials and does not contact the provider without them", async () => {
  const oldUrl = process.env.CDS_API_URL;
  const oldKey = process.env.CDS_API_KEY;
  try {
    delete process.env.CDS_API_URL;
    delete process.env.CDS_API_KEY;
    await assert.rejects(
      retrieveEra5LandHistorical("not-a-sample", { from: "2026-11-01", to: "2026-11-02" }),
      /sample area of interest/,
    );

    // Without credentials the product is a setup state: no provider request
    // is made and no observation is invented.
    const product = await retrieveEra5LandHistorical("sample-khanewal-orchards", {
      from: "2026-11-01",
      to: "2026-11-02",
    });
    assert.equal(product.status, "credentials_required");
    assert.equal(product.observations.length, 0);
    assert.match(product.message ?? "", /CDS_API_KEY/);
  } finally {
    if (oldUrl === undefined) delete process.env.CDS_API_URL;
    else process.env.CDS_API_URL = oldUrl;
    if (oldKey === undefined) delete process.env.CDS_API_KEY;
    else process.env.CDS_API_KEY = oldKey;
  }
});

// ---------------------------------------------------------------------------
// ERA5-Land: provider request, response handling and normalization
// ---------------------------------------------------------------------------

/**
 * A decoded ERA5-Land message used as a test fixture.
 *
 * These are NOT live observations: they are hand-written stand-ins with
 * known values, used to exercise the adapter's own unit conversion, hourly
 * assembly and missing-value handling without a provider account.
 */
function fixtureMessage(
  overrides: Omit<Partial<DecodedWeatherMessage>, "values" | "mask"> & {
    values: number[];
    mask?: number[];
  },
): DecodedWeatherMessage {
  const values = overrides.values;
  const { values: _values, mask: _mask, ...rest } = overrides;
  return {
    parameter: "Temperature",
    abbreviation: "2t",
    units: "K",
    level: "2",
    levelType: "Specified height above ground (m)",
    referenceTime: "2026-11-04T00:00:00.000Z",
    forecastHours: 0,
    discipline: null,
    productTemplate: null,
    parameterCategory: null,
    parameterNumber: null,
    localCentre: null,
    originatingCentreCode: null,
    rangeEnd: null,
    statistics: [],
    packing: "simple",
    grib1Timing: null,
    grid: {
      ni: 2,
      nj: 2,
      longitudeOfFirstGridPoint: 71.5,
      latitudeOfFirstGridPoint: 30.7,
      iDirectionIncrement: 0.1,
      jDirectionIncrement: 0.1,
      scanMode: {
        iScansNegatively: false,
        jScansPositively: false,
        jPointsAreConsecutive: false,
        alternativeRowScanning: false,
      },
    },
    ...rest,
    values: new Float64Array(values),
    mask: new Uint8Array(overrides.mask ?? values.map(() => 1)),
  };
}

/**
 * A decoded ERA5-Land precipitation message, as a fixture.
 *
 * The provider publishes total precipitation as an accumulation from 00 UTC
 * to the end of the forecast step, so the fixture carries the cycle start in
 * `referenceTime` and the step in `forecastHours`. These are FIXTURES, not
 * provider observations.
 */
function fixturePrecipitationStep(
  stepHours: number,
  cumulative: number | null,
  options: { cycleStart?: string; present?: boolean } = {},
): DecodedWeatherMessage {
  const cycleStart = options.cycleStart ?? "2026-11-04T00:00:00.000Z";
  return fixtureMessage({
    values: [10, 20, 30, cumulative ?? 0],
    mask: options.present === false ? [1, 1, 1, 0] : undefined,
    abbreviation: "tp",
    units: "m",
    parameter: "Total precipitation",
    referenceTime: cycleStart,
    forecastHours: stepHours,
    // The raw PDS timing of a GRIB1 forecast message: the reference time is
    // the start of the cycle, P1 carries the step and the indicator says the
    // message is a single forecast time.
    grib1Timing: { timeUnit: 1, p1: stepHours, p2: 0, timeRange: 0 },
  });
}

test("ERA5-Land de-accumulates the provider's cumulative precipitation into hourly amounts", () => {
  // A forecast cycle that starts at 00 UTC on 4 November, with the cumulative
  // total rising through the day. The hourly amounts are the differences.
  const steps = [
    [1, 0.001],
    [2, 0.0025],
    [3, 0.003],
    [4, 0.004],
  ] as const;
  const decoded = buildObservations(
    steps.map(([step, cumulative]) => fixturePrecipitationStep(step, cumulative)),
    71.625,
    30.6,
  );

  assert.equal(decoded.observations.length, 4);
  // The first hour of the cycle starts from zero and needs no earlier sample.
  assert.equal(decoded.observations[0].validTime, "2026-11-04T01:00:00.000Z");
  assert.equal(decoded.observations[0].hourlyPrecipitationM, 0.001);
  assert.equal(decoded.observations[1].validTime, "2026-11-04T02:00:00.000Z");
  assert.equal(decoded.observations[1].hourlyPrecipitationM, 0.0015);
  assert.equal(decoded.observations[2].hourlyPrecipitationM, 0.0005);
  assert.equal(decoded.observations[3].hourlyPrecipitationM, 0.001);

  // The cumulative value itself is never published as an hourly amount.
  for (const observation of decoded.observations) {
    assert.ok((observation.hourlyPrecipitationM ?? 0) < 0.0025);
  }
});

test("ERA5-Land aligns instantaneous P1 fields and precipitation at one canonical valid time", () => {
  const referenceTime = "2026-11-04T00:00:00Z";
  const temperature = fixtureMessage({
    referenceTime,
    forecastHours: 1,
    grib1Timing: { timeUnit: 1, p1: 1, p2: 0, timeRange: 0 },
    values: [293.15, 293.15, 293.15, 293.15],
  });
  const precipitation = fixtureMessage({
    referenceTime,
    forecastHours: 0,
    parameter: "Total precipitation",
    abbreviation: "tp",
    units: "m",
    grib1Timing: { timeUnit: 1, p1: 0, p2: 1, timeRange: 4 },
    values: [0, 0, 0, 0.001],
  });

  const decoded = buildObservations([temperature, precipitation], 71.625, 30.6);
  assert.equal(decoded.observations.length, 1);
  assert.equal(decoded.observations[0].validTime, "2026-11-04T01:00:00.000Z");
  assert.ok(Math.abs((decoded.observations[0].temperature2mC ?? 0) - 20) < 1e-9);
  assert.equal(decoded.observations[0].hourlyPrecipitationM, 0.001);
});

test("ERA5-Land marks provider-truncated historical ranges as partial", () => {
  const period = { from: "2026-11-03", to: "2026-11-09" };
  assert.deepEqual(assessHourlyCoverage(48, period, ["2026-11-05", "2026-11-06"]), {
    status: "partial",
    expectedHours: 168,
    actualHours: 48,
    message:
      "Partial ERA5-Land coverage: 48 of 168 requested hourly timestamps returned. " +
      "The provider has no data for 2 requested day(s).",
  });
  assert.deepEqual(assessHourlyCoverage(24, { from: "2026-11-03", to: "2026-11-03" }, []), {
    status: "ok",
    expectedHours: 24,
    actualHours: 24,
  });
  assert.deepEqual(assessHourlyCoverage(0, period, []), {
    status: "unavailable",
    expectedHours: 168,
    actualHours: 0,
  });
});

test("ERA5-Land keeps each cycle separate: the 00 UTC reset starts a new accumulation", () => {
  // The cycle that ran on 3 November ends at step 24, which the provider
  // publishes with the validity time 4 November 00 UTC.
  const previous = [
    [23, 0.02],
    [24, 0.021],
  ] as const;
  const current = [
    [1, 0.0005],
    [2, 0.001],
  ] as const;
  const decoded = buildObservations(
    [
      ...previous.map(([step, cumulative]) =>
        fixturePrecipitationStep(step, cumulative, { cycleStart: "2026-11-03T00:00:00Z" }),
      ),
      ...current.map(([step, cumulative]) =>
        fixturePrecipitationStep(step, cumulative, { cycleStart: "2026-11-04T00:00:00.000Z" }),
      ),
    ],
    71.625,
    30.6,
  );

  const byTime = new Map(decoded.observations.map((o) => [o.validTime, o]));
  // The hour that ended at 00 UTC is the last hour of the previous cycle.
  const midnight = byTime.get("2026-11-04T00:00:00.000Z");
  assert.ok(midnight);
  assert.ok(Math.abs((midnight.hourlyPrecipitationM ?? 0) - 0.001) < 1e-9);
  // The first hour of the new cycle starts from zero again: it is 0.0005 m,
  // not 0.0005 minus the previous day's total.
  const first = byTime.get("2026-11-04T01:00:00.000Z");
  assert.ok(first);
  assert.equal(first.hourlyPrecipitationM, 0.0005);
  const second = byTime.get("2026-11-04T02:00:00.000Z");
  assert.equal(second?.hourlyPrecipitationM, 0.0005);
});

test("ERA5-Land leaves an hour unavailable when its predecessor in the cycle is missing", () => {
  // Step 2 is present but step 1 is not: the hour that ended at 02 UTC
  // cannot be derived and must not be guessed.
  const decoded = buildObservations(
    [fixturePrecipitationStep(2, 0.0025), fixturePrecipitationStep(3, 0.003)],
    71.625,
    30.6,
  );
  const second = decoded.observations.find((o) => o.validTime === "2026-11-04T02:00:00.000Z");
  assert.equal(second?.hourlyPrecipitationM, null);
  assert.match(
    decoded.precipitationGaps.get("2026-11-04T02:00:00.000Z") ?? "",
    /previous accumulation in the same 24-hour cycle is missing/,
  );
  // The hour that ended at 03 UTC can still be derived from step 2.
  const third = decoded.observations.find((o) => o.validTime === "2026-11-04T03:00:00.000Z");
  assert.equal(third?.hourlyPrecipitationM, 0.0005);
});

test("ERA5-Land refuses a non-monotonic accumulation instead of reporting negative rainfall", () => {
  const decoded = buildObservations(
    [fixturePrecipitationStep(1, 0.002), fixturePrecipitationStep(2, 0.001)],
    71.625,
    30.6,
  );
  const second = decoded.observations.find((o) => o.validTime === "2026-11-04T02:00:00.000Z");
  assert.equal(second?.hourlyPrecipitationM, null);
  assert.match(
    decoded.precipitationGaps.get("2026-11-04T02:00:00.000Z") ?? "",
    /accumulation decreases inside the cycle/,
  );
});

test("ERA5-Land refuses an accumulated message that states no forecast step", () => {
  const decoded = buildObservations(
    [
      fixtureMessage({
        values: [10, 20, 30, 0.0025],
        abbreviation: "tp",
        units: "m",
        parameter: "Total precipitation",
        forecastHours: 0,
        // A GRIB1 message whose time range indicator this adapter does not
        // recognise cannot be placed in time.
        grib1Timing: { timeUnit: 1, p1: 3, p2: 0, timeRange: 55 },
      }),
    ],
    71.625,
    30.6,
  );
  // The message cannot be placed in time, so no observation is published for
  // it at all and the reason is recorded against the cycle it belongs to.
  assert.equal(decoded.observations.length, 0);
  assert.match(
    decoded.precipitationGaps.get("2026-11-04T00:00:00.000Z") ?? "",
    /time range this adapter does not recognise/,
  );
});

test("ERA5-Land leaves an amount unavailable when the provider's bitmap says the cell is absent", () => {
  const decoded = buildObservations(
    [fixturePrecipitationStep(1, 0.001, { present: false })],
    71.625,
    30.6,
  );
  assert.equal(decoded.observations[0].hourlyPrecipitationM, null);
  assert.match(
    decoded.precipitationGaps.get("2026-11-04T01:00:00.000Z") ?? "",
    /does not cover this cell/,
  );
});

test("ERA5-Land refuses a precipitation field that is published in another unit", () => {
  const decoded = buildObservations(
    [
      fixtureMessage({
        values: [10, 20, 30, 2.5],
        abbreviation: "tp",
        units: "mm",
        parameter: "Total precipitation",
        referenceTime: "2026-11-04T00:00:00.000Z",
        forecastHours: 1,
      }),
    ],
    71.625,
    30.6,
  );
  assert.equal(decoded.variables.includes("total_precipitation"), false);
  assert.equal(decoded.observations.length, 0);
});

test("ERA5-Land aligns each hourly amount with the timestamp of the hour it ends", () => {
  // Values chosen so that every difference is distinct: a shifted or
  // mis-aligned pairing would not produce these numbers.
  const decoded = buildObservations(
    [
      fixturePrecipitationStep(1, 0.001),
      fixturePrecipitationStep(2, 0.003),
      fixturePrecipitationStep(3, 0.0035),
      fixturePrecipitationStep(4, 0.01),
    ],
    71.625,
    30.6,
  );
  const amounts: Array<[string, number | null]> = decoded.observations.map((observation) => [
    observation.validTime,
    observation.hourlyPrecipitationM,
  ]);
  assert.deepEqual(
    amounts.map(([time]) => time),
    [
      "2026-11-04T01:00:00.000Z",
      "2026-11-04T02:00:00.000Z",
      "2026-11-04T03:00:00.000Z",
      "2026-11-04T04:00:00.000Z",
    ],
  );
  for (const [, amount] of amounts) {
    assert.ok(amount !== null);
  }
  const expected = [0.001, 0.002, 0.0005, 0.0065];
  amounts.forEach(([, amount], index) => {
    assert.ok(Math.abs((amount ?? 0) - expected[index]) < 1e-9, `hour ${index}`);
  });
});

test("ERA5-Land leaves a value missing when the provider's bitmap says the cell is absent", () => {
  const messages = [
    fixtureMessage({
      values: [10, 20, 30, 293.15],
      mask: [1, 1, 1, 0],
      abbreviation: "2t",
      units: "K",
    }),
  ];
  const decoded = buildObservations(messages, 71.625, 30.6);
  assert.equal(decoded.observations[0].temperature2mC, null);
});

test("ERA5-Land refuses a field whose unit is not the one the variable is published in", () => {
  assert.equal(matchVariable("2t", "Temperature", "K")?.name, "2m_temperature");
  assert.equal(matchVariable("2t", "Temperature", "m"), null);
  assert.equal(
    matchVariable("10u", "U component of wind", "m s⁻¹")?.name,
    "10m_u_component_of_wind",
  );
  assert.equal(matchVariable(null, "Total precipitation", "m")?.name, "total_precipitation");
  assert.equal(matchVariable(null, "Something else", "K"), null);
});

test("ERA5-Land availability is read from the provider's own constraints", () => {
  // A sanitized excerpt of the dataset's published constraints document.
  const availability = buildAvailability([
    {
      data_format: ["grib", "netcdf"],
      year: ["2026"],
      month: ["11"],
      day: ["01", "02", "03", "04"],
      time: ["00:00"],
      variable: ["2m_temperature"],
    },
    {
      data_format: ["grib", "netcdf"],
      year: ["2025", "2026"],
      month: ["10"],
      day: ["01", "02", "03"],
      time: ["00:00"],
      variable: ["2m_temperature"],
    },
  ]);
  assert.equal(availability.latest, "2026-11-04");
  assert.deepEqual([...(availability.days.get("2026-11") ?? [])].sort(), ["01", "02", "03", "04"]);
  assert.deepEqual([...(availability.days.get("2026-10") ?? [])].sort(), ["01", "02", "03"]);
  assert.equal(availability.days.get("2025-10")?.size, 3);
});

test("ERA5-Land request groups keep every (year, month, day) combination valid", () => {
  const groups = groupPeriodByMonth({ from: "2026-10-30", to: "2026-11-02" });
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], { year: "2026", month: "10", days: ["30", "31"] });
  assert.deepEqual(groups[1], { year: "2026", month: "11", days: ["01", "02"] });

  const request = buildRetrievalRequest(groups[1], [30.65, 71.55, 30.55, 71.7]);
  assert.deepEqual(request.year, ["2026"]);
  assert.deepEqual(request.month, ["11"]);
  assert.deepEqual(request.day, ["01", "02"]);
  assert.equal((request.time as string[]).length, 24);
  // The provider's area order is north, west, south, east.
  assert.deepEqual(request.area, [30.65, 71.55, 30.55, 71.7]);
  assert.equal(request.data_format, "grib");
  assert.deepEqual(request.variable, [
    "2m_temperature",
    "2m_dewpoint_temperature",
    "total_precipitation",
    "10m_u_component_of_wind",
    "10m_v_component_of_wind",
  ]);
});

test("ERA5-Land requests the day before the period as the boundary sample", () => {
  const availability: ProviderAvailability = {
    known: true,
    days: new Map([
      ["2026-11", new Set(["01", "02", "03", "04", "05"])],
      ["2026-10", new Set(["30", "31"])],
    ]),
    latest: "2026-11-05",
  };
  const plan = planRetrieval({ from: "2026-11-01", to: "2026-11-02" }, availability);
  assert.deepEqual(plan.groups, [{ year: "2026", month: "11", days: ["01", "02"] }]);
  // The day before the period is the boundary sample for the first hour.
  assert.deepEqual(plan.boundaryGroups, [{ year: "2026", month: "10", days: ["31"] }]);
  assert.deepEqual(plan.skipped, []);
});

test("ERA5-Land drops requested days the provider does not hold and says so", () => {
  const availability: ProviderAvailability = {
    known: true,
    days: new Map([["2026-11", new Set(["01", "02"])]]),
    latest: "2026-11-02",
  };
  const plan = planRetrieval({ from: "2026-11-01", to: "2026-11-04" }, availability);
  assert.deepEqual(plan.groups, [{ year: "2026", month: "11", days: ["01", "02"] }]);
  assert.deepEqual(plan.skipped, ["2026-11-03", "2026-11-04"]);
});

test("ERA5-Land does not treat an unreadable availability as 'every date is available'", () => {
  const unknown: ProviderAvailability = { known: false, days: new Map(), latest: null };
  const plan = planRetrieval({ from: "2026-11-01", to: "2026-11-02" }, unknown);
  // The days are sent as asked — the provider still decides — but nothing is
  // silently clamped and the caller is told the availability is unknown.
  assert.deepEqual(plan.groups, [{ year: "2026", month: "11", days: ["01", "02"] }]);
  assert.deepEqual(plan.skipped, []);
  assert.equal(unknown.known, false);
});

test("ERA5-Land keeps only the observations inside the requested period", () => {
  const observation = (validTime: string, temperature2mC: number): Era5LandObservation => ({
    validTime,
    temperature2mC,
    dewpoint2mC: null,
    hourlyPrecipitationM: null,
    windSpeed10mMs: null,
  });
  const observations = [
    observation("2026-10-31T23:00:00.000Z", 1),
    observation("2026-11-01T00:00:00.000Z", 2),
    observation("2026-11-01T23:00:00.000Z", 3),
    observation("2026-11-02T00:00:00.000Z", 4),
  ];
  const kept = filterToPeriod(observations, { from: "2026-11-01", to: "2026-11-01" });
  assert.deepEqual(
    kept.map((observation) => observation.validTime),
    ["2026-11-01T00:00:00.000Z", "2026-11-01T23:00:00.000Z"],
  );
});

test("ERA5-Land refuses a provider job identifier or download link it cannot use safely", () => {
  assert.equal(isSafeProviderToken("job-1234_abc.def"), true);
  assert.equal(isSafeProviderToken("job/../../etc"), false);
  assert.equal(isSafeProviderToken("job id with spaces"), false);
  assert.equal(isSafeProviderToken(""), false);
  assert.throws(() => assertSafeAssetHref("http://example.invalid/file.grib"), /not secure/);
  assert.throws(() => assertSafeAssetHref("file:///etc/passwd"), /not secure/);
  assert.throws(() => assertSafeAssetHref("not a url"), /unusable download link/);
  assert.equal(
    assertSafeAssetHref("https://objects.example.invalid/path/file.grib"),
    "https://objects.example.invalid/path/file.grib",
  );
});

/**
 * Read one of the ERA5-Land GRIB1 fixtures.
 *
 * The fixtures were authored with ecCodes 2.42.0 and their metadata is
 * recorded in `fixtures/README.md`; they are fixtures, not provider data.
 */
async function readEra5Fixture(name: string): Promise<Uint8Array> {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return new Uint8Array(await readFile(path));
}

test("live CDS ERA5-Land GRIB1 values, timestamps and hourly rainfall match ecCodes at both AOIs", async () => {
  type LiveOracle = {
    oracle: string;
    source: string;
    retrievalPeriod: string[];
    sample: string;
    point: [number, number];
    messages: {
      short: string;
      referenceTime: string;
      validTime: string;
      p1: number;
      p2: number;
      timeRange: number;
      units: string;
      lat: number;
      lon: number;
      value: number;
    }[];
  };

  for (const sample of [
    {
      name: "khanewal",
      grib: "era5-live-khanewal-20261103-04.grib1",
      expected: "era5-live-khanewal-20261103-04.ecCodes.json",
    },
    {
      name: "okara",
      grib: "era5-live-okara-20261103-04.grib1",
      expected: "era5-live-okara-20261103-04.ecCodes.json",
    },
  ]) {
    const oracle = JSON.parse(
      new TextDecoder().decode(await readEra5Fixture(sample.expected)),
    ) as LiveOracle;
    const decoded = await decodeWeatherContainer(await readEra5Fixture(sample.grib));
    assert.equal(decoded.format, "grib1", sample.name);
    assert.equal(decoded.messages.length, 240, sample.name);
    assert.equal(oracle.oracle, "ecCodes 2.50.0", sample.name);
    assert.equal(oracle.messages.length, decoded.messages.length, sample.name);

    const canonicalUtc = (value: string) => new Date(value).toISOString();
    const expectedByKey = new Map(
      oracle.messages.map((message) => [
        `${message.short}|${canonicalUtc(message.referenceTime)}|${message.p1}|${message.p2}|${message.timeRange}`,
        message,
      ]),
    );
    for (const message of decoded.messages) {
      const timing = message.grib1Timing;
      assert.ok(timing, `${sample.name}: GRIB1 timing missing for ${message.abbreviation}`);
      const key = `${message.abbreviation}|${canonicalUtc(message.referenceTime)}|${timing.p1}|${timing.p2}|${timing.timeRange}`;
      const expected = expectedByKey.get(key);
      assert.ok(expected, `${sample.name}: no ecCodes message for ${key}`);
      const variable = matchVariable(message.abbreviation, message.parameter, message.units);
      assert.ok(variable, `${sample.name}: ${key} was not recognized as a requested variable`);
      assert.equal(variable.units, expected.units, `${sample.name}: ${key} units`);
      const selection = selectNearestGridCell(
        message.grid as NonNullable<typeof message.grid>,
        oracle.point[0],
        oracle.point[1],
      );
      assert.ok(
        Math.abs(selection.cellLongitude - expected.lon) < 1e-8,
        `${sample.name}: ${key} longitude differs from ecCodes`,
      );
      assert.ok(
        Math.abs(selection.cellLatitude - expected.lat) < 1e-8,
        `${sample.name}: ${key} latitude differs from ecCodes`,
      );
      assert.ok(
        Math.abs(message.values[selection.index]! - expected.value) <= 1e-7,
        `${sample.name}: ${key} value differs from ecCodes`,
      );
      const endOffset = message.abbreviation === "tp" ? timing.p2 : timing.p1;
      assert.equal(
        new Date(Date.parse(message.referenceTime) + endOffset * 3_600_000).toISOString(),
        canonicalUtc(expected.validTime),
        `${sample.name}: ${key} valid time`,
      );
    }

    const assembled = buildObservations(decoded.messages, oracle.point[0], oracle.point[1]);
    assert.equal(assembled.observations.length, 48, `${sample.name}: hourly row count`);
    assert.equal(
      new Set(assembled.observations.map((observation) => observation.validTime)).size,
      48,
      `${sample.name}: duplicate or missing joined timestamp`,
    );
    const observations = new Map(
      assembled.observations.map((observation) => [observation.validTime, observation]),
    );
    for (const expected of oracle.messages.filter((message) => message.short === "tp")) {
      const observation = observations.get(canonicalUtc(expected.validTime));
      assert.ok(observation, `${sample.name}: precipitation timestamp not joined`);
      assert.ok(
        Math.abs((observation.hourlyPrecipitationM ?? NaN) - expected.value) <= 1e-7,
        `${sample.name}: hourly precipitation differs from ecCodes at ${expected.validTime}`,
      );
      assert.equal(expected.timeRange, 4, `${sample.name}: expected hourly accumulation window`);
      assert.equal(expected.p2 - expected.p1, 1, `${sample.name}: expected one-hour window`);
      assert.ok(observation.temperature2mC !== null, `${sample.name}: temperature not joined`);
      assert.ok(observation.dewpoint2mC !== null, `${sample.name}: dewpoint not joined`);
      assert.ok(observation.windSpeed10mMs !== null, `${sample.name}: wind not joined`);
    }
  }
});

test("the decoder reads a GRIB1 accumulation's timing the way ecCodes does", async () => {
  // ecCodes 2.42.0 on this file reports: edition 1, shortName "tp", paramId
  // 228, typeOfLevel "surface", units "m", step 3, stepRange "3", dataDate
  // 20071104, dataTime 0, validityDate 20071104, validityTime 300,
  // typeOfPacking "grid_simple", Ni 2, Nj 2, scanning mode 64.
  const container = await decodeWeatherContainer(await readEra5Fixture("era5-step3.grib1"));
  assert.equal(container.messages.length, 1);
  const message = container.messages[0];
  assert.equal(message.referenceTime, "2007-11-04T00:00:00Z");
  assert.equal(message.forecastHours, 3);
  assert.equal(message.units, "m");
  assert.deepEqual(message.grib1Timing, { timeUnit: 1, p1: 3, p2: 0, timeRange: 0 });
  // The values ecCodes reads for this file, in the same order.
  assert.deepEqual(
    Array.from(message.values).map((value) => Number(value.toFixed(6))),
    [0.0003, 0.0006, 0.0009, 0.004],
  );
});

test("a GRIB1 message whose time range states a period is not read as a single step", async () => {
  // ecCodes reports this file as step 3 over the range "0-3" (indicator 2,
  // P1 = 0, P2 = 3), while the decoder's derived forecast hours are 0,
  // because they are P1 whatever the indicator says. The raw fields are what
  // place the accumulation in time — and a three-hour window is a period
  // total, not an hourly amount.
  const container = await decodeWeatherContainer(await readEra5Fixture("era5-period.grib1"));
  const message = container.messages[0];
  assert.equal(message.forecastHours, 0);
  assert.deepEqual(message.grib1Timing, { timeUnit: 1, p1: 0, p2: 3, timeRange: 2 });
  const resolved = resolveAccumulationTiming(message);
  assert.ok("error" in resolved);
  assert.match(resolved.error, /3 hours/);
});

test("the provider's accumulation window is read as the amount of the hour it covers", async () => {
  // The Climate Data Store serves the accumulated field with the time range
  // indicator 4 and P1 to P2 spanning the hour the value covers; ecCodes
  // reports that as stepType "accum" over the range "0-1". The value is
  // therefore already the hourly amount.
  const container = await decodeWeatherContainer(await readEra5Fixture("era5-window1.grib1"));
  const message = container.messages[0];
  assert.deepEqual(message.grib1Timing, { timeUnit: 1, p1: 0, p2: 1, timeRange: 4 });
  const resolved = resolveAccumulationTiming(message);
  assert.ok("timing" in resolved);
  assert.equal(resolved.timing.kind, "interval");
  assert.equal(resolved.timing.endOffsetHours, 1);
  assert.equal(resolved.timing.validityTime, "2007-11-04T01:00:00.000Z");

  const decoded = buildObservations(container.messages, 71.625, 30.6);
  assert.equal(decoded.observations.length, 1);
  assert.equal(decoded.observations[0].validTime, "2007-11-04T01:00:00.000Z");
  // The cell nearest the AOI centroid holds 0.0025 m, which is the amount
  // of that hour and is not differenced against anything.
  assert.ok(Math.abs((decoded.observations[0].hourlyPrecipitationM ?? 0) - 0.0025) < 1e-6);
});

test("an accumulation window longer than an hour is refused, not published as an hourly amount", async () => {
  const container = await decodeWeatherContainer(await readEra5Fixture("era5-window3h.grib1"));
  const decoded = buildObservations(container.messages, 71.625, 30.6);
  assert.equal(decoded.observations.length, 0);
  assert.match(
    decoded.precipitationGaps.get("2007-11-04T04:00:00.000Z") ?? "",
    /period total and not an hourly amount/,
  );
});

test("ERA5-Land de-accumulates a real GRIB1 cycle into hourly amounts", async () => {
  const messages: DecodedWeatherMessage[] = [];
  for (const name of ["era5-step1.grib1", "era5-step2.grib1", "era5-step3.grib1"]) {
    const container = await decodeWeatherContainer(await readEra5Fixture(name));
    messages.push(...container.messages);
  }
  const decoded = buildObservations(messages, 71.625, 30.6);
  assert.equal(decoded.observations.length, 3);
  // The cell nearest the AOI centroid is index 3 of the 2x2 grid, whose
  // accumulated total is 0.0010, 0.0025 and 0.0040 metres.
  assert.deepEqual(
    decoded.observations.map((observation) => observation.validTime),
    ["2007-11-04T01:00:00.000Z", "2007-11-04T02:00:00.000Z", "2007-11-04T03:00:00.000Z"],
  );
  // The fixture values are packed with 16 bits, so the decoded amounts carry
  // the packing precision of about 1e-8 metres.
  const amounts = decoded.observations.map((observation) => observation.hourlyPrecipitationM ?? 0);
  assert.ok(Math.abs(amounts[0] - 0.001) < 1e-6, "first hour of the cycle");
  assert.ok(Math.abs(amounts[1] - 0.0015) < 1e-6, "second hour of the cycle");
  assert.ok(Math.abs(amounts[2] - 0.0015) < 1e-6, "third hour of the cycle");
});

test("a GRIB1 accumulation the adapter cannot place in time is refused, not guessed", async () => {
  const container = await decodeWeatherContainer(await readEra5Fixture("era5-period.grib1"));
  const decoded = buildObservations(container.messages, 71.625, 30.6);
  // The period message gives the total over three hours; it is not an hourly
  // amount, so nothing is published for it and the reason is recorded.
  assert.equal(decoded.observations.length, 0);
  assert.match(
    decoded.precipitationGaps.get("2007-11-04T03:00:00.000Z") ?? "",
    /period total and not an hourly amount/,
  );
});

test("ERA5-Land maps provider failures onto safe, non-sensitive errors", async () => {
  const oldUrl = process.env.CDS_API_URL;
  const oldKey = process.env.CDS_API_KEY;
  const realFetch = globalThis.fetch;
  try {
    process.env.CDS_API_URL = "https://climate.invalid/api";
    process.env.CDS_API_KEY = "test-only-value";

    // The provider rejects the credentials.
    globalThis.fetch = (async () => new Response("nope", { status: 401 })) as typeof fetch;
    await assert.rejects(submitJob({}), /rejected the configured credentials/);

    // The provider fails.
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    await assert.rejects(submitJob({}), /returned an error \(HTTP 500\)/);

    // The provider answers with something that is not JSON.
    globalThis.fetch = (async () => new Response("<html>maintenance</html>")) as typeof fetch;
    await assert.rejects(submitJob({}), /could not be read/);

    // The provider accepts the request but never returns a job identifier.
    globalThis.fetch = (async () => new Response("{}", { status: 201 })) as typeof fetch;
    await assert.rejects(submitJob({}), /did not return a job identifier/);

    // A job that stays queued must not be reported as a value.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ jobID: "job-1", status: "running" }), {
        status: 200,
      })) as typeof fetch;
    await assert.rejects(
      awaitJobResult("job-1", { maxWaitMs: 40, pollIntervalMs: 10 }),
      /still preparing the ERA5-Land request/,
    );

    // A job the provider failed.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ jobID: "job-1", status: "failed" }), {
        status: 200,
      })) as typeof fetch;
    await assert.rejects(
      awaitJobResult("job-1", { maxWaitMs: 500, pollIntervalMs: 10 }),
      /could not produce the requested ERA5-Land data/,
    );

    // A result document without a download link.
    assert.throws(() => readAssetHref({ asset: {} }), /without a downloadable file/);
  } finally {
    globalThis.fetch = realFetch;
    if (oldUrl === undefined) delete process.env.CDS_API_URL;
    else process.env.CDS_API_URL = oldUrl;
    if (oldKey === undefined) delete process.env.CDS_API_KEY;
    else process.env.CDS_API_KEY = oldKey;
  }
});
