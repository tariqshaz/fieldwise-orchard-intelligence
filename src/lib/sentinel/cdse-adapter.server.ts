/**
 * Copernicus Data Space Ecosystem (CDSE) Sentinel Hub adapter.
 *
 * Server-only (`.server.ts`): the OAuth client secret and access tokens live
 * exclusively in server environment variables and this module's memory —
 * nothing here reaches the browser bundle, logs, or error messages.
 *
 * Endpoints and request shapes follow the official CDSE documentation:
 *   - Token:   POST identity.dataspace.copernicus.eu …/openid-connect/token
 *              (grant_type=client_credentials). Tokens are cached until close
 *              to expiry because token requests are rate limited (429).
 *   - Catalog: POST sh.dataspace.copernicus.eu/catalog/v1/search
 *   - Process: POST sh.dataspace.copernicus.eu/process/v1  (RGBA PNG preview)
 *   - Stats:   POST sh.dataspace.copernicus.eu/statistics/v1 (exact NDVI figures)
 *
 * Single-scene guarantee: every imagery request pins a ≤20-minute window
 * centred on the selected acquisition. Sentinel Hub documents that any
 * interval shorter than 50 minutes cannot contain more than one Sentinel-2
 * acquisition, so different dates can never be mosaicked by accident.
 *
 * This module is the replaceable provider seam: swap `createCdseSentinelProvider`
 * for another implementation without touching the server functions or UI.
 */

import process from "node:process";

import { SENTINEL_ERROR_MESSAGES } from "./errors.ts";
import { SENTINEL_LIMITS, SentinelInputError, type Bbox } from "./aoi.ts";
import { buildNdviPreviewEvalscript, buildNdviStatsEvalscript } from "./ndvi.ts";
import type { SentinelErrorCode, SentinelError, SentinelScene } from "./types.ts";

const TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const CATALOG_SEARCH_URL = "https://sh.dataspace.copernicus.eu/catalog/v1/search";
const PROCESS_URL = "https://sh.dataspace.copernicus.eu/process/v1";
const STATISTICS_URL = "https://sh.dataspace.copernicus.eu/statistics/v1";
const COLLECTION_ID = "sentinel-2-l2a";

/** NDVI histogram bins requested from the statistics API, over [-1, 1]. */
const HISTOGRAM_BINS = 10;
/** Guard against an absurdly large preview payload. */
const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;
/** Treat a token as expired this many ms before its reported expiry. */
const TOKEN_SAFETY_MARGIN_MS = 60_000;

/**
 * Provider failure with a message that is always safe to show: no tokens,
 * no credentials, no raw response bodies.
 */
export class SentinelProviderError extends Error {
  readonly code: SentinelErrorCode;

  constructor(code: SentinelErrorCode, message: string) {
    super(message);
    this.name = "SentinelProviderError";
    this.code = code;
  }
}

/** Exact statistics for one scene, as reported by the Statistical API. */
export interface RawNdviStats {
  min: number | null;
  max: number | null;
  mean: number | null;
  stDev: number | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  sampleCount: number;
  noDataCount: number;
  histogram: { lowEdge: number; highEdge: number; count: number }[];
  histogramUnderflow: number;
  histogramOverflow: number;
}

export interface SearchScenesParams {
  bbox: Bbox;
  /** Inclusive `YYYY-MM-DD` window start. */
  from: string;
  /** Inclusive `YYYY-MM-DD` window end. */
  to: string;
  limit: number;
}

export interface RetrieveNdviParams {
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
  scene: SentinelScene;
  width: number;
  height: number;
  resMeters: number;
}

export interface CdseSentinelProvider {
  searchScenes(params: SearchScenesParams): Promise<{
    scenes: SentinelScene[];
    truncated: boolean;
  }>;
  retrieveNdvi(params: RetrieveNdviParams): Promise<{
    previewPngBase64: string;
    previewEncoding?: "ndvi-grayscale";
    stats: RawNdviStats;
    statsResolutionMeters?: number;
  }>;
}

