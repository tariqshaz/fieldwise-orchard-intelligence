/**
 * Area-of-interest handling for the Sentinel-2 observation slice: explicitly
 * named sample AOIs, the request bounds this slice enforces before any
 * provider call, and pure helpers shared by the client (fast feedback) and
 * the server functions (authoritative re-validation).
 *
 * Sample AOIs are public reference rectangles. They are never described as
 * the user's farm, and their labels always say "sample".
 */

import type { AoiDescriptor } from "./types.ts";
import { SENTINEL_ERROR_MESSAGES, type SentinelInputErrorCode } from "./errors.ts";

/** A bounding box in WGS84 degrees: west, south, east, north. */
export type Bbox = [number, number, number, number];

/**
 * Hard bounds for provider requests. These keep every satellite call bounded
 * and are enforced server-side before the provider is contacted.
 */
export const SENTINEL_LIMITS = {
  /** Longest catalog window this slice will search. */
  maxDateRangeDays: 180,
  /** Sentinel-2A launch date — nothing exists earlier. */
  minDateFrom: "2015-06-23",
  /** Scenes returned per search, newest first. */
  maxSceneResults: 50,
  /** Maximum AOI span in degrees (roughly 33 km) — bounds provider work. */
  maxAoiSpanDeg: 0.3,
  /** Maximum AOI vertices sent to the provider in one request. */
  maxAoiVertices: 20_000,
  /** Long side of the rendered NDVI preview, in pixels. */
  previewLongSidePx: 640,
  /** Short side floor for the rendered preview, in pixels. */
  previewMinSidePx: 64,
  /** Soft ceiling on statistics samples; coarser resolution is used above it. */
  maxStatsSamples: 2_000_000,
  /** ±window around an acquisition; under the documented 50-minute rule this
   *  cannot contain more than one Sentinel-2 acquisition, so different dates
   *  can never be mosaicked. */
  sceneWindowMinutes: 10,
  /** Timeout for each provider call. */
  providerTimeoutMs: 20_000,
} as const;

export interface SampleAoi {
  id: string;
  /** Shown in the selector; always visibly marked as a sample. */
  label: string;
  /** Geographic region, for orientation only. */
  region: string;
  /** Full provenance sentence, always displayed next to results. */
  description: string;
  bbox: Bbox;
}

/**
 * Named public reference AOIs, aligned with the provisional pilot regions
 * recorded in SITREP (Khanewal = orchard candidate, Okara = comparison
 * region). Every entry is a plain rectangle over a real region, labelled as
 * a sample and explicitly not a verified farm or property boundary.
 */
export const SAMPLE_AOIS: readonly SampleAoi[] = [
  {
    id: "sample-khanewal-orchards",
    label: "Khanewal orchards (sample)",
    region: "Khanewal district, Punjab, Pakistan",
    description:
      "Sample AOI — public reference rectangle over orchard land in Khanewal district, the " +
      "provisional pilot region recorded in SITREP. It is a generic test area, not a verified " +
      "farm, property, or survey boundary.",
    bbox: [71.55, 30.55, 71.7, 30.65],
  },
  {
    id: "sample-okara-farmland",
    label: "Okara farmland (sample)",
    region: "Okara district, Punjab, Pakistan",
    description:
      "Sample AOI — public reference rectangle over mixed farmland in Okara district, the " +
      "provisional comparison region recorded in SITREP. It is a generic test area, not a " +
      "verified farm, property, or survey boundary.",
    bbox: [72.9, 30.65, 73.05, 30.75],
  },
];

export function sampleAoiById(id: string): SampleAoi | null {
  return SAMPLE_AOIS.find((sample) => sample.id === id) ?? null;
}

/** Descriptor for a sample AOI — provenance is always the full description. */
export function sampleAoiDescriptor(sample: SampleAoi): AoiDescriptor {
  return { kind: "sample", label: sample.label, provenance: sample.description };
}

/** Descriptor for an imported boundary — provenance names the import source. */
export function importedAoiDescriptor(sourceName: string): AoiDescriptor {
  const name = sourceName.trim() || "imported boundary";
  return {
    kind: "imported-boundary",
    label: `Imported boundary · ${name}`,
    provenance:
      `AOI: imported boundary “${name}” from this browser. The geometry is sent to Copernicus ` +
      "Sentinel Hub only to compute this request and is not stored by FieldWise.",
  };
}

