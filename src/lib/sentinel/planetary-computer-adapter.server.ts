/**
 * Public, no-account Sentinel-2 demo provider. Microsoft Planetary Computer
 * supplies STAC metadata and its public data API computes bounded preview and
 * statistics requests. This is a best-effort public service; only approved
 * public sample AOIs may use it.
 *
 * Band math contract (confirmed against the provider's data API):
 *   - With `asset_as_band=true`, band names are the asset names (`B08`,
 *     `B04`, `SCL`). Indexed names such as `asset1_b1` are rejected.
 *   - Statistics use a bottom sentinel (-9999); the preview uses a compact
 *     -2 sentinel and is colorized from a grayscale PNG in the browser.
 *     preview encodes unusable samples as grayscale zero, then the browser
 *     makes those pixels transparent and applies the shared NDVI ramp.
 *     (key 0 hijacked to [0,0,0,0]); `nodata` is deliberately NOT sent — the
 *     provider errors out when it receives one and it never masks expression
 *     output anyway.
 *   - Preview and statistics use the identical expression, AOI and output
 *     size class, so the picture, the numbers and the disclosed mask never
 *     drift apart.
 *   - Statistics are computed from two parallel calls with the same geometry:
 *     a bottom-sentinel call (exact max; mean/std debiased from the sentinel
 *     pollution; histogram over usable pixels) and a top-sentinel call
 *     (exact min).
 *
 * Requests are retried a bounded number of times: the public data API is
 * best-effort and intermittently returns 5xx. Nothing here is secret: no
 * credentials, no signed URLs, and no response bodies are ever logged.
 */
import { bboxOfCoordinates, SENTINEL_LIMITS } from "./aoi.ts";
import { SENTINEL_ERROR_MESSAGES } from "./errors.ts";
import { EXCLUDED_SCL } from "./ndvi.ts";
import type { SentinelErrorCode, SentinelScene } from "./types.ts";
import type {
  CdseSentinelProvider,
  RawNdviStats,
  RetrieveNdviParams,
  SearchScenesParams,
} from "./cdse-adapter.server.ts";

const API_URL = "https://planetarycomputer.microsoft.com/api/stac/v1";
const SEARCH_URL = `${API_URL}/search`;
const DATA_API_URL = "https://planetarycomputer.microsoft.com/api/data/v1/item";
const COLLECTION = "sentinel-2-l2a";
const SCENE_CAP = 8 * 1024 * 1024;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 8_000;
const HISTOGRAM_BINS = 10;
const HISTOGRAM_RANGE = "-1,1";
const BOTTOM_SENTINEL = -9999;
const PREVIEW_SENTINEL = -2;
const TOP_SENTINEL = 65535;

const EXCLUDED_SCL_VALUES: readonly number[] = EXCLUDED_SCL.map((entry) => entry.value);
// Parenthesize each comparison separately. The data API's expression parser
// binds `|` differently from JavaScript; `SCL==0|SCL==1` can become a server
// error, while `(SCL==0)|(SCL==1)` is parsed as the intended boolean OR.
const SCL_PREDICATE = EXCLUDED_SCL_VALUES.map((value) => `(SCL==${value})`).join("|");
const NDVI_EXPRESSION = "(B08-B04)/(B08+B04)";
const USABLE_CONDITION = `(${SCL_PREDICATE})|((B08+B04)==0)|(${NDVI_EXPRESSION}<-1)|(${NDVI_EXPRESSION}>1)`;

/** NDNI for usable pixels, bottom sentinel elsewhere — drives both preview and heavy statistics. */
export function buildMaskedNdviExpression(): string {
  return `where(${USABLE_CONDITION},${BOTTOM_SENTINEL},${NDVI_EXPRESSION})`;
}

/** Encode preview as grayscale: sentinel -2 becomes byte 0; valid NDVI [-1,1]
 *  becomes bytes [85,255] for client-side colorization. */
export function buildPreviewNdviExpression(): string {
  return `where(${USABLE_CONDITION},${PREVIEW_SENTINEL},${NDVI_EXPRESSION})`;
}

/** NDVI for usable pixels, top sentinel elsewhere — drives the exact-min statistics call. */
export function buildTopSentinelExpression(): string {
  return `where(${USABLE_CONDITION},${TOP_SENTINEL},${NDVI_EXPRESSION})`;
}