// ---------------------------------------------------------------------------
// Credentials and token cache
// ---------------------------------------------------------------------------

interface CachedToken {
  value: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;
let tokenInflight: Promise<CachedToken> | null = null;

/** Read credentials per request — Cloudflare Workers bind env at request time. */
function readCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env["CDSE_OAUTH_CLIENT_ID"]?.trim();
  const clientSecret = process.env["CDSE_OAUTH_CLIENT_SECRET"]?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Whether the server has both CDSE credentials; this never exposes values. */
export function hasCdseCredentials(): boolean {
  return readCredentials() !== null;
}

function invalidateAccessToken(): void {
  cachedToken = null;
}

async function fetchAccessToken(): Promise<CachedToken> {
  const credentials = readCredentials();
  if (!credentials) {
    throw new SentinelProviderError(
      "credentials_missing",
      SENTINEL_ERROR_MESSAGES.credentials_missing,
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  });

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(SENTINEL_LIMITS.providerTimeoutMs),
    });
  } catch (error) {
    throw asTransportError(error);
  }

  if (response.status === 429) {
    throw new SentinelProviderError("rate_limited", SENTINEL_ERROR_MESSAGES.rate_limited);
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    // Bad client id/secret. The response body may echo request details — never
    // surface or log it.
    throw new SentinelProviderError("auth_failed", SENTINEL_ERROR_MESSAGES.auth_failed);
  }
  if (!response.ok) {
    throw new SentinelProviderError(
      "provider_error",
      SENTINEL_ERROR_MESSAGES.provider_error(response.status),
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new SentinelProviderError(
      "provider_response_invalid",
      SENTINEL_ERROR_MESSAGES.provider_response_invalid,
    );
  }

  const record = asRecord(payload);
  const token = record && typeof record.access_token === "string" ? record.access_token : null;
  if (!token) {
    throw new SentinelProviderError(
      "provider_response_invalid",
      SENTINEL_ERROR_MESSAGES.provider_response_invalid,
    );
  }

  const expiresIn =
    typeof record?.expires_in === "number" && record.expires_in > 0 ? record.expires_in : 3600;
  const lifetimeMs = Math.max(expiresIn * 1000 - TOKEN_SAFETY_MARGIN_MS, 5_000);
  return { value: token, expiresAt: Date.now() + lifetimeMs };
}