/** Error thrown by AOI/date validation before any provider call. */
export class SentinelInputError extends Error {
  readonly code: SentinelInputErrorCode;

  constructor(code: SentinelInputErrorCode, message: string) {
    super(message);
    this.name = "SentinelInputError";
    this.code = code;
  }
}

export type DateRangeValidation =
  | { ok: true; from: string; to: string; days: number }
  | { ok: false; code: SentinelInputErrorCode; message: string };

function parseUtcDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const rebuilt = new Date(ms);
  if (
    rebuilt.getUTCFullYear() !== year ||
    rebuilt.getUTCMonth() !== month - 1 ||
    rebuilt.getUTCDate() !== day
  ) {
    return null; // e.g. 2026-02-30
  }
  return ms;
}

/**
 * Validate a `YYYY-MM-DD` catalog window: real dates, start ≤ end, no future
 * end, nothing before the mission, and at most `maxDateRangeDays` long.
 */
export function validateDateRange(
  from: string,
  to: string,
  now: Date = new Date(),
): DateRangeValidation {
  const fromMs = parseUtcDate(from);
  const toMs = parseUtcDate(to);
  if (fromMs === null || toMs === null) {
    return { ok: false, code: "invalid_input", message: SENTINEL_ERROR_MESSAGES.invalid_date };
  }
  if (toMs < fromMs) {
    return { ok: false, code: "invalid_input", message: SENTINEL_ERROR_MESSAGES.date_order };
  }

  const floorMs = parseUtcDate(SENTINEL_LIMITS.minDateFrom);
  if (floorMs !== null && fromMs < floorMs) {
    return {
      ok: false,
      code: "invalid_input",
      message: SENTINEL_ERROR_MESSAGES.date_before_mission,
    };
  }

  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (toMs > todayMs) {
    return { ok: false, code: "invalid_input", message: SENTINEL_ERROR_MESSAGES.date_future };
  }

  const days = Math.round((toMs - fromMs) / 86_400_000);
  if (days > SENTINEL_LIMITS.maxDateRangeDays) {
    return {
      ok: false,
      code: "date_range_too_long",
      message: SENTINEL_ERROR_MESSAGES.date_too_long(days, SENTINEL_LIMITS.maxDateRangeDays),
    };
  }

  return { ok: true, from, to, days };
}

const MAX_COORD_DEPTH = 6;

function isPosition(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

/**
 * Bounding box of nested GeoJSON-style coordinates (positions nested in
 * rings, polygons, multipolygons). Returns `null` when no finite position is
 * found; malformed entries are skipped rather than trusted.
 */
export function bboxOfCoordinates(value: unknown): Bbox | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  let found = false;

  const walk = (node: unknown, depth: number): void => {
    if (depth > MAX_COORD_DEPTH || !Array.isArray(node)) return;
    if (isPosition(node)) {
      found = true;
      const lon = node[0];
      const lat = node[1];
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const child of node) walk(child, depth + 1);
  };

  walk(value, 0);
  return found ? [minLon, minLat, maxLon, maxLat] : null;
}

/**
 * Count positions in nested coordinates, stopping as soon as `cap` is
 * exceeded (returns `cap + 1`). Bounded depth keeps hostile input cheap.
 */
export function countGeometryVertices(value: unknown, cap: number): number {
  let count = 0;

  const walk = (node: unknown, depth: number): void => {
    if (depth > MAX_COORD_DEPTH || count > cap || !Array.isArray(node)) return;
    if (isPosition(node)) {
      count += 1;
      return;
    }
    for (const child of node) {
      walk(child, depth + 1);
      if (count > cap) return;
    }
  };

  walk(value, 0);
  return count;
}