/** TiTiler colormap for NDVI rescaled from [-1, 1] to [0, 255].
 *  Use all 256 indexes explicitly: some public TiTiler deployments ignore
 *  `colormap_type=linear`, leaving only sparse stop indexes colored. Index 0
 *  is transparent for masked bottom-sentinel pixels; all valid indexes are
 *  opaque and follow the same ramp as the UI legend. */
export class PlanetaryComputerProviderError extends Error {
  readonly code: SentinelErrorCode;
  readonly status?: number;
  constructor(code: SentinelErrorCode, status?: number) {
    const message =
      code === "rate_limited"
        ? SENTINEL_ERROR_MESSAGES.rate_limited
        : code === "timeout"
          ? SENTINEL_ERROR_MESSAGES.timeout
          : code === "provider_response_invalid"
            ? SENTINEL_ERROR_MESSAGES.provider_response_invalid
            : code === "provider_error" && status !== undefined
              ? SENTINEL_ERROR_MESSAGES.provider_error(status)
              : SENTINEL_ERROR_MESSAGES.provider_unreachable;
    super(message);
    this.name = "PlanetaryComputerProviderError";
    this.code = code;
    this.status = status;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function logSafe(stage: string, details: Record<string, unknown>): void {
  console.log("[sentinel-planetary-computer]", JSON.stringify({ stage, ...details }));
}

/**
 * Fetch with a bounded number of attempts. Transient failures (network,
 * timeouts, 429, 5xx) are retried with backoff; bad requests (4xx) and
 * response-shape failures are not.
 */
async function safeFetch(url: string, stage: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(SENTINEL_LIMITS.providerTimeoutMs),
      });
      if (response.ok) {
        logSafe("http-ok", {
          stage,
          host: new URL(url).hostname,
          status: response.status,
          attempt: attempt + 1,
        });
        return response;
      }
      const code =
        response.status === 429
          ? "rate_limited"
          : response.status >= 500
            ? "provider_error"
            : "provider_response_invalid";
      logSafe("http-failed", {
        stage,
        host: new URL(url).hostname,
        status: response.status,
        code,
        attempt: attempt + 1,
      });
      lastError = new PlanetaryComputerProviderError(
        code,
        code === "provider_error" ? response.status : undefined,
      );
      // 4xx means the request itself is bad — no point retrying.
      if (code === "provider_response_invalid") throw lastError;
    } catch (error) {
      if (
        error instanceof PlanetaryComputerProviderError &&
        error.code === "provider_response_invalid"
      ) {
        throw error;
      }
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        lastError = new PlanetaryComputerProviderError("timeout");
      } else {
        lastError = error;
      }
      logSafe("http-retrying", { stage, attempt: attempt + 1 });
    }
    if (attempt + 1 < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * (attempt + 1)));
    }
  }
  throw lastError;
}

async function json(response: Response, stage: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    logSafe("invalid-json", { stage, contentType: response.headers.get("content-type") });
    throw new PlanetaryComputerProviderError("provider_response_invalid");
  }
}

async function searchItems(
  params: SearchScenesParams,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const payload = await json(
    await safeFetch(SEARCH_URL, "catalog-search", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/geo+json" },
      body: JSON.stringify({
        collections: [COLLECTION],
        bbox: params.bbox,
        datetime: `${params.from}T00:00:00Z/${params.to}T23:59:59Z`,
        limit,
        sortby: [{ field: "properties.datetime", direction: "desc" }],
      }),
    }),
    "catalog-search",
  );
  const root = record(payload);
  if (!root || !Array.isArray(root.features)) {
    logSafe("unexpected-shape", {
      stage: "catalog-search",
      isObject: root !== null,
      hasFeatures: Array.isArray(root?.features),
    });
    throw new PlanetaryComputerProviderError("provider_response_invalid");
  }
  return root.features.map(record).filter((item): item is Record<string, unknown> => item !== null);
}

