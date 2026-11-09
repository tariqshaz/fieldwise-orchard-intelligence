import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { validateStandaloneGeometry } from "../geospatial";
import {
  SENTINEL_LIMITS,
  SentinelInputError,
  assertAoiSpan,
  assertAoiVertexCount,
  geometryFromBbox,
  importedAoiDescriptor,
  metersPerPixelForBbox,
  previewSizeForBbox,
  sampleAoiById,
  sampleAoiDescriptor,
  statsResolutionForBbox,
  validateDateRange,
  type Bbox,
} from "../sentinel/aoi";
// Handler-only import: `.server.ts` modules are tree-shaken from the client
// bundle (see example.functions.ts). All adapter references below live inside
// `.handler` bodies so no provider code or env read reaches the browser.
import {
  createCdseSentinelProvider,
  hasCdseCredentials,
  SentinelProviderError,
  toSentinelError,
} from "../sentinel/cdse-adapter.server";
import {
  createPlanetaryComputerSentinelProvider,
  PlanetaryComputerProviderError,
} from "../sentinel/planetary-computer-adapter.server";
import { SENTINEL_ERROR_MESSAGES } from "../sentinel/errors";
import { EXCLUDED_SCL, MASK_RULES, RETAINED_SCL, validPixelPct } from "../sentinel/ndvi";
import type {
  AoiDescriptor,
  MaskingDisclosure,
  NdviObservationResponse,
  NdviSummary,
  SceneSearchResponse,
  SentinelScene,
} from "../sentinel/types";

// ---------------------------------------------------------------------------
// Input contracts. Zod bounds every field before any validation runs; the
// geometry itself is then checked with the Phase 1.1 rules and the provider
// request limits below. No provider call happens until all of it passes.
// ---------------------------------------------------------------------------

const geometrySchema = z.object({
  type: z.enum(["Polygon", "MultiPolygon"]),
  coordinates: z.unknown(),
});

const aoiSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("imported"),
    estateId: z.string().min(1).max(120),
    sourceName: z.string().min(1).max(200),
    geometry: geometrySchema,
  }),
  z.object({
    kind: z.literal("sample"),
    sampleId: z.string().min(1).max(120),
  }),
]);

const searchInputSchema = z.object({
  aoi: aoiSchema,
  from: z.string().length(10),
  to: z.string().length(10),
});

const retrieveInputSchema = z.object({
  aoi: aoiSchema,
  scene: z.object({
    sceneId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._-]+$/, "Scene id contains unsupported characters."),
    acquiredAt: z.string().min(1).max(40),
    tileCloudCoverPct: z.number().min(0).max(100).nullable().optional(),
    gsdMeters: z.number().min(1).max(10_000).nullable().optional(),
    platform: z.string().max(60).nullable().optional(),
    provider: z.enum(["cdse", "planetary-computer"]).optional(),
  }),
});

type AoiInput = z.infer<typeof aoiSchema>;

/** Client-visible input shapes (type-only — no server code ships). */
export type SearchSentinelScenesInput = z.infer<typeof searchInputSchema>;
export type RetrieveNdviObservationInput = z.infer<typeof retrieveInputSchema>;

interface ResolvedAoi {
  descriptor: AoiDescriptor;
  bbox: Bbox;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
}

/**
 * Resolve and validate an AOI before anything leaves this server:
 *  - sample AOIs come from the fixed, named list (never client geometry);
 *  - imported geometry is size-checked, then run through the Phase 1.1
 *    validator (same rules as the import dialog — never repaired or altered),
 *    then span-checked against the provider request bound.
 */
function resolveAoi(aoi: AoiInput): ResolvedAoi {
  if (aoi.kind === "sample") {
    const sample = sampleAoiById(aoi.sampleId);
    if (!sample) {
      throw new SentinelInputError("invalid_input", SENTINEL_ERROR_MESSAGES.unknown_sample);
    }
    assertAoiSpan(sample.bbox);
    return {
      descriptor: sampleAoiDescriptor(sample),
      bbox: sample.bbox,
      geometry: geometryFromBbox(sample.bbox),
    };
  }

  if (!aoi.geometry || typeof aoi.geometry !== "object") {
    throw new SentinelInputError("invalid_input", SENTINEL_ERROR_MESSAGES.missing_geometry);
  }

  // Cheap bounded vertex count first so hostile input is never walked deeply.
  assertAoiVertexCount(aoi.geometry.coordinates);

  const validated = validateStandaloneGeometry(aoi.geometry, "Area of interest");
  if (!validated.ok) {
    throw new SentinelInputError("geometry_invalid", validated.errors.join(" "));
  }

  const bbox: Bbox = [
    validated.bbox.minLon,
    validated.bbox.minLat,
    validated.bbox.maxLon,
    validated.bbox.maxLat,
  ];
  assertAoiSpan(bbox);

  return {
    descriptor: importedAoiDescriptor(aoi.sourceName),
    bbox,
    // Coordinates are the validated rings, unchanged. A single Polygon is
    // re-wrapped as a one-part MultiPolygon — a type change only — so every
    // provider request carries the same shape.
    geometry: { type: "MultiPolygon", coordinates: validated.geometry },
  };
}

