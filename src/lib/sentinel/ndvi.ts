/**
 * NDVI definitions for the Sentinel-2 observation slice: the scene
 * classification mask, the colour ramp, and the evalscripts that embed both.
 *
 * This module is the single source of truth for what "usable" means. The
 * preview evalscript, the statistics evalscript, and the UI legend are all
 * generated from the constants below, so the picture, the numbers, and the
 * disclosed mask can never drift apart.
 *
 * NDVI is computed exactly as specified for this slice:
 *   NDVI = (B08 - B04) / (B08 + B04)
 * from Sentinel-2 L2A bottom-of-atmosphere reflectance. It is a reflectance
 * index only — never a diagnosis, recommendation, or treatment signal.
 */

/** Sentinel-2 L2A scene classification (SCL) classes, per the Sentinel Hub S2L2A band documentation. */
export const SCL_CLASSES = [
  { value: 0, label: "No data" },
  { value: 1, label: "Saturated / defective" },
  { value: 2, label: "Dark area pixels" },
  { value: 3, label: "Cloud shadows" },
  { value: 4, label: "Vegetation" },
  { value: 5, label: "Bare soils" },
  { value: 6, label: "Water" },
  { value: 7, label: "Clouds low probability / unclassified" },
  { value: 8, label: "Clouds medium probability" },
  { value: 9, label: "Clouds high probability" },
  { value: 10, label: "Cirrus" },
  { value: 11, label: "Snow / ice" },
] as const;

/**
 * SCL classes excluded from both the preview and the statistics, with the
 * justification for each. Nothing here is rendered or averaged — masked
 * pixels are transparent, never painted as healthy vegetation.
 */
export const EXCLUDED_SCL: ReadonlyArray<{ value: number; label: string; reason: string }> = [
  { value: 0, label: "No data", reason: "Nothing was measured by the sensor." },
  {
    value: 1,
    label: "Saturated / defective",
    reason: "Detector artefacts, not surface reflectance.",
  },
  {
    value: 3,
    label: "Cloud shadows",
    reason: "Shadowed reflectance is not comparable to fully lit canopy NDVI.",
  },
  {
    value: 6,
    label: "Water",
    reason:
      "NDVI over water is not a vegetation signal; excluded following the Copernicus NDVI statistics example.",
  },
  { value: 8, label: "Clouds medium probability", reason: "Cloud is not surface vegetation." },
  { value: 9, label: "Clouds high probability", reason: "Cloud is not surface vegetation." },
  { value: 10, label: "Cirrus", reason: "Thin cirrus distorts surface reflectance." },
  {
    value: 11,
    label: "Snow / ice",
    reason: "Snow cover is not canopy reflectance and would misread as bare ground.",
  },
];

/**
 * SCL classes deliberately kept. They are measured surface (or, for class 7,
 * mostly unclassified surface), so hiding them would remove real coverage:
 * the valid-pixel figure and the caveats carry the caveat instead.
 */
export const RETAINED_SCL: ReadonlyArray<{ value: number; label: string; reason: string }> = [
  {
    value: 2,
    label: "Dark area pixels",
    reason: "Real surface; low signal can make NDVI noisy there.",
  },
  { value: 4, label: "Vegetation", reason: "The signal this slice is for." },
  { value: 5, label: "Bare soils", reason: "Real surface — low NDVI is expected, not missing." },
  {
    value: 7,
    label: "Clouds low probability / unclassified",
    reason: "Mostly unclassified surface; excluding it would drop valid coverage.",
  },
];

/** Machine-readable mask rules, shown verbatim in the UI. */
export const MASK_RULES: readonly string[] = [
  "dataMask = 0 (no data in the source scene, including pixels outside the boundary)",
  `SCL classes ${EXCLUDED_SCL.map((entry) => entry.value).join(", ")} (cloud, cloud shadow, cirrus, snow, water, no-data, defective)`,
  "B08 + B04 = 0 — the NDVI denominator is zero, so NDVI is undefined",
  "non-finite or out-of-range NDVI results",
];

/** NDVI colour ramp stops, in NDVI order, as 8-bit RGB triples. */
export interface NdviRampStop {
  ndvi: number;
  rgb: [number, number, number];
}

/** Shared by the preview evalscript and the UI legend. Range is [-1, 1]. */
export const NDVI_RAMP_STOPS: readonly NdviRampStop[] = [
  { ndvi: -1, rgb: [46, 26, 30] },
  { ndvi: -0.2, rgb: [140, 51, 36] },
  { ndvi: 0, rgb: [196, 120, 40] },
  { ndvi: 0.2, rgb: [232, 200, 70] },
  { ndvi: 0.4, rgb: [168, 200, 78] },
  { ndvi: 0.6, rgb: [76, 176, 90] },
  { ndvi: 0.8, rgb: [34, 140, 78] },
  { ndvi: 1, rgb: [16, 100, 64] },
];