async function searchScenes(params: SearchScenesParams) {
  const features = await searchItems(params, params.limit + 1);
  const parsed: SentinelScene[] = [];
  for (const item of features.slice(0, params.limit)) {
    const props = record(item.properties);
    const id = typeof item.id === "string" ? item.id : null;
    const datetime = typeof props?.datetime === "string" ? props.datetime : null;
    if (!id || !datetime || !Number.isFinite(Date.parse(datetime))) continue;
    parsed.push({
      id,
      acquiredAt: new Date(datetime).toISOString(),
      tileCloudCoverPct: finite(props?.["eo:cloud_cover"]),
      gsdMeters: finite(props?.gsd) ?? 10,
      platform: typeof props?.platform === "string" ? props.platform : null,
      provider: "planetary-computer",
    });
  }
  parsed.sort((a, b) => Date.parse(b.acquiredAt) - Date.parse(a.acquiredAt));
  return { scenes: parsed, truncated: features.length > params.limit };
}

function featureGeometry(geometry: RetrieveNdviParams["geometry"]): Record<string, unknown> {
  return { type: "Feature", properties: {}, geometry };
}

function statisticsQuery(
  expression: string,
  statsWidth: number,
  statsHeight: number,
  includeHistogram = true,
): URLSearchParams {
  const query = new URLSearchParams({
    collection: COLLECTION,
    assets: "B08",
    asset_as_band: "true",
    width: String(statsWidth),
    height: String(statsHeight),
    max_size: String(Math.max(statsWidth, statsHeight)),
    expression,
  });
  if (includeHistogram) {
    query.set("histogram_bins", String(HISTOGRAM_BINS));
    query.set("histogram_range", HISTOGRAM_RANGE);
  }
  query.append("assets", "B04");
  query.append("assets", "SCL");
  return query;
}

export function parseHistogram(
  histogramRaw: unknown,
): { counts: number[]; edges: number[] } | null {
  if (!Array.isArray(histogramRaw) || histogramRaw.length !== 2) return null;
  const counts = histogramRaw[0];
  const edges = histogramRaw[1];
  if (!Array.isArray(counts) || !Array.isArray(edges) || edges.length < 2) return null;
  const countValues: number[] = [];
  for (const entry of counts) {
    const number = finite(entry);
    if (number === null || !Number.isFinite(number) || number < 0) return null;
    countValues.push(number);
  }
  const edgeValues: number[] = [];
  for (const entry of edges) {
    const number = finite(entry);
    if (number === null) return null;
    edgeValues.push(number);
  }
  if (countValues.length + 1 !== edgeValues.length) return null;
  return { counts: countValues, edges: edgeValues };
}

export function percentileFromBins(counts: number[], edges: number[], q: number): number | null {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total <= 0) return null;
  const target = (q / 100) * total;
  let accumulated = 0;
  for (let index = 0; index < counts.length; index += 1) {
    const count = counts[index];
    if (accumulated + count >= target) {
      const low = edges[index];
      const high = edges[index + 1];
      const fraction = count <= 0 ? 0 : (target - accumulated) / count;
      return low + (high - low) * fraction;
    }
    accumulated += count;
  }
  return edges[edges.length - 1];
}

/** Interpret Planetary Computer's separate source-mask and expression-mask
 *  counts. `count` covers pixels with source data (including our sentinel),
 *  `masked_pixels` covers source no-data, and the NDVI histogram covers only
 *  usable values in [-1, 1]. */
export function deriveSamplePixelCounts({
  count,
  sourceMasked,
  histogramCounts,
}: {
  count: number;
  sourceMasked: number;
  histogramCounts: number[];
}): { sampleCount: number; noDataCount: number; expressionMasked: number; valid: number } | null {
  const valid = histogramCounts.reduce((total, value) => total + value, 0);
  if (
    !Number.isFinite(count) ||
    !Number.isFinite(sourceMasked) ||
    count <= 0 ||
    sourceMasked < 0 ||
    valid <= 0 ||
    valid > count
  ) {
    return null;
  }
  const expressionMasked = count - valid;
  const sampleCount = count + sourceMasked;
  return {
    sampleCount,
    noDataCount: sampleCount - valid,
    expressionMasked,
    valid,
  };
}

/**
 * Debias provider statistics that include bottom-sentinel pixels (-9999).
 * The provider aggregates every output pixel, sentinel included, so:
 *   meanValid = (sum - sentinel * nMasked) / nValid
 *   varValid  = (std^2 + mean^2) * nAll / nValid - sentinel^2 * nMasked / nValid - meanValid^2
 * Population (ddof=0) moments, matching the provider's statistics.
 */