/**
 * Reuse the cached token until close to expiry. Concurrent callers share one
 * in-flight token request so the rate-limited token endpoint is hit at most
 * once per expiry window.
 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  if (!tokenInflight) {
    tokenInflight = fetchAccessToken()
      .then((token) => {
        cachedToken = token;
        return token;
      })
      .finally(() => {
        tokenInflight = null;
      });
  }
  const token = await tokenInflight;
  return token.value;
}

// ---------------------------------------------------------------------------
// Authenticated provider calls
// ---------------------------------------------------------------------------

function asTransportError(error: unknown): SentinelProviderError {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new SentinelProviderError("timeout", SENTINEL_ERROR_MESSAGES.timeout);
  }
  return new SentinelProviderError("provider_error", SENTINEL_ERROR_MESSAGES.provider_unreachable);
}

async function providerFetch(
  url: string,
  body: unknown,
  accept = "application/json",
  allowRetry = true,
): Promise<Response> {
  const token = await getAccessToken();

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SENTINEL_LIMITS.providerTimeoutMs),
    });
  } catch (error) {
    throw asTransportError(error);
  }

  if (response.status === 401 || response.status === 403) {
    if (allowRetry) {
      // Expired or rotated token: drop the cache and retry exactly once.
      invalidateAccessToken();
      return providerFetch(url, body, accept, false);
    }
    throw new SentinelProviderError("auth_failed", SENTINEL_ERROR_MESSAGES.auth_failed);
  }
  if (response.status === 429) {
    throw new SentinelProviderError("rate_limited", SENTINEL_ERROR_MESSAGES.rate_limited);
  }
  if (!response.ok) {
    throw new SentinelProviderError(
      "provider_error",
      SENTINEL_ERROR_MESSAGES.provider_error(response.status),
    );
  }
  return response;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new SentinelProviderError(
      "provider_response_invalid",
      SENTINEL_ERROR_MESSAGES.provider_response_invalid,
    );
  }
}

// ---------------------------------------------------------------------------
// Catalog search
// ---------------------------------------------------------------------------

async function searchScenes(
  params: SearchScenesParams,
): Promise<{ scenes: SentinelScene[]; truncated: boolean }> {
  const body = {
    collections: [COLLECTION_ID],
    datetime: `${params.from}T00:00:00Z/${params.to}T23:59:59Z`,
    bbox: [...params.bbox],
    limit: params.limit,
    fields: {
      include: [
        "id",
        "bbox",
        "properties.datetime",
        "properties.eo:cloud_cover",
        "properties.gsd",
        "properties.platform",
      ],
    },
  };

  const response = await providerFetch(CATALOG_SEARCH_URL, body);
  const payload = asRecord(await readJson(response));
  const features = payload && Array.isArray(payload.features) ? payload.features : null;
  if (!features) {
    throw new SentinelProviderError(
      "provider_response_invalid",
      SENTINEL_ERROR_MESSAGES.provider_response_invalid,
    );
  }

  const scenes: SentinelScene[] = [];
  for (const feature of features) {
    const record = asRecord(feature);
    const properties = record ? asRecord(record.properties) : null;
    const id = record && typeof record.id === "string" ? record.id : null;
    const datetime =
      properties && typeof properties.datetime === "string" ? properties.datetime : null;
    if (!id || !datetime || !Number.isFinite(Date.parse(datetime))) continue;

    scenes.push({
      id,
      acquiredAt: new Date(datetime).toISOString(),
      tileCloudCoverPct: finiteOrNull(properties?.["eo:cloud_cover"]),
      gsdMeters: finiteOrNull(properties?.gsd),
      platform: properties && typeof properties.platform === "string" ? properties.platform : null,
      provider: "cdse",
    });
  }

  if (features.length > 0 && scenes.length === 0) {
    // Items arrived but nothing parsed — the response shape is not what this
    // adapter documents, so fail loudly instead of showing an empty list.
    throw new SentinelProviderError(
      "provider_response_invalid",
      SENTINEL_ERROR_MESSAGES.provider_response_invalid,
    );
  }

  // Newest acquisition first, by timestamp (never by string order).
  scenes.sort((a, b) => Date.parse(b.acquiredAt) - Date.parse(a.acquiredAt));

  const context = payload ? asRecord(payload.context) : null;
  const truncated =
    (context !== null && context.next !== undefined && context.next !== null) ||
    features.length >= params.limit;

  return { scenes, truncated };
}

// ---------------------------------------------------------------------------
// Single-scene NDVI retrieval (preview + exact statistics)
// ---------------------------------------------------------------------------

/**
 * Two windows derived from one acquisition:
 *  - input window: ±10 minutes (under the documented 50-minute rule this
 *    cannot contain a second acquisition, so no cross-date mosaicking);
 *  - aggregation window: the acquisition's full UTC day with a P1D interval,
 *    which is exactly divisible, so the statistics always return a single
 *    interval instead of being skipped as "not full".
 */
