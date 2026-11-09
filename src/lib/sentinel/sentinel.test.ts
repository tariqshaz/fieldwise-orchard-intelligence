/**
 * Phase 2 acceptance tests for the Sentinel-2 observation slice.
 *
 * Pure-logic coverage only (no network): AOI bounds, date windows, the NDVI
 * mask/ramp/evalscript contract, and the sample-AOI labelling rules that keep
 * public reference areas from ever being presented as the user's farm.
 *
 * Run: npm run test:sentinel
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SENTINEL_LIMITS,
  SAMPLE_AOIS,
  SentinelInputError,
  assertAoiSpan,
  assertAoiVertexCount,
  bboxOfCoordinates,
  bboxSpanDeg,
  countGeometryVertices,
  geometryFromBbox,
  importedAoiDescriptor,
  metersPerPixelForBbox,
  previewSizeForBbox,
  sampleAoiById,
  statsResolutionForBbox,
  validateDateRange,
} from "./aoi.ts";
import { SENTINEL_ERROR_MESSAGES } from "./errors.ts";
import {
  EXCLUDED_SCL,
  MASK_RULES,
  NDVI_RAMP_STOPS,
  RETAINED_SCL,
  buildNdviPreviewEvalscript,
  buildNdviStatsEvalscript,
  excludedSclValues,
  ndviRampCssGradient,
  ndviToRgb,
  validPixelPct,
} from "./ndvi.ts";
import { validateStandaloneGeometry } from "../geospatial.ts";
import {
  PlanetaryComputerProviderError,
  buildMaskedNdviExpression,
  buildPreviewNdviExpression,
  buildTopSentinelExpression,
  debiasStatistics,
  deriveSamplePixelCounts,
  percentileFromBins,
  parseHistogram,
} from "./planetary-computer-adapter.server.ts";

// ---------------------------------------------------------------------------
// Sample AOIs: always labelled, never a "farm", within provider bounds
// ---------------------------------------------------------------------------

test("sample AOIs are labelled as samples and never claim to be a farm", () => {
  assert.ok(SAMPLE_AOIS.length >= 1);
  for (const sample of SAMPLE_AOIS) {
    assert.match(sample.label, /sample/i, `${sample.id} label must say "sample"`);
    assert.match(sample.description, /not a verified farm/i, `${sample.id} must disclaim`);
    assert.doesNotMatch(
      sample.description,
      /\byour farm\b/i,
      `${sample.id} must never be called the user's farm`,
    );
    assert.ok(sample.description.length > 40, `${sample.id} needs a full provenance sentence`);
  }
});

test("sample AOIs stay inside the provider request bounds", () => {
  for (const sample of SAMPLE_AOIS) {
    const span = bboxSpanDeg(sample.bbox);
    assert.ok(span.widthDeg > 0 && span.heightDeg > 0, `${sample.id} has a real extent`);
    assert.ok(span.widthDeg <= SENTINEL_LIMITS.maxAoiSpanDeg, `${sample.id} width within cap`);
    assert.ok(span.heightDeg <= SENTINEL_LIMITS.maxAoiSpanDeg, `${sample.id} height within cap`);
    const geometry = geometryFromBbox(sample.bbox);
    assert.ok(sampleAoiById(sample.id), "sample is retrievable by id");
    assert.equal(sampleAoiById(`${sample.id}-missing`), null);
    assert.equal(geometry.type, "Polygon");
  }
});

test("imported AOI descriptor names the import and keeps geometry private", () => {
  const descriptor = importedAoiDescriptor("bahria-estate.geojson");
  assert.equal(descriptor.kind, "imported-boundary");
  assert.match(descriptor.label, /bahria-estate\.geojson/);
  assert.match(descriptor.provenance, /imported boundary/i);
  assert.match(descriptor.provenance, /not stored by FieldWise/i);
});

// ---------------------------------------------------------------------------
// Date windows
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date("2026-06-15T12:00:00Z");

test("date range accepts a normal window and computes its length", () => {
  const result = validateDateRange("2026-05-01", "2026-06-01", FIXED_NOW);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.days, 31);
});

test("date range rejects malformed, inverted, future, pre-mission, and long windows", () => {
  const bad = [
    validateDateRange("2026-13-01", "2026-06-01", FIXED_NOW),
    validateDateRange("not-a-date", "2026-06-01", FIXED_NOW),
    validateDateRange("2026-02-30", "2026-06-01", FIXED_NOW),
    validateDateRange("2026-06-02", "2026-06-01", FIXED_NOW),
    validateDateRange("2026-06-01", "2026-07-01", FIXED_NOW),
    validateDateRange("2015-06-22", "2015-07-01", FIXED_NOW),
    validateDateRange("2025-01-01", "2025-09-01", FIXED_NOW), // > 180 days
  ];
  for (const result of bad) assert.equal(result.ok, false, JSON.stringify(result));
});

test("date range flags long windows as date_range_too_long and others as invalid_input", () => {
  const long = validateDateRange("2025-01-01", "2025-09-01", FIXED_NOW);
  assert.equal(long.ok, false);
  if (!long.ok) {
    assert.equal(long.code, "date_range_too_long");
    assert.equal(long.message, SENTINEL_ERROR_MESSAGES.date_too_long(243, 180));
  }
  const malformed = validateDateRange("2026-06-15", "2026-06-14", FIXED_NOW);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.code, "invalid_input");
});

// ---------------------------------------------------------------------------
// AOI bounds: vertices, span, bbox
// ---------------------------------------------------------------------------

test("vertex counter bails early past the cap", () => {
  const ring = Array.from({ length: 12 }, (_, i) => [i, i]);
  const geometry = { type: "MultiPolygon", coordinates: [[ring]] };
  assert.equal(countGeometryVertices(geometry.coordinates, 100), 12);
  assert.ok(countGeometryVertices(geometry.coordinates, 5) > 5, "returns cap+1 when exceeded");
  assert.equal(countGeometryVertices(undefined, 10), 0);
  assert.equal(countGeometryVertices("not coordinates", 10), 0);
});

test("bbox walker finds extents and ignores malformed entries", () => {
  const coordinates = [
    [
      [
        [74.0, 31.1],
        [73.9, 31.05],
        [74.05, 31.15],
        [74.0, 31.1],
      ],
    ],
  ];
  const bbox = bboxOfCoordinates(coordinates);
  assert.ok(bbox);
  if (bbox) {
    assert.deepEqual(bbox, [73.9, 31.05, 74.05, 31.15]);
  }
  assert.equal(bboxOfCoordinates([]), null);
  assert.equal(bboxOfCoordinates(null), null);
});

test("span assertion rejects oversized and degenerate AOIs", () => {
  assertAoiSpan([73.9, 31.05, 74.05, 31.15]); // within cap — no throw
  assert.throws(
    () => assertAoiSpan([73.0, 31.0, 74.0, 31.5]), // 1° wide
    (error: unknown) => error instanceof SentinelInputError && error.code === "aoi_too_large",
  );
  assert.throws(
    () => assertAoiSpan([74.0, 31.1, 74.0, 31.1]), // zero extent
    (error: unknown) => error instanceof SentinelInputError && error.code === "geometry_invalid",
  );
});

test("vertex-count assertion rejects oversized geometry with a safe message", () => {
  const bigRing = Array.from({ length: SENTINEL_LIMITS.maxAoiVertices + 10 }, (_, i) => [
    i % 360,
    10,
  ]);
  assert.throws(
    () => assertAoiVertexCount([[bigRing]]),
    (error: unknown) => {
      assert.ok(error instanceof SentinelInputError);
      assert.equal(error.code, "aoi_too_large");
      assert.ok(!/undefined|\[object/.test(error.message));
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Preview sizing and statistics resolution
// ---------------------------------------------------------------------------

test("preview keeps the long side capped and aspect ratio sane", () => {
  const wide = previewSizeForBbox([73.9, 31.05, 74.05, 31.15]);
  assert.equal(wide.width, SENTINEL_LIMITS.previewLongSidePx);
  assert.ok(wide.height > 0 && wide.height <= SENTINEL_LIMITS.previewLongSidePx);
  assert.ok(Math.abs(wide.width / wide.height - 1.5) < 0.15, "roughly 3:2 aspect");

  const tall = previewSizeForBbox([73.95, 31.0, 73.96, 31.15]);
  assert.equal(tall.height, SENTINEL_LIMITS.previewLongSidePx);
  assert.ok(tall.width >= SENTINEL_LIMITS.previewMinSidePx);

  const meters = metersPerPixelForBbox([73.9, 31.05, 74.05, 31.15], wide.width);
  assert.ok(meters !== null && meters > 1 && meters < 100, "preview m/px is plausible");
});

test("statistics resolution coarsens as the AOI grows", () => {
  // Ladder: ≤200 km² → 10 m, ≤800 km² → 20 m, else 60 m. All cases stay
  // within the 0.3° span cap so they are actually reachable requests.
  assert.equal(statsResolutionForBbox([74.0, 31.1, 74.002, 31.102]), 10); // ~0.04 km²
  assert.equal(statsResolutionForBbox([73.9, 31.0, 74.1, 31.2]), 20); // ~420 km², 0.2° span
  assert.equal(statsResolutionForBbox([73.8, 31.0, 74.1, 31.3]), 60); // ~950 km², 0.3° span
});

// ---------------------------------------------------------------------------
// Geometry validation entry point (Phase 1.1 rules reused)
// ---------------------------------------------------------------------------

test("standalone geometry validator accepts a simple valid polygon", () => {
  const polygon = {
    type: "Polygon",
    coordinates: [
      [
        [73.9, 31.05],
        [74.05, 31.05],
        [74.05, 31.15],
        [73.9, 31.15],
        [73.9, 31.05],
      ],
    ],
  };
  const result = validateStandaloneGeometry(polygon);
  assert.ok(result.ok);
  if (result.ok) {
    assert.deepEqual(result.bbox, { minLon: 73.9, minLat: 31.05, maxLon: 74.05, maxLat: 31.15 });
    assert.equal(result.geometry.length, 1);
  }
});

test("standalone geometry validator rejects self-intersecting rings", () => {
  const bowtie = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [2, 2],
        [2, 0],
        [0, 2],
        [0, 0],
      ],
    ],
  };
  const result = validateStandaloneGeometry(bowtie);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.length > 0);
});

// ---------------------------------------------------------------------------
// NDVI mask, ramp, and evalscripts
// ---------------------------------------------------------------------------

test("mask partitions all 12 SCL classes with justifications", () => {
  const excluded = new Set(excludedSclValues());
  const retained = new Set(RETAINED_SCL.map((entry) => entry.value));
  for (let value = 0; value <= 11; value++) {
    assert.ok(excluded.has(value) || retained.has(value), `SCL ${value} must be classified`);
    assert.ok(!(excluded.has(value) && retained.has(value)), `SCL ${value} must not be both`);
  }
  // The classes this slice must not miss:
  for (const mustExclude of [0, 1, 3, 6, 8, 9, 10, 11]) {
    assert.ok(excluded.has(mustExclude), `SCL ${mustExclude} must be excluded`);
  }
  for (const entry of EXCLUDED_SCL) {
    assert.ok(entry.reason.length > 10, `SCL ${entry.value} needs a stated reason`);
  }
  for (const entry of RETAINED_SCL) {
    assert.ok(entry.reason.length > 10, `SCL ${entry.value} needs a stated reason`);
  }
});

test("mask rules mention dataMask, the excluded classes, and the zero denominator", () => {
  assert.ok(MASK_RULES.length >= 3);
  assert.match(MASK_RULES.join("\n"), /dataMask = 0/);
  assert.match(MASK_RULES.join("\n"), /denominator is zero/);
  assert.match(MASK_RULES.join("\n"), /non-finite/);
  const excludedList = excludedSclValues().join(", ");
  assert.ok(MASK_RULES.join("\n").includes(excludedList));
});

test("preview evalscript: RGBA output, ramp, and the exact usable-pixel condition", () => {
  const script = buildNdviPreviewEvalscript();
  assert.match(script, /\/\/VERSION=3/);
  assert.match(script, /bands: 4/);
  assert.match(script, /sampleType: "UINT8"/);
  assert.match(script, /\(sample\.B08 - sample\.B04\) \/ denominator/, "NDVI formula");
  assert.match(script, /return \[0, 0, 0, 0\]/, "masked pixels are fully transparent");
  assert.match(script, /return \[rgb\[0\], rgb\[1\], rgb\[2\], 255\]/, "usable pixels are opaque");
  // Every excluded SCL class appears in the condition.
  for (const value of excludedSclValues()) {
    assert.ok(script.includes(`sample.SCL !== ${value}`), `preview must exclude SCL ${value}`);
  }
  // Ramp stops are embedded so the picture matches the legend.
  for (const stop of NDVI_RAMP_STOPS) {
    assert.ok(script.includes(`[${stop.ndvi}, ${stop.rgb.join(", ")}]`), "ramp stop embedded");
  }
});

test("statistics evalscript: dataMask output excludes exactly the same pixels", () => {
  const script = buildNdviStatsEvalscript();
  assert.match(script, /id: "ndvi"/);
  assert.match(script, /id: "dataMask"/);
  assert.match(script, /return \{ ndvi: \[0\], dataMask: \[0\] \}/, "masked → excluded");
  assert.match(script, /return \{ ndvi: \[ndvi\], dataMask: \[1\] \}/, "usable → counted");
  for (const value of excludedSclValues()) {
    assert.ok(script.includes(`sample.SCL !== ${value}`), `stats must exclude SCL ${value}`);
  }
  assert.ok(script.includes("denominator > 0"), "zero denominator must never be counted as usable");
});

test("valid-pixel percentage is clamped and handles empty input", () => {
  assert.equal(validPixelPct(0, 0), 0);
  assert.equal(validPixelPct(100, 25), 75);
  assert.equal(validPixelPct(100, 0), 100);
  assert.equal(validPixelPct(100, 150), 0, "clamped, never negative");
  assert.equal(validPixelPct(-5, -5), 0);
});

// ---------------------------------------------------------------------------
// Colour ramp
// ---------------------------------------------------------------------------

test("ramp is ordered, in range, and its CSS gradient matches the stops", () => {
  let previous = -Infinity;
  for (const stop of NDVI_RAMP_STOPS) {
    assert.ok(stop.ndvi >= -1 && stop.ndvi <= 1, "stops within [-1, 1]");
    assert.ok(stop.ndvi > previous, "stops strictly increasing");
    previous = stop.ndvi;
    for (const channel of stop.rgb) {
      assert.ok(channel >= 0 && channel <= 255, "8-bit channels");
    }
  }
  assert.equal(NDVI_RAMP_STOPS[0].ndvi, -1);
  assert.equal(NDVI_RAMP_STOPS[NDVI_RAMP_STOPS.length - 1].ndvi, 1);

  const gradient = ndviRampCssGradient();
  assert.match(gradient, /^linear-gradient\(90deg, /);
  assert.equal((gradient.match(/rgb\(/g) ?? []).length, NDVI_RAMP_STOPS.length);

  // Interpolation mirrors the evalscript ramp at the boundaries.
  assert.deepEqual(ndviToRgb(-2), NDVI_RAMP_STOPS[0].rgb);
  assert.deepEqual(ndviToRgb(2), NDVI_RAMP_STOPS[NDVI_RAMP_STOPS.length - 1].rgb);
  assert.deepEqual(ndviToRgb(0), NDVI_RAMP_STOPS.find((stop) => stop.ndvi === 0)!.rgb);
});

// ---------------------------------------------------------------------------
// Planetary Computer adapter: pure helpers (no network)
// ---------------------------------------------------------------------------

test("Planetary Computer error vocabulary keeps distinct provider failure categories", () => {
  const unreachable = new PlanetaryComputerProviderError("provider_error");
  assert.equal(unreachable.code, "provider_error");
  assert.equal(
    unreachable.message,
    "The satellite provider could not be reached. Check connectivity and try again.",
  );
  const http500 = new PlanetaryComputerProviderError("provider_error", 500);
  assert.equal(
    http500.message,
    "The satellite provider returned an error (HTTP 500). Try again later.",
  );
  assert.equal(
    new PlanetaryComputerProviderError("rate_limited").message,
    SENTINEL_ERROR_MESSAGES.rate_limited,
  );
  assert.equal(
    new PlanetaryComputerProviderError("timeout").message,
    SENTINEL_ERROR_MESSAGES.timeout,
  );
  assert.equal(
    new PlanetaryComputerProviderError("provider_response_invalid").message,
    SENTINEL_ERROR_MESSAGES.provider_response_invalid,
  );
});

test("masked NDVI expression uses asset names and excludes every excluded SCL class", () => {
  const expression = buildMaskedNdviExpression();
  // Band names are the asset names, not indexed bands.
  assert.ok(expression.includes("B08"), "expression references B08");
  assert.ok(expression.includes("B04"), "expression references B04");
  assert.ok(expression.includes("SCL"), "expression references SCL");
  assert.ok(!expression.includes("asset1_b1"), "expression does not use indexed band names");
  // NDVI formula and the zero-denominator guard.
  assert.ok(expression.includes("(B08-B04)/(B08+B04)"), "NDVI formula present");
  assert.ok(expression.includes("((B08+B04)==0)"), "zero denominator guarded");
  // Every excluded SCL class is masked to the bottom sentinel.
  for (const value of excludedSclValues()) {
    assert.ok(expression.includes(`(SCL==${value})`), `expression masks SCL ${value}`);
  }
  assert.ok(expression.includes(`-9999`), "bottom sentinel is -9999");
  assert.ok(expression.startsWith("where("), "expression is a where()");
});

test("top sentinel expression drives the exact-min statistics call", () => {
  const expression = buildTopSentinelExpression();
  for (const value of excludedSclValues()) {
    assert.ok(expression.includes(`(SCL==${value})`), `top expression masks SCL ${value}`);
  }
  assert.ok(expression.includes(`65535`), "top sentinel is 65535");
  assert.ok(expression.includes("(B08-B04)/(B08+B04)"), "NDVI formula present");
});

test("Planetary Computer preview uses compact sentinel-separated grayscale", () => {
  const expression = buildPreviewNdviExpression();
  assert.ok(expression.includes("where("), "preview applies the quality mask");
  assert.ok(expression.includes(",-2,"), "masked samples map to byte zero after rescaling");
  assert.ok(expression.includes("(B08-B04)/(B08+B04)"), "valid samples retain NDVI");
});

test("statistics debiasing removes bottom-sentinel pollution exactly", () => {
  // Usable NDVIs: -0.5, 0, 0.5; two pixels masked to the bottom sentinel.
  const valid = [-0.5, 0, 0.5];
  const nAll = valid.length + 2;
  const sum = valid.reduce((a, b) => a + b, 0) + -9999 * 2;
  const mean = sum / nAll;
  const variance = valid.reduce((acc, v) => acc + (v - mean) ** 2, 0) + 2 * (-9999 - mean) ** 2;
  const std = Math.sqrt(variance / nAll); // population, ddof 0

  const result = debiasStatistics({ count: nAll, sum, mean, std, masked: 2 });
  assert.ok(result, "debiasing succeeds");
  if (result) {
    assert.equal(result.meanValid, 0, "debiased mean is the usable mean");
    const expectedStDev = Math.sqrt(valid.reduce((acc, v) => acc + v ** 2, 0) / valid.length);
    assert.equal(result.stDevValid, expectedStDev, "debiased stDev is the usable stDev");
  }
});

test("statistics debiasing rejects degenerate input", () => {
  assert.equal(debiasStatistics({ count: 0, sum: 0, mean: 0, std: 0, masked: 0 }), null);
  assert.equal(debiasStatistics({ count: 5, sum: 0, mean: 0, std: 0, masked: 5 }), null);
});

test("sample pixel counts combine source no-data and masked NDVI pixels", () => {
  const counts = deriveSamplePixelCounts({
    count: 600,
    sourceMasked: 400,
    histogramCounts: [200, 300],
  });
  assert.deepEqual(counts, {
    sampleCount: 1000,
    noDataCount: 500,
    expressionMasked: 100,
    valid: 500,
  });
  assert.equal(
    deriveSamplePixelCounts({ count: 100, sourceMasked: 20, histogramCounts: [110] }),
    null,
    "rejects histogram counts larger than source-data count",
  );
});

test("histogram parsing handles the provider's two-array form and rejects malformed input", () => {
  const parsed = parseHistogram([
    [10, 20, 30],
    [0, 0.25, 0.5, 1],
  ]);
  assert.ok(parsed, "two-array histogram parses");
  if (parsed) {
    assert.deepEqual(parsed.counts, [10, 20, 30]);
    assert.deepEqual(parsed.edges, [0, 0.25, 0.5, 1]);
  }
  assert.equal(parseHistogram(null), null);
  assert.equal(parseHistogram([1, 2, 3]), null);
  assert.equal(
    parseHistogram([
      [1, 2],
      [0, 0.5],
    ]),
    null,
    "edges must be counts.length + 1",
  );
  assert.equal(
    parseHistogram([
      [1, -2],
      [0, 0.5, 1],
    ]),
    null,
    "counts must be non-negative",
  );
});

test("percentile interpolation from histogram bins", () => {
  const counts = [10, 20, 30, 40];
  const edges = [0, 0.25, 0.5, 0.75, 1];
  assert.equal(percentileFromBins(counts, edges, 10), 0.25);
  assert.equal(percentileFromBins(counts, edges, 50), 2 / 3);
  assert.equal(percentileFromBins(counts, edges, 90), 0.9375);
  assert.equal(percentileFromBins([], [0], 50), null);
  assert.equal(percentileFromBins(counts, edges, 99), 0.99375);
});
