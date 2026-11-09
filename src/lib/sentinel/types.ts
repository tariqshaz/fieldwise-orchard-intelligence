/**
 * Shared, client-safe types for the Sentinel-2 observation slice.
 *
 * Nothing in this file is provider- or secret-specific: it describes what the
 * dashboard displays (scene list, NDVI summary, masking disclosure) and the
 * non-sensitive error vocabulary returned by the server functions. OAuth
 * credentials and raw provider payloads never appear here.
 */

/** Where the area of interest came from. */
export type AoiKind = "imported-boundary" | "sample";

/** Human-readable provenance for the AOI used in a request. */
export interface AoiDescriptor {
  kind: AoiKind;
  /** Short label shown in the selector, e.g. an import file name. */
  label: string;
  /** Always-visible provenance sentence shown next to results. */
  provenance: string;
}

/** One Sentinel-2 L2A scene as listed by the provider catalog. */
export interface SentinelScene {
  /** Provider product identifier, e.g. `S2A_MSIL2A_20240615T103621_R022_T32TQM_…`. */
  id: string;
  /** Acquisition time (UTC, ISO 8601) as reported by the catalog. */
  acquiredAt: string;
  /** Tile-wide cloud cover percent (`eo:cloud_cover`), when the catalog reports it. */
  tileCloudCoverPct: number | null;
  /** Ground sample distance in metres, when reported. */
  gsdMeters: number | null;
  /** Platform name, e.g. `sentinel-2a`. */
  platform: string | null;
  /** Provider used to list this scene; lets retrieval use the same catalog. */
  provider?: "cdse" | "planetary-computer";
}

/** Non-sensitive failure vocabulary. Messages never contain secrets or provider bodies. */
export type SentinelErrorCode =
  | "invalid_input"
  | "geometry_invalid"
  | "aoi_too_large"
  | "date_range_too_long"
  | "credentials_missing"
  | "auth_failed"
  | "rate_limited"
  | "timeout"
  | "provider_error"
  | "provider_response_invalid"
  | "internal";

export interface SentinelError {
  code: SentinelErrorCode;
  message: string;
}

export interface SceneSearchResult {
  ok: true;
  /** Newest first, bounded by `limit`. */
  scenes: SentinelScene[];
  provider: "cdse" | "planetary-computer";
  /** True when the provider returned a full page — more scenes may exist. */
  truncated: boolean;
  limit: number;
  aoi: AoiDescriptor;
  dateRange: { from: string; to: string };
  searchedAt: string;
}

export type SceneSearchResponse = SceneSearchResult | { ok: false; error: SentinelError };

/** NDVI summary over usable pixels, as reported by the provider statistics.
 *  Figure fields are `null` when the provider did not report them. */
export interface NdviSummary {
  min: number | null;
  max: number | null;
  mean: number | null;
  stDev: number | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  /** Total AOI bounding-box samples processed. */
  sampleCount: number;
  /** Samples excluded (outside the boundary, masked, or undefined). */
  noDataCount: number;
  /**
   * Usable pixels as a percentage of the AOI bounding box:
   * `(sampleCount - noDataCount) / sampleCount`. For non-rectangular
   * boundaries this is a conservative figure — see the caveats.
   */
  validPixelPct: number;
  /** NDVI histogram over [-1, 1] when requested from the provider. */
  histogram: { lowEdge: number; highEdge: number; count: number }[];
  /** Samples that fell outside the requested [-1, 1] histogram range. */
  histogramUnderflow: number;
  histogramOverflow: number;
}

/** One SCL class with its exclusion rationale, for the masking disclosure. */
export interface SclMaskClass {
  value: number;
  label: string;
  reason: string;
}

/** Masking actually applied to the preview and the statistics. */
export interface MaskingDisclosure {
  excluded: SclMaskClass[];
  retained: SclMaskClass[];
  /** Machine-readable rules, shown verbatim so the mask is auditable. */
  rules: string[];
}

export interface NdviPreview {
  /** `data:image/png;base64,…` — RGBA PNG, masked pixels fully transparent. */
  dataUrl: string;
  /** Planetary Computer sends compact grayscale for browser-side NDVI colorization. */
  encoding?: "ndvi-grayscale";
  width: number;
  height: number;
  /** Geographic bounds of the rendered image, west/south/east/north (WGS84). */
  bbox: [number, number, number, number];
  /** Approximate ground size of one rendered pixel, in metres. */
  metersPerPixel: number | null;
}

export interface NdviObservationResult {
  ok: true;
  scene: SentinelScene;
  provider: "cdse" | "planetary-computer";
  aoi: AoiDescriptor;
  /** Server clock when processing finished (UTC ISO 8601). */
  retrievedAt: string;
  preview: NdviPreview;
  summary: NdviSummary;
  masking: MaskingDisclosure;
  /** Resolution the statistics were sampled at, in metres. */
  statsResolutionMeters: number;
  caveats: string[];
  /** Provider and data-source attribution for this observation. */
  attribution: string;
}

export type NdviObservationResponse = NdviObservationResult | { ok: false; error: SentinelError };
