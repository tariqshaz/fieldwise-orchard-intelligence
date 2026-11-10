/**
 * Shared, client-safe types for the Phase 3 weather / environmental context slice.
 *
 * Nothing in this file is provider- or secret-specific: it describes what the
 * dashboard displays (historical reanalysis, forecast, flood context, crop
 * statistics) and the non-sensitive error vocabulary returned by server
 * functions. OAuth credentials, CDS keys, and raw provider payloads never
 * appear here.
 *
 * Every product carries provenance: source, spatial/temporal resolution, units,
 * retrieval time, and relevant valid/observation/issue times. Products are
 * strongly distinguished so historical reanalysis, forecasts, station data,
 * flood records, and crop statistics can never be confused with one another or
 * with on-farm sensor readings.
 */

import type { AoiDescriptor } from "../sentinel/types.ts";

/** Where the area of interest came from. */
export type WeatherAoiKind = "sample";

/** Human-readable provenance for the AOI used in a weather request. */
export interface WeatherAoiDescriptor {
  kind: WeatherAoiKind;
  /** Short label shown in the selector, always visibly marked as a sample. */
  label: string;
  /** Always-visible provenance sentence shown next to results. */
  provenance: string;
  /** Bounding box [west, south, east, north] in WGS84 degrees. */
  bbox: [number, number, number, number];
}

/** Status of a weather data product. */
export type WeatherStatus =
  | "ok"
  | "partial"
  | "unavailable"
  | "missing"
  | "stale"
  | "credentials_required";

/** Non-sensitive failure vocabulary. Messages never contain secrets or provider bodies. */
export type WeatherErrorCode =
  | "invalid_input"
  | "credentials_missing"
  | "auth_failed"
  | "rate_limited"
  | "timeout"
  | "provider_error"
  | "provider_response_invalid"
  | "internal";

export interface WeatherError {
  code: WeatherErrorCode;
  message: string;
}

/** Common base carried by every weather product. */
export interface WeatherProductBase {
  type: WeatherProductType;
  /** Data source name, e.g. "ECMWF Open Data IFS" or "ERA5-Land (CDS)". */
  source: string;
  /** Human attribution string for display next to results. */
  attribution: string;
  /** Server clock when retrieval finished (UTC ISO 8601). */
  retrievedAt: string;
  /** Area of interest used for the request. */
  aoi: WeatherAoiDescriptor;
  /** Grid-cell selection method and selected cell. */
  gridCell: GridCell;
  /** Product-level status. */
  status: WeatherStatus;
  /** Human-readable status explanation, shown when not "ok". */
  message?: string;
  /** Caveats about interpretation, e.g. "reanalysis estimate, not a sensor reading". */
  caveats: string[];
}

/** Grid-cell selection result: method, resolution, and selected cell center. */
export interface GridCell {
  /** Description of how the cell was chosen, e.g. "nearest 0.1° grid point to AOI centroid". */
  method: string;
  /** Grid spacing in degrees. */
  gridResolutionDeg: number;
  /** Selected cell center as [longitude, latitude] in WGS84 degrees. */
  /** Null for station/district context that is not sampled to a grid point. */
  cellCenter: [number, number] | null;
}

/** Discriminated union of weather product types. */
export type WeatherProductType =
  | "era5-land-historical"
  | "ecmwf-ifs-forecast"
  | "pmd-station"
  | "flood-event"
  | "crop-district";

/** ----------------------------------------------------------------------- */
/* ERA5-Land historical gridded weather (reanalysis estimates)             */
/** ----------------------------------------------------------------------- */

export type Era5LandVersion = "ERA5-Land-T" | "ERA5-Land";

export interface Era5LandObservation {
  /** Valid time of the forecast/reanalysis hour (UTC ISO 8601). This is the END of the hour the values describe. */
  validTime: string;
  /** 2 m temperature in degrees Celsius. Null when missing. */
  temperature2mC: number | null;
  /** 2 m dewpoint temperature in degrees Celsius. Null when missing. */
  dewpoint2mC: number | null;
  /**
   * Precipitation over the hour that ended at `validTime`, in metres (the
   * provider's own unit). Null when it could not be derived.
   *
   * The raw GRIB1 time-range fields determine whether this is already a
   * one-hour interval amount or a cumulative forecast-step value. Interval
   * amounts are used directly; cumulative values are differenced within the
   * same forecast cycle.
   */
  hourlyPrecipitationM: number | null;
  /** 10 m wind speed in metres per second. Null when missing. */
  windSpeed10mMs: number | null;
  /** Quality/provisional flag when the provider reports it. */
  qualityFlag?: string;
}

export interface Era5LandHistorical extends WeatherProductBase {
  type: "era5-land-historical";
  /** ERA5-Land-T (provisional, ~5 days behind) or consolidated ERA5-Land. */
  version: Era5LandVersion;
  /** Variables requested, e.g. ["2m_temperature", "total_precipitation"]. */
  variables: string[];
  /** Temporal resolution: "hourly". */
  temporalResolution: "hourly";
  /** Spatial resolution: "0.1_deg" (~9 km). */
  spatialResolution: "0.1_deg";
  /** Requested period [from, to] as YYYY-MM-DD. */
  period: { from: string; to: string };
  /** Hourly observations. Empty when no usable values were retrieved. */
  observations: Era5LandObservation[];
  /**
   * Whether the decoder, timing interpretation and hourly precipitation
   * assembly have been independently checked against genuine provider
   * payloads. This validates the interpretation path; each value remains a
   * gridded reanalysis estimate, not a station measurement.
   */
  precipitationValidated: boolean;
  /** Why an hourly precipitation value is missing, keyed by its validity time. */
  precipitationGaps?: Record<string, string>;
}