/** Rectangle polygon for a bbox, closed per GeoJSON (5 positions). */
export function geometryFromBbox(bbox: Bbox): {
  type: "Polygon";
  coordinates: number[][][];
} {
  const [west, south, east, north] = bbox;
  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

/** Span of a bbox in degrees, for the AOI-size check. */
export function bboxSpanDeg(bbox: Bbox): { widthDeg: number; heightDeg: number } {
  return { widthDeg: bbox[2] - bbox[0], heightDeg: bbox[3] - bbox[1] };
}

/**
 * Reject AOIs wider or taller than `maxAoiSpanDeg`. Bounds the catalog
 * search, the statistics raster, and the preview to a single small request.
 */
export function assertAoiSpan(bbox: Bbox): void {
  const { widthDeg, heightDeg } = bboxSpanDeg(bbox);
  if (
    !Number.isFinite(widthDeg) ||
    !Number.isFinite(heightDeg) ||
    widthDeg <= 0 ||
    heightDeg <= 0
  ) {
    throw new SentinelInputError("geometry_invalid", SENTINEL_ERROR_MESSAGES.geometry_empty);
  }
  if (widthDeg > SENTINEL_LIMITS.maxAoiSpanDeg || heightDeg > SENTINEL_LIMITS.maxAoiSpanDeg) {
    throw new SentinelInputError(
      "aoi_too_large",
      SENTINEL_ERROR_MESSAGES.aoi_too_large(SENTINEL_LIMITS.maxAoiSpanDeg),
    );
  }
}

/** Reject AOIs with more vertices than one provider request may carry. */
export function assertAoiVertexCount(value: unknown): void {
  const count = countGeometryVertices(value, SENTINEL_LIMITS.maxAoiVertices);
  if (count > SENTINEL_LIMITS.maxAoiVertices) {
    throw new SentinelInputError(
      "aoi_too_large",
      SENTINEL_ERROR_MESSAGES.aoi_too_many_vertices(SENTINEL_LIMITS.maxAoiVertices),
    );
  }
}

/** Approximate bbox area in square kilometres (equirectangular). */
export function bboxAreaSqKm(bbox: Bbox): number {
  const midLat = (bbox[1] + bbox[3]) / 2;
  const widthM = (bbox[2] - bbox[0]) * 111_320 * Math.cos((midLat * Math.PI) / 180);
  const heightM = (bbox[3] - bbox[1]) * 110_540;
  return Math.abs((widthM * heightM) / 1_000_000);
}

/**
 * Statistics sampling resolution in metres: native 10 m while the AOI stays
 * within the sample ceiling, 20 m up to four times that, then 60 m. Keeps the
 * statistics request bounded for large (but legal) AOIs.
 */
export function statsResolutionForBbox(bbox: Bbox): number {
  const areaSqKm = bboxAreaSqKm(bbox);
  const nativeCapSqKm = SENTINEL_LIMITS.maxStatsSamples / 10_000; // 10 m samples → km²
  if (areaSqKm <= nativeCapSqKm) return 10;
  if (areaSqKm <= nativeCapSqKm * 4) return 20;
  return 60;
}

/**
 * Preview pixel size covering the bbox with the long side at
 * `previewLongSidePx`, preserving aspect ratio and never smaller than
 * `previewMinSidePx` on either axis.
 */
export function previewSizeForBbox(bbox: Bbox): { width: number; height: number } {
  const widthDeg = Math.max(bbox[2] - bbox[0], 1e-9);
  const heightDeg = Math.max(bbox[3] - bbox[1], 1e-9);
  const longSide = SENTINEL_LIMITS.previewLongSidePx;
  const minSide = SENTINEL_LIMITS.previewMinSidePx;

  let width: number;
  let height: number;
  if (widthDeg >= heightDeg) {
    width = longSide;
    height = Math.round((longSide * heightDeg) / widthDeg);
  } else {
    height = longSide;
    width = Math.round((longSide * widthDeg) / heightDeg);
  }

  return {
    width: Math.min(longSide, Math.max(minSide, width)),
    height: Math.min(longSide, Math.max(minSide, height)),
  };
}

/** Approximate ground metres per rendered preview pixel (bbox width basis). */
export function metersPerPixelForBbox(bbox: Bbox, widthPx: number): number | null {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return null;
  const midLat = (bbox[1] + bbox[3]) / 2;
  const widthM = (bbox[2] - bbox[0]) * 111_320 * Math.cos((midLat * Math.PI) / 180);
  if (!Number.isFinite(widthM) || widthM <= 0) return null;
  return widthM / widthPx;
}