export function debiasStatistics({
  count,
  sum,
  mean,
  std,
  masked,
}: {
  count: number;
  sum: number;
  mean: number;
  std: number;
  masked: number;
}): { meanValid: number; stDevValid: number } | null {
  const nAll = count;
  const nMasked = masked;
  const nValid = nAll - nMasked;
  if (!Number.isFinite(nValid) || nValid <= 0) return null;
  const sentinel = BOTTOM_SENTINEL;
  const sumValid = sum - sentinel * nMasked;
  const meanValid = sumValid / nValid;
  const sumSquaresAll = (std * std + mean * mean) * nAll;
  const sumSquaresValid = sumSquaresAll - sentinel * sentinel * nMasked;
  const varianceValid = sumSquaresValid / nValid - meanValid * meanValid;
  if (!Number.isFinite(meanValid) || !Number.isFinite(varianceValid) || varianceValid < 0)
    return null;
  return { meanValid, stDevValid: Math.sqrt(Math.max(0, varianceValid)) };
}

function bandStatsFromBlock(
  statisticsBlock: Record<string, unknown> | null,
  expression: string,
): Record<string, unknown> | null {
  if (!statisticsBlock) return null;
  const keyed = record(statisticsBlock[expression]);
  if (keyed && typeof keyed.min === "number") return keyed;
  for (const value of Object.values(statisticsBlock)) {
    const candidate = record(value);
    if (candidate !== null && typeof candidate.min === "number") return candidate;
  }
  return null;
}