/** Validate the round-tripped acquisition time of the selected scene. */
function parseAcquiredAt(value: string): string {
  const ms = Date.parse(value);
  const floorMs = Date.parse(`${SENTINEL_LIMITS.minDateFrom}T00:00:00Z`);
  if (!Number.isFinite(ms) || ms < floorMs || ms > Date.now() + 86_400_000) {
    throw new SentinelInputError("invalid_input", SENTINEL_ERROR_MESSAGES.acquired_at_invalid);
  }
  return new Date(ms).toISOString();
}

function buildMasking(): MaskingDisclosure {
  return {
    excluded: EXCLUDED_SCL.map((entry) => ({
      value: entry.value,
      label: entry.label,
      reason: entry.reason,
    })),
    retained: RETAINED_SCL.map((entry) => ({
      value: entry.value,
      label: entry.label,
      reason: entry.reason,
    })),
    rules: [...MASK_RULES],
  };
}

function buildCaveats(params: {
  statsResolutionMeters: number;
  width: number;
  height: number;
  metersPerPixel: number | null;
  validPct: number;
  sampleCount: number;
  noDataCount: number;
  tileCloudCoverPct: number | null;
}): string[] {
  const caveats = [
    "NDVI is computed from Sentinel-2 L2A surface reflectance as (B08 − B04) / (B08 + B04). " +
      "It describes reflectance only — not crop health, disease, irrigation need, or any " +
      "treatment decision.",
    "Pixels that fail the mask are rendered fully transparent and excluded from every " +
      "statistic; they are never shown as healthy vegetation.",
    `Valid-pixel percentage is relative to the AOI bounding box ` +
      `(${params.sampleCount.toLocaleString("en-US")} samples, ` +
      `${params.noDataCount.toLocaleString("en-US")} excluded). For a non-rectangular ` +
      "boundary this figure is conservative.",
    `Statistics sampled at ${params.statsResolutionMeters} m; preview rendered at ` +
      `${params.width}×${params.height} px` +
      (params.metersPerPixel !== null
        ? ` (about ${params.metersPerPixel.toFixed(1)} m/px, resampled from native resolution)`
        : ", resampled from native resolution") +
      ".",
  ];

  if (params.tileCloudCoverPct !== null) {
    caveats.push(
      `Tile-wide cloud cover for the whole Sentinel-2 scene is ` +
        `${params.tileCloudCoverPct.toFixed(0)}% (a tile is roughly 12,000 km²); the ` +
        "AOI-derived usable-pixel figure covers only this area of interest.",
    );
  }

  if (params.sampleCount > 0 && params.validPct < 50) {
    caveats.push(
      `More than half of the AOI bounding box is masked in this scene ` +
        `(usable: ${params.validPct.toFixed(0)}%). Treat the summary with care or choose a ` +
        "clearer scene.",
    );
  }

  return caveats;
}

type ProviderKind = "cdse" | "planetary-computer";

function selectProvider(aoi: ResolvedAoi, requested?: ProviderKind) {
  if (requested === "planetary-computer") {
    if (aoi.descriptor.kind !== "sample") {
      throw new SentinelProviderError(
        "credentials_missing",
        "CDSE credentials are required before sending an imported boundary for imagery processing.",
      );
    }
    return {
      kind: "planetary-computer" as const,
      provider: createPlanetaryComputerSentinelProvider(),
    };
  }
  if (requested === "cdse" && !hasCdseCredentials()) {
    throw new SentinelProviderError(
      "credentials_missing",
      "The selected scene came from CDSE. Add server-side CDSE credentials and search again.",
    );
  }
  if (hasCdseCredentials()) {
    return { kind: "cdse" as const, provider: createCdseSentinelProvider() };
  }
  if (aoi.descriptor.kind === "sample") {
    return {
      kind: "planetary-computer" as const,
      provider: createPlanetaryComputerSentinelProvider(),
    };
  }
  throw new SentinelProviderError(
    "credentials_missing",
    "CDSE credentials are required for imported boundaries. Public demo imagery is limited to the Khanewal and Okara sample areas.",
  );
}