/** CSS `linear-gradient` matching the preview ramp exactly. */
export function ndviRampCssGradient(): string {
  const stops = NDVI_RAMP_STOPS.map((stop) => {
    const position = ((stop.ndvi + 1) / 2) * 100;
    const [r, g, b] = stop.rgb;
    return `rgb(${r}, ${g}, ${b}) ${position.toFixed(1)}%`;
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/** Ramp colour for an NDVI value — mirrors the evalscript `ramp()` exactly. */
export function ndviToRgb(ndvi: number): [number, number, number] {
  const stops = NDVI_RAMP_STOPS;
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (ndvi <= first.ndvi) return [first.rgb[0], first.rgb[1], first.rgb[2]];
  for (let i = 1; i < stops.length; i++) {
    if (ndvi <= stops[i].ndvi) {
      const a = stops[i - 1];
      const b = stops[i];
      const t = (ndvi - a.ndvi) / (b.ndvi - a.ndvi);
      return [
        Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t),
        Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t),
        Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t),
      ];
    }
  }
  return [last.rgb[0], last.rgb[1], last.rgb[2]];
}

/**
 * Usable-pixel percentage from the provider statistics:
 * `sampleCount` is every AOI bounding-box sample, `noDataCount` every sample
 * excluded from the calculation.
 */
export function validPixelPct(sampleCount: number, noDataCount: number): number {
  if (!Number.isFinite(sampleCount) || sampleCount <= 0) return 0;
  const usable = sampleCount - noDataCount;
  if (!Number.isFinite(usable) || usable <= 0) return 0;
  return Math.min(100, Math.max(0, (usable / sampleCount) * 100));
}

/** SCL class list formatted for the UI, e.g. `0, 1, 3, 6, 8, 9, 10, 11`. */
export function excludedSclValues(): number[] {
  return EXCLUDED_SCL.map((entry) => entry.value);
}

/**
 * The exact condition applied to every pixel in both evalscripts, built from
 * `EXCLUDED_SCL` so the code and the disclosure cannot diverge. Returns the
 * JavaScript expression that is true only for usable pixels.
 */
function usablePixelCondition(): string {
  const sclChecks = EXCLUDED_SCL.map((entry) => `sample.SCL !== ${entry.value}`).join(" && ");
  return "sample.dataMask > 0.5 && denominator > 0 && " + sclChecks + " && ndvi >= -1 && ndvi <= 1";
}

/**
 * Preview evalscript: RGBA PNG over the AOI. Usable pixels are painted with
 * the NDVI colour ramp and alpha 255; every masked pixel returns alpha 0, so
 * the PNG shows them fully transparent — never a healthy colour.
 */
export function buildNdviPreviewEvalscript(): string {
  const stopsLiteral = NDVI_RAMP_STOPS.map(
    (stop) => `  [${stop.ndvi}, ${stop.rgb.join(", ")}]`,
  ).join(",\n");

  return `//VERSION=3
// FieldWise NDVI preview. Masked pixels are transparent (alpha 0).
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: { id: "default", bands: 4, sampleType: "UINT8" },
  };
}

var stops = [
${stopsLiteral},
];

function ramp(ndvi) {
  if (ndvi <= stops[0][0]) return [stops[0][1], stops[0][2], stops[0][3]];
  for (var i = 1; i < stops.length; i++) {
    if (ndvi <= stops[i][0]) {
      var a = stops[i - 1];
      var b = stops[i];
      var t = (ndvi - a[0]) / (b[0] - a[0]);
      return [
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
        a[3] + (b[3] - a[3]) * t,
      ];
    }
  }
  var last = stops[stops.length - 1];
  return [last[1], last[2], last[3]];
}

function evaluatePixel(sample) {
  var denominator = sample.B08 + sample.B04;
  var ndvi = denominator > 0 ? (sample.B08 - sample.B04) / denominator : 0;
  var usable = ${usablePixelCondition()};
  if (!usable) return [0, 0, 0, 0];
  var rgb = ramp(ndvi);
  return [rgb[0], rgb[1], rgb[2], 255];
}
`;
}

/**
 * Statistics evalscript, modelled on the official Copernicus Data Space
 * "NDVI with a custom dataMask" example: the composite mask is returned as
 * the `dataMask` output, which tells the Statistical API exactly which pixels
 * to exclude. Masked pixels report NDVI 0 and are excluded from every figure.
 */
export function buildNdviStatsEvalscript(): string {
  return `//VERSION=3
// FieldWise NDVI statistics. The dataMask output marks excluded pixels so
// they are dropped from min/max/mean/percentiles/histogram and counted in
// noDataCount.
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 },
    ],
  };
}

function evaluatePixel(sample) {
  var denominator = sample.B08 + sample.B04;
  var ndvi = denominator > 0 ? (sample.B08 - sample.B04) / denominator : 0;
  var usable = ${usablePixelCondition()};
  if (!usable) return { ndvi: [0], dataMask: [0] };
  return { ndvi: [ndvi], dataMask: [1] };
}
`;
}