function sceneTimeWindows(acquiredAt: string): {
  inputRange: { from: string; to: string };
  aggregationRange: { from: string; to: string };
} {
  const acquiredMs = Date.parse(acquiredAt);
  if (!Number.isFinite(acquiredMs)) {
    throw new SentinelProviderError("invalid_input", SENTINEL_ERROR_MESSAGES.invalid_date);
  }

  const windowMs = SENTINEL_LIMITS.sceneWindowMinutes * 60_000;
  const dayStartMs = Date.UTC(
    new Date(acquiredMs).getUTCFullYear(),
    new Date(acquiredMs).getUTCMonth(),
    new Date(acquiredMs).getUTCDate(),
  );

  return {
    inputRange: {
      from: new Date(acquiredMs - windowMs).toISOString(),
      to: new Date(acquiredMs + windowMs).toISOString(),
    },
    aggregationRange: {
      from: new Date(dayStartMs).toISOString(),
      to: new Date(dayStartMs + 86_400_000).toISOString(),
    },
  };
}

async function retrieveNdvi(
  params: RetrieveNdviParams,
): Promise<{ previewPngBase64: string; stats: RawNdviStats }> {
  const { inputRange, aggregationRange } = sceneTimeWindows(params.scene.acquiredAt);

  const input = {
    bounds: {
      geometry: {
        type: params.geometry.type,
        coordinates: params.geometry.coordinates,
      },
    },
    data: [
      {
        type: COLLECTION_ID,
        dataFilter: {
          timeRange: inputRange,
          mosaickingOrder: "mostRecent",
        },
      },
    ],
  };

  const previewBody = {
    input,
    output: {
      width: params.width,
      height: params.height,
      responses: [{ identifier: "default", format: { type: "image/png" } }],
    },
    evalscript: buildNdviPreviewEvalscript(),
  };

  const statsBody = {
    input,
    aggregation: {
      timeRange: aggregationRange,
      evalscript: buildNdviStatsEvalscript(),
      resx: params.resMeters,
      resy: params.resMeters,
    },
    calculations: {
      default: {
        statistics: { default: { percentiles: { k: [10, 50, 90] } } },
        histograms: {
          default: { nBins: HISTOGRAM_BINS, lowEdge: -1, highEdge: 1 },
        },
      },
    },
  };

  const [previewResponse, statsResponse] = await Promise.all([
    providerFetch(PROCESS_URL, previewBody, "image/png"),
    providerFetch(STATISTICS_URL, statsBody),
  ]);

  const pngBytes = await readPngBytes(previewResponse);
  const statsPayload = await readJson(statsResponse);

  return {
    previewPngBase64: bytesToBase64(pngBytes),
    stats: parseStats(statsPayload, params.scene.acquiredAt),
  };
}

async function readPngBytes(response: Response): Promise<Uint8Array> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new SentinelProviderError(
      "provider_response_invalid",
      SENTINEL_ERROR_MESSAGES.provider_response_invalid,
    );
  }

  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  if (!isPng || bytes.length > MAX_PREVIEW_BYTES) {
    throw new SentinelProviderError(
      "provider_response_invalid",
      SENTINEL_ERROR_MESSAGES.provider_response_invalid,
    );
  }
  return bytes;
}

/** PNG bytes → base64 without Node-only APIs (works on Workers too). */
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Response parsing (defensive — malformed payloads become typed errors)
// ---------------------------------------------------------------------------