/** ----------------------------------------------------------------------- */
/* ECMWF Open Data IFS forecast                                            */
/** ----------------------------------------------------------------------- */

export interface EcmwfForecastFrame {
  /** Forecast step in hours from the reference run time. */
  stepHours: number;
  /** Valid time of this forecast frame (UTC ISO 8601). */
  validTime: string;
  /** 2 m temperature in degrees Celsius. Null when missing. */
  temperature2mC: number | null;
  /** Total precipitation in metres accumulated from forecast initialization to this lead. */
  totalPrecipitationM: number | null;
  /** 10 m wind speed in metres per second. Null when missing. */
  windSpeed10mMs: number | null;
  /** Safe per-parameter retrieval/decoding failures for this lead time. */
  missingFields?: string[];
}

export interface EcmwfIfsForecast extends WeatherProductBase {
  type: "ecmwf-ifs-forecast";
  /** Forecast model: "ifs". */
  model: "ifs";
  /** Resolution tier: "0.1_deg" or "0.25_deg". */
  resolution: "0.1_deg" | "0.25_deg";
  /** Forecast run / issue time (UTC ISO 8601), e.g. 2026-11-09T00:00:00Z. */
  issueTime: string;
  /** Forecast horizon in hours, e.g. 120 for 5 days. */
  horizonHours: number;
  /** Forecast steps available, in hours. */
  steps: number[];
  /** Forecast frames, newest run first. */
  frames: EcmwfForecastFrame[];
}

/** ----------------------------------------------------------------------- */
/* PMD station observation reference (link-only, no programmatic data)     */
/** ----------------------------------------------------------------------- */

export interface PmdStationReference extends WeatherProductBase {
  type: "pmd-station";
  /** Station name, e.g. "Khanewal". */
  station: string;
  /** Official PMD page URL for this station/region. */
  referenceUrl: string;
  /** Note about what the page contains and its limits. */
  note: string;
}

/** ----------------------------------------------------------------------- */
/* Dated flood-event context (PDMA Punjab / PMD Flood Forecasting Division) */
/** ----------------------------------------------------------------------- */

export interface FloodEventRecord {
  /** Event date or date range, as published. */
  date: string;
  /** Geography covered, e.g. "Punjab province" or "Khanewal district". */
  geography: string;
  /** Short description of the event and impacts. */
  description: string;
  /** Official source document URL. */
  sourceUrl: string;
  /** Publisher: "PDMA Punjab" or "PMD Flood Forecasting Division". */
  publisher: string;
  /** Confidence / caveat about AOI overlap. */
  caveat: string;
}

export interface FloodContext extends WeatherProductBase {
  type: "flood-event";
  /** Reviewed, dated flood event records. Empty when no usable record exists. */
  events: FloodEventRecord[];
  /** Whether any event geographically overlaps or is near the AOI. */
  aoiRelevant: boolean;
}

/** ----------------------------------------------------------------------- */
/* District crop-area statistics (Punjab Crop Reporting Service)           */
/** ----------------------------------------------------------------------- */

export interface CropDistrictEstimate {
  /** Crop name, e.g. "Mango". */
  crop: string;
  /** District name, e.g. "Khanewal" or "Okara". */
  district: string;
  /** Estimate year, e.g. "2023-24" or "2024 census". */
  year: string;
  /** Area estimate value. */
  areaValue: number | null;
  /** Unit, e.g. "hectares" or "acres". */
  unit: string;
  /** Average yield estimate, if published. */
  yieldValue: number | null;
  /** Yield unit, e.g. "kg/hectare". */
  yieldUnit: string | null;
  /** A count the source publishes for the crop, e.g. a census tree count. */
  count?: number | null;
  /** What the count measures. */
  countLabel?: string;
  /** Official source document URL. */
  sourceUrl: string;
  /** Caveat: district-level, not farm-level. */
  caveat: string;
}

export interface CropContext extends WeatherProductBase {
  type: "crop-district";
  /** District-level crop estimates. Empty when no usable record exists. */
  estimates: CropDistrictEstimate[];
}

/** ----------------------------------------------------------------------- */
/* Response envelopes                                                      */
/** ----------------------------------------------------------------------- */

export type WeatherProductResult =
  | Era5LandHistorical
  | EcmwfIfsForecast
  | PmdStationReference
  | FloodContext
  | CropContext;

export type WeatherProductResponse =
  | { ok: true; product: WeatherProductResult }
  | { ok: false; error: WeatherError };

/** Combined weather context result for one AOI, all product types. */
export interface WeatherContextResult {
  ok: true;
  aoi: WeatherAoiDescriptor;
  retrievedAt: string;
  products: WeatherProductResult[];
}

export type WeatherContextResponse = WeatherContextResult | { ok: false; error: WeatherError };