async function retrieveNdvi(params: RetrieveNdviParams): Promise<{
  previewPngBase64: string;
  previewEncoding: "ndvi-grayscale";
  stats: RawNdviStats;
  statsResolutionMeters?: number;
}> {
  const bbox = bboxOfCoordinates(params.geometry.coordinates);
  if (!bbox) throw new PlanetaryComputerProviderError("provider_response_invalid");
  // Fetch the selected catalog item directly. Re-running a spatial search can
  // omit a valid selected item when paging/order changes or the AOI is narrow.
  const itemEndpoint = `${API_URL}/collections/${COLLECTION}/items/${encodeURIComponent(params.scene.id)}`;
  const itemPayload = record(
    await json(
      await safeFetch(itemEndpoint, "selected-item", {
        headers: { accept: "application/geo+json" },
      }),
      "selected-item",
    ),
  );
  const itemAssets = record(itemPayload?.assets);
  if (
    itemPayload?.id !== params.scene.id ||
    !itemAssets?.B08 ||
    !itemAssets?.B04 ||
    !itemAssets?.SCL
  ) {
    logSafe("unexpected-shape", {
      stage: "selected-item",
      idMatches: itemPayload?.id === params.scene.id,
      assetNames: itemAssets ? Object.keys(itemAssets).slice(0, 20) : [],
      hasAssetsObject: itemAssets !== null,
    });
    throw new PlanetaryComputerProviderError("provider_response_invalid");
  }

  const maskedExpression = buildMaskedNdviExpression();
  const previewExpression = buildPreviewNdviExpression();
  const topExpression = buildTopSentinelExpression();
  const feature = featureGeometry(params.geometry);
  const [west, south, east, north] = bbox;
  const midLat = (south + north) / 2;
  const widthMeters = (east - west) * 111_320 * Math.cos((midLat * Math.PI) / 180);
  const heightMeters = (north - south) * 110_540;
  const maxStatsSide = Math.floor(Math.sqrt(SENTINEL_LIMITS.maxStatsSamples));
  let statsWidth = Math.max(1, Math.ceil(widthMeters / params.resMeters));
  let statsHeight = Math.max(1, Math.ceil(heightMeters / params.resMeters));
  const scale = Math.min(1, maxStatsSide / Math.max(statsWidth, statsHeight));
  statsWidth = Math.max(1, Math.floor(statsWidth * scale));
  statsHeight = Math.max(1, Math.floor(statsHeight * scale));
  const actualStatsResolution = Math.max(widthMeters / statsWidth, heightMeters / statsHeight);

  const heavyQuery = statisticsQuery(maskedExpression, statsWidth, statsHeight);
  heavyQuery.set("item", params.scene.id);
  const lightQuery = statisticsQuery(topExpression, statsWidth, statsHeight, false);
  lightQuery.set("item", params.scene.id);

  const previewQuery = new URLSearchParams({
    collection: COLLECTION,
    item: params.scene.id,
    asset_as_band: "true",
    expression: previewExpression,
    width: String(params.width),
    height: String(params.height),
    max_size: String(Math.max(params.width, params.height)),
    rescale: "-2,1",
    return_mask: "true",
  });
  previewQuery.append("assets", "B08");
  previewQuery.append("assets", "B04");
  previewQuery.append("assets", "SCL");

  const [previewResponse, heavyResponse, lightResponse] = await Promise.all([
    safeFetch(
      `${DATA_API_URL}/feature/${params.width}x${params.height}.png?${previewQuery}`,
      "preview",
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "image/png" },
        body: JSON.stringify(feature),
      },
    ),
    safeFetch(`${DATA_API_URL}/statistics?${heavyQuery}`, "statistics-heavy", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(feature),
    }),
    safeFetch(`${DATA_API_URL}/statistics?${lightQuery}`, "statistics-light", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(feature),
    }),
  ]);

  const bytes = new Uint8Array(await previewResponse.arrayBuffer());
  if (
    bytes.length < 8 ||
    bytes.length > SCENE_CAP ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    logSafe("invalid-preview", {
      stage: "preview-content",
      contentType: previewResponse.headers.get("content-type"),
      byteLength: bytes.length,
    });
    throw new PlanetaryComputerProviderError("provider_response_invalid");
  }
  // IHDR is the first chunk: width/height at bytes 16..24, big-endian.
  const previewView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const previewWidth = previewView.getUint32(16);
  const previewHeight = previewView.getUint32(20);
  if (previewWidth !== params.width || previewHeight !== params.height) {
    logSafe("invalid-preview", {
      stage: "preview-dimensions",
      requested: { width: params.width, height: params.height },
      returned: { width: previewWidth, height: previewHeight },
    });
    throw new PlanetaryComputerProviderError("provider_response_invalid");
  }

  const heavyPayload = record(await json(heavyResponse, "statistics-heavy"));
  const heavyProperties = record(heavyPayload?.properties);
  const heavyBlock =
    record(heavyProperties?.statistics) ?? record(heavyPayload?.statistics) ?? null;
  const heavyStats = bandStatsFromBlock(heavyBlock, maskedExpression);
  if (!heavyStats) {
    logSafe("unexpected-shape", {
      stage: "statistics-heavy-shape",
      topLevelKeys: heavyPayload ? Object.keys(heavyPayload).slice(0, 20) : [],
      propertyKeys:
        heavyPayload && record(heavyPayload.properties)
          ? Object.keys(record(heavyPayload.properties)!).slice(0, 20)
          : [],
      statisticsKeys: heavyBlock ? Object.keys(heavyBlock).slice(0, 20) : [],
    });
    throw new PlanetaryComputerProviderError("provider_response_invalid");
  }

  const count = finite(heavyStats.count);
  const sum = finite(heavyStats.sum);
  const meanAll = finite(heavyStats.mean);
  const stdAll = finite(heavyStats.std);
  const maxValid = finite(heavyStats.max);
  const maskedPixels = finite(heavyStats.masked_pixels);
  const validPixelsReported = finite(heavyStats.valid_pixels);

  if (
    count === null ||
    sum === null ||
    meanAll === null ||
    stdAll === null ||
    maxValid === null ||
    maskedPixels === null
  ) {
    logSafe("invalid-statistics", {
      stage: "statistics-heavy-missing-fields",
      present: {
        count: count !== null,
        sum: sum !== null,
        mean: meanAll !== null,
        std: stdAll !== null,
        max: maxValid !== null,
        masked: maskedPixels !== null,
      },
    });
    throw new PlanetaryComputerProviderError("provider_response_invalid");
  }

  if (count <= 0 || maskedPixels < 0) {
    logSafe("invalid-statistics", {
      stage: "statistics-heavy-values",
      count,
      sum,
      mean: meanAll,
      std: stdAll,
      max: maxValid,
      sourceMasked: maskedPixels,
    });
    throw new PlanetaryComputerProviderError("provider_response_invalid");
  }
  if (maxValid < -1 || maxValid > 1) {
    logSafe("invalid-statistics", { stage: "statistics-heavy-range", max: maxValid });
    throw new PlanetaryComputerProviderError("provider_response_invalid");
  }

  const histogramRaw = heavyStats.histogram;
  const histogram = parseHistogram(histogramRaw);
  if (!histogram) {
    logSafe("invalid-statistics", {
      stage: "statistics-heavy-histogram",
      histogramRaw: Array.isArray(histogramRaw) ? histogramRaw.length : typeof histogramRaw,
    });
    throw new PlanetaryComputerProviderError("provider_response_invalid");
  }
  const histSum = histogram.counts.reduce((total, countValue) => total + countValue, 0);
  const pixelCounts = deriveSamplePixelCounts({
    count,
    sourceMasked: maskedPixels,
    histogramCounts: histogram.counts,
  });
  if (!pixelCounts) {
    logSafe("invalid-statistics", {
      stage: "statistics-heavy-pixel-counts",
      count,
      sourceMasked: maskedPixels,
      histogramValid: histSum,
    });
    throw new PlanetaryComputerProviderError("provider_response_invalid");
  }

  const debiased = debiasStatistics({
    count,
    sum,
    mean: meanAll,
    std: stdAll,
    masked: pixelCounts.expressionMasked,
  });
  if (!debiased) {
    logSafe("invalid-statistics", {
      stage: "statistics-heavy-debias",
      count,
      expressionMasked: pixelCounts.expressionMasked,
      valid: pixelCounts.valid,
    });
    throw new PlanetaryComputerProviderError("provider_response_invalid");
  }
  const { meanValid, stDevValid } = debiased;
  if (!Number.isFinite(meanValid) || meanValid < -1 || meanValid > 1) {
    logSafe("invalid-statistics", { stage: "statistics-heavy-mean", mean: meanValid });
    throw new PlanetaryComputerProviderError("provider_response_invalid");
  }
  if (!Number.isFinite(stDevValid) || stDevValid < 0 || stDevValid > 2) {
    logSafe("invalid-statistics", { stage: "statistics-heavy-stdev", stDev: stDevValid });
    throw new PlanetaryComputerProviderError("provider_response_invalid");
  }

  const lightPayload = record(await json(lightResponse, "statistics-light"));
  const lightProperties = record(lightPayload?.properties);
  const lightBlock =
    record(lightProperties?.statistics) ?? record(lightPayload?.statistics) ?? null;
  const lightStats = bandStatsFromBlock(lightBlock, topExpression);
  const minValid = finite(lightStats?.min);
  if (minValid === null || minValid < -1 || minValid > 1 || minValid > maxValid) {
    logSafe("invalid-statistics", {
      stage: "statistics-light-range",
      min: minValid,
      max: maxValid,
    });
    throw new PlanetaryComputerProviderError("provider_response_invalid");
  }

  logSafe("statistics-parsed", {
    count,
    sourceMasked: maskedPixels,
    expressionMasked: pixelCounts.expressionMasked,
    noDataCount: pixelCounts.noDataCount,
    sampleCount: pixelCounts.sampleCount,
    validPixelsReported,
    histSum,
    min: minValid,
    max: maxValid,
    mean: Number(meanValid.toFixed(4)),
    stDev: Number(stDevValid.toFixed(4)),
    p10: histogram ? percentileFromBins(histogram.counts, histogram.edges, 10) : null,
    p50: histogram ? percentileFromBins(histogram.counts, histogram.edges, 50) : null,
    p90: histogram ? percentileFromBins(histogram.counts, histogram.edges, 90) : null,
  });

  return {
    previewPngBase64: bytesToBase64(bytes),
    previewEncoding: "ndvi-grayscale",
    stats: {
      min: minValid,
      max: maxValid,
      mean: meanValid,
      stDev: stDevValid,
      p10: percentileFromBins(histogram.counts, histogram.edges, 10),
      p50: percentileFromBins(histogram.counts, histogram.edges, 50),
      p90: percentileFromBins(histogram.counts, histogram.edges, 90),
      sampleCount: pixelCounts.sampleCount,
      noDataCount: pixelCounts.noDataCount,
      histogram: histogram.counts.map((countValue, index) => ({
        lowEdge: histogram.edges[index],
        highEdge: histogram.edges[index + 1],
        count: countValue,
      })),
      histogramUnderflow: 0,
      histogramOverflow: 0,
    },
    statsResolutionMeters: actualStatsResolution,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function createPlanetaryComputerSentinelProvider(): CdseSentinelProvider {
  return { searchScenes, retrieveNdvi };
}