function parseStats(payload: unknown, acquiredAt: string): RawNdviStats {
  const root = asRecord(payload);
  if (!root || root.status !== "OK" || !Array.isArray(root.data) || root.data.length === 0) {
    throw new SentinelProviderError(
      "provider_response_invalid",
      SENTINEL_ERROR_MESSAGES.provider_response_invalid,
    );
  }

  const entry = pickInterval(root.data, acquiredAt);
  const outputs = entry ? asRecord(entry.outputs) : null;
  if (!outputs) {
    throw new SentinelProviderError(
      "provider_response_invalid",
      SENTINEL_ERROR_MESSAGES.provider_response_invalid,
    );
  }

  // Prefer the declared "ndvi" output; fall back to the first non-mask output.
  let output = asRecord(outputs.ndvi);
  if (!output) {
    for (const [key, value] of Object.entries(outputs)) {
      if (key !== "dataMask") {
        output = asRecord(value);
        if (output) break;
      }
    }
  }
  const bands = output ? asRecord(output.bands) : null;
  if (!bands) {
    throw new SentinelProviderError(
      "provider_response_invalid",
      SENTINEL_ERROR_MESSAGES.provider_response_invalid,
    );
  }

  let band = asRecord(bands.B0);
  if (!band) {
    const first = Object.values(bands)[0];
    band = asRecord(first);
  }
  const stats = band ? asRecord(band.stats) : null;
  if (!stats) {
    throw new SentinelProviderError(
      "provider_response_invalid",
      SENTINEL_ERROR_MESSAGES.provider_response_invalid,
    );
  }

  const sampleCount = finiteOrNull(stats.sampleCount) ?? 0;
  const noDataCount = finiteOrNull(stats.noDataCount) ?? 0;

  const histogramSource = band ? asRecord(band.histogram) : null;
  const rawBins =
    histogramSource && Array.isArray(histogramSource.bins) ? histogramSource.bins : [];
  const histogram = rawBins
    .map((bin) => {
      const record = asRecord(bin);
      if (!record) return null;
      const lowEdge = finiteOrNull(record.lowEdge);
      const highEdge = finiteOrNull(record.highEdge);
      if (lowEdge === null || highEdge === null) return null;
      return { lowEdge, highEdge, count: finiteOrNull(record.count) ?? 0 };
    })
    .filter((bin): bin is { lowEdge: number; highEdge: number; count: number } => bin !== null);

  const percentiles = stats.percentiles ? asRecord(stats.percentiles) : null;

  return {
    min: finiteOrNull(stats.min),
    max: finiteOrNull(stats.max),
    mean: finiteOrNull(stats.mean),
    stDev: finiteOrNull(stats.stDev),
    p10: percentileOf(percentiles, 10),
    p50: percentileOf(percentiles, 50),
    p90: percentileOf(percentiles, 90),
    sampleCount,
    noDataCount,
    histogram,
    histogramUnderflow: finiteOrNull(histogramSource?.underflowCount) ?? 0,
    histogramOverflow: finiteOrNull(histogramSource?.overflowCount) ?? 0,
  };
}

/** The interval that contains the acquisition; falls back to the first entry. */
function pickInterval(data: unknown[], acquiredAt: string): Record<string, unknown> | null {
  const entries = data
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null);
  if (entries.length === 0) return null;

  const target = Date.parse(acquiredAt);
  if (Number.isFinite(target)) {
    for (const entry of entries) {
      const interval = asRecord(entry.interval);
      const from = interval && typeof interval.from === "string" ? Date.parse(interval.from) : NaN;
      const to = interval && typeof interval.to === "string" ? Date.parse(interval.to) : NaN;
      if (Number.isFinite(from) && Number.isFinite(to) && target >= from && target < to) {
        return entry;
      }
    }
  }
  return entries[0];
}

/** Percentile keys arrive as `"10.0"`-style strings; match numerically. */
function percentileOf(record: Record<string, unknown> | null, k: number): number | null {
  if (!record) return null;
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "number" && Number.isFinite(value) && Math.abs(Number(key) - k) < 1e-9) {
      return value;
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Replaceable provider seam used by the server functions. */
export function createCdseSentinelProvider(): CdseSentinelProvider {
  return { searchScenes, retrieveNdvi };
}

/**
 * Map any thrown value to a non-sensitive `{code, message}` error the UI can
 * show. Only class names are ever logged — never messages, which could embed
 * provider details — and unknown failures become a generic safe message.
 */
export function toSentinelError(error: unknown): SentinelError {
  if (error instanceof SentinelProviderError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof SentinelInputError) {
    return { code: error.code, message: error.message };
  }
  console.error("[sentinel] unexpected error:", error instanceof Error ? error.name : "unknown");
  return { code: "internal", message: SENTINEL_ERROR_MESSAGES.internal };
}