function toProviderError(error: unknown) {
  if (error instanceof PlanetaryComputerProviderError) {
    return { code: error.code, message: error.message };
  }
  return toSentinelError(error);
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

/**
 * List Sentinel-2 L2A scenes intersecting the AOI in a bounded window.
 * Newest first, capped at `SENTINEL_LIMITS.maxSceneResults`. Nothing about
 * NDVI is computed here — the client must select a scene first.
 */
export const searchSentinelScenes = createServerFn({ method: "POST" })
  .inputValidator(searchInputSchema)
  .handler(async ({ data }): Promise<SceneSearchResponse> => {
    try {
      const aoi = resolveAoi(data.aoi);
      const range = validateDateRange(data.from, data.to);
      if (!range.ok) {
        throw new SentinelInputError(range.code, range.message);
      }

      const selected = selectProvider(aoi);
      const { scenes, truncated } = await selected.provider.searchScenes({
        bbox: aoi.bbox,
        from: range.from,
        to: range.to,
        limit: SENTINEL_LIMITS.maxSceneResults,
      });

      return {
        ok: true,
        scenes,
        provider: selected.kind,
        truncated,
        limit: SENTINEL_LIMITS.maxSceneResults,
        aoi: aoi.descriptor,
        dateRange: { from: range.from, to: range.to },
        searchedAt: new Date().toISOString(),
      };
    } catch (error) {
      return { ok: false, error: toProviderError(error) };
    }
  });

/**
 * Compute one scene's NDVI: an RGBA preview (masked pixels transparent) plus
 * exact statistics over the same mask. Called only after the user selects a
 * scene — there is no date-range or background fetch here.
 */
export const retrieveNdviObservation = createServerFn({ method: "POST" })
  .inputValidator(retrieveInputSchema)
  .handler(async ({ data }): Promise<NdviObservationResponse> => {
    try {
      const aoi = resolveAoi(data.aoi);
      const acquiredAt = parseAcquiredAt(data.scene.acquiredAt);

      const scene: SentinelScene = {
        id: data.scene.sceneId,
        acquiredAt,
        tileCloudCoverPct: data.scene.tileCloudCoverPct ?? null,
        gsdMeters: data.scene.gsdMeters ?? null,
        platform: data.scene.platform ?? null,
        provider: data.scene.provider,
      };

      const { width, height } = previewSizeForBbox(aoi.bbox);
      const requestedStatsResolutionMeters = statsResolutionForBbox(aoi.bbox);
      const metersPerPixel = metersPerPixelForBbox(aoi.bbox, width);

      const selected = selectProvider(aoi, data.scene.provider);
      const {
        previewPngBase64,
        previewEncoding,
        stats,
        statsResolutionMeters: actualStatsResolutionMeters,
      } = await selected.provider.retrieveNdvi({
        geometry: aoi.geometry,
        scene,
        width,
        height,
        resMeters: requestedStatsResolutionMeters,
      });
      const statsResolutionMeters = actualStatsResolutionMeters ?? requestedStatsResolutionMeters;

      const validPct = validPixelPct(stats.sampleCount, stats.noDataCount);
      const summary: NdviSummary = { ...stats, validPixelPct: validPct };
      const acquisitionYear = new Date(Date.parse(acquiredAt)).getUTCFullYear();
      const caveats = buildCaveats({
        statsResolutionMeters,
        width,
        height,
        metersPerPixel,
        validPct,
        sampleCount: stats.sampleCount,
        noDataCount: stats.noDataCount,
        tileCloudCoverPct: scene.tileCloudCoverPct,
      });
      if (selected.kind === "planetary-computer") {
        caveats.push(
          "This no-account demo uses Microsoft Planetary Computer's public STAC and data APIs. Availability is best-effort and may be throttled; imported farm boundaries are not sent through this route.",
        );
      }

      return {
        ok: true,
        scene,
        provider: selected.kind,
        aoi: aoi.descriptor,
        retrievedAt: new Date().toISOString(),
        preview: {
          dataUrl: `data:image/png;base64,${previewPngBase64}`,
          ...(previewEncoding ? { encoding: previewEncoding } : {}),
          width,
          height,
          bbox: aoi.bbox,
          metersPerPixel,
        },
        summary,
        masking: buildMasking(),
        statsResolutionMeters,
        caveats,
        attribution:
          selected.kind === "cdse"
            ? `Contains modified Copernicus Sentinel data [${acquisitionYear}] processed by Sentinel Hub.`
            : `Contains Copernicus Sentinel data [${acquisitionYear}] via Microsoft Planetary Computer; preview and statistics provided by its public data API.`,
      };
    } catch (error) {
      return { ok: false, error: toProviderError(error) };
    }
  });
