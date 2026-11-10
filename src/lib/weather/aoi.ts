/**
 * Area-of-interest handling for the Phase 3 weather slice: fixed public sample
 * AOIs (Khanewal and Okara) and grid-cell selection helpers.
 *
 * Sample AOIs are public reference rectangles. They are never described as
 * the user's farm, and their labels always say "sample". Imported/private
 * boundaries are never sent to third-party weather providers — only these
 * fixed fixtures may be used.
 */

import type { Bbox } from "../sentinel/aoi.ts";
import type { GridCell, WeatherAoiDescriptor } from "./types.ts";

/** Fixed public sample AOIs, aligned with the provisional pilot regions in SITREP. */
export const WEATHER_SAMPLE_AOIS: readonly WeatherSampleAoi[] = [
  {
    id: "sample-khanewal-orchards",
    label: "Khanewal orchards (sample)",
    region: "Khanewal district, Punjab, Pakistan",
    provenance:
      "Sample AOI — public reference rectangle over orchard land in Khanewal district, " +
      "the provisional pilot region recorded in SITREP. It is a generic test area, not a " +
      "verified farm, property, or survey boundary. Only this fixed rectangle (not imported " +
      "boundaries) may be sent to third-party weather providers.",
    bbox: [71.55, 30.55, 71.7, 30.65],
  },
  {
    id: "sample-okara-farmland",
    label: "Okara farmland (sample)",
    region: "Okara district, Punjab, Pakistan",
    provenance:
      "Sample AOI — public reference rectangle over mixed farmland in Okara district, " +
      "the provisional comparison region recorded in SITREP. It is a generic test area, not a " +
      "verified farm, property, or survey boundary. Only this fixed rectangle (not imported " +
      "boundaries) may be sent to third-party weather providers.",
    bbox: [72.9, 30.65, 73.05, 30.75],
  },
];

export type WeatherSampleAoiId = "sample-khanewal-orchards" | "sample-okara-farmland";

export interface WeatherSampleAoi {
  id: WeatherSampleAoiId;
  label: string;
  region: string;
  provenance: string;
  bbox: Bbox;
}

export function weatherSampleAoiById(id: string): WeatherSampleAoi | null {
  return (WEATHER_SAMPLE_AOIS as readonly WeatherSampleAoi[]).find((a) => a.id === id) ?? null;
}

/** Centroid of a bounding box as [longitude, latitude]. */
export function bboxCenter(bbox: Bbox): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

/**
 * Select the nearest grid cell for a WGS84 point on a regular lat/lon grid.
 *
 * The cell center is the snapped grid point, the grid resolution is reported
 * alongside, and a human-readable method description is returned. A point
 * that falls exactly halfway between two cells takes the lower one, which is
 * the tie-break ecCodes applies and the one the ECMWF adapter's own grid
 * reader reproduces.
 *
 * This is the fallback selection, used when no field was decoded. When a
 * field was decoded, its own grid definition is authoritative and the cell it
 * names is reported instead.
 *
 * Does not imply the grid estimate is an on-farm sensor reading.
 */
export function selectGridCell(lon: number, lat: number, gridResolutionDeg: number): GridCell {
  const snappedLon = snapToGrid(lon, gridResolutionDeg);
  const snappedLat = snapToGrid(lat, gridResolutionDeg);

  return {
    method: `nearest ${gridResolutionDeg}° grid point to AOI centroid (${lon.toFixed(4)}°, ${lat.toFixed(4)}°)`,
    gridResolutionDeg,
    cellCenter: [snappedLon, snappedLat],
  };
}

/** Snap a coordinate to the nearest grid point, breaking ties towards the lower one. */
function snapToGrid(value: number, gridResolutionDeg: number): number {
  const index = Math.floor(value / gridResolutionDeg + 0.5 - 1e-9);
  return index * gridResolutionDeg;
}

/** Resolve a weather AOI input to a descriptor and centroid. Only sample AOIs are allowed. */
export function resolveWeatherAoi(sampleId: string): {
  descriptor: WeatherAoiDescriptor;
  centroid: [number, number];
} {
  const sample = weatherSampleAoiById(sampleId);
  if (!sample) {
    throw new Error(`Unknown sample AOI: ${sampleId}`);
  }

  const [centroidLon, centroidLat] = bboxCenter(sample.bbox);

  return {
    descriptor: {
      kind: "sample",
      label: sample.label,
      provenance: sample.provenance,
      bbox: sample.bbox,
    },
    centroid: [centroidLon, centroidLat],
  };
}
