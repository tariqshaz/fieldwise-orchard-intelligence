import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, Loader2, Satellite, Search, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  retrieveNdviObservation,
  searchSentinelScenes,
  type SearchSentinelScenesInput,
} from "@/lib/api/sentinel.functions";
import type { ImportedBoundary } from "@/lib/geospatial";
import {
  SAMPLE_AOIS,
  importedAoiDescriptor,
  sampleAoiById,
  validateDateRange,
} from "@/lib/sentinel/aoi";
import { ndviRampCssGradient, ndviToRgb } from "@/lib/sentinel/ndvi";
import type { NdviObservationResult, SceneSearchResult, SentinelScene } from "@/lib/sentinel/types";

type AoiInput = SearchSentinelScenesInput["aoi"];

/** Scene-list banner: every scene at or above this tile-wide cloud cover. */
const LIST_CLOUDY_PCT = 60;
/** Below this usable share the observation renders as a distinct too-cloudy state. */
const UNUSABLE_PCT = 10;
/** Below this share the observation renders with a partial-coverage warning. */
const PARTIAL_PCT = 50;

/** Checkerboard so fully transparent (masked) preview pixels are obvious. */
const CHECKERBOARD: React.CSSProperties = {
  backgroundColor: "oklch(0.2 0.03 258)",
  backgroundImage:
    "linear-gradient(45deg, oklch(0.26 0.03 258) 25%, transparent 25%), " +
    "linear-gradient(-45deg, oklch(0.26 0.03 258) 25%, transparent 25%), " +
    "linear-gradient(45deg, transparent 75%, oklch(0.26 0.03 258) 75%), " +
    "linear-gradient(-45deg, transparent 75%, oklch(0.26 0.03 258) 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
};

const DANGER_STYLE: React.CSSProperties = {
  borderColor: "oklch(0.66 0.21 25 / 0.45)",
  background: "oklch(0.66 0.21 25 / 0.1)",
};

const WARNING_STYLE: React.CSSProperties = {
  borderColor: "oklch(0.82 0.15 85 / 0.4)",
  background: "oklch(0.82 0.15 85 / 0.08)",
};

function defaultToDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFromDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 30);
  return date.toISOString().slice(0, 10);
}

function formatUtc(iso: string, withSeconds = true): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const stamp = new Date(ms).toISOString().slice(0, withSeconds ? 19 : 16);
  return `${stamp.replace("T", " ")} UTC`;
}

function formatDeg(value: number, axis: "lat" | "lon"): string {
  const suffix = axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(4)}°${suffix}`;
}

function formatStat(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(3);
}

/** Round scale-bar length that fits comfortably under the preview. */
function scaleBarFor(metersPerPixel: number | null): { label: string; barPx: number } | null {
  if (metersPerPixel === null || !Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
    return null;
  }
  const targets = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000];
  const desired = metersPerPixel * 90;
  let chosen = targets[0];
  for (const target of targets) {
    if (target <= desired) chosen = target;
  }
  const barPx = chosen / metersPerPixel;
  if (barPx < 8 || barPx > 170) return null;
  return { label: chosen >= 1000 ? `${chosen / 1000} km` : `${chosen} m`, barPx };
}

/** Keep the selector valid when the imported boundary appears or disappears. */
function normalizeChoice(choice: string, hasBoundary: boolean): string {
  const firstSample = SAMPLE_AOIS[0]?.id ?? "";
  if (choice === "imported") return hasBoundary ? "imported" : firstSample;
  if (SAMPLE_AOIS.some((sample) => sample.id === choice)) return choice;
  return hasBoundary ? "imported" : firstSample;
}

function MetaRow({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex min-w-0 justify-between gap-2 border-b border-border/25 pb-1">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={`min-w-0 text-right ${mono ? "font-mono text-gold" : "text-foreground"} ${
          truncate ? "truncate" : ""
        }`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function SceneRow({
  scene,
  selected,
  disabled,
  onSelect,
}: {
  scene: SentinelScene;
  selected: boolean;
  disabled: boolean;
  onSelect: (scene: SentinelScene) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(scene)}
      className={`flex w-full items-center gap-3 rounded-sm border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? "border-gold/60 bg-gold/10"
          : "border-border/40 hover:border-gold/40 hover:bg-white/[0.03]"
      }`}
    >
      <span
        className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full border ${
          selected ? "border-gold bg-gold" : "border-muted-foreground/60"
        }`}
      />
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[11px] text-foreground">
          {formatUtc(scene.acquiredAt, false)}
        </span>
        <span
          className="block truncate font-mono text-[9px] text-muted-foreground"
          title={scene.id}
        >
          {scene.id}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-[11px] text-gold">
          {scene.tileCloudCoverPct === null ? "—" : `${scene.tileCloudCoverPct.toFixed(0)}%`}
          <span className="ml-1 text-[8px] tracking-wider text-muted-foreground">TILE CLOUD</span>
        </span>
        <span className="block font-mono text-[9px] text-muted-foreground">
          {scene.gsdMeters === null ? "—" : `${scene.gsdMeters} m`} ·{" "}
          {(scene.platform ?? "sentinel-2").toUpperCase()}
        </span>
      </span>
    </button>
  );
}

function NdviPreviewCanvas({
  preview,
  sceneId,
}: {
  preview: NdviObservationResult["preview"];
  sceneId: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      canvas.width = preview.width;
      canvas.height = preview.height;
      context.drawImage(image, 0, 0, preview.width, preview.height);
      const pixels = context.getImageData(0, 0, preview.width, preview.height);
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        const gray = pixels.data[offset];
        if (pixels.data[offset + 3] === 0 || gray === 0) {
          pixels.data[offset] = 0;
          pixels.data[offset + 1] = 0;
          pixels.data[offset + 2] = 0;
          pixels.data[offset + 3] = 0;
          continue;
        }
        const ndvi = (gray / 255) * 3 - 2;
        const [red, green, blue] = ndviToRgb(ndvi);
        pixels.data[offset] = red;
        pixels.data[offset + 1] = green;
        pixels.data[offset + 2] = blue;
      }
      context.putImageData(pixels, 0, 0);
    };
    image.src = preview.dataUrl;

    return () => {
      active = false;
      image.onload = null;
    };
  }, [preview.dataUrl, preview.height, preview.width]);

  return (
    <canvas
      ref={canvasRef}
      width={preview.width}
      height={preview.height}
      role="img"
      aria-label={`NDVI preview for ${sceneId}; masked pixels are transparent`}
      className="block h-auto w-full"
    />
  );
}

function ObservationView({
  observation,
  scene,
}: {
  observation: NdviObservationResult;
  scene: SentinelScene;
}) {
  const { preview, summary, masking, caveats, attribution } = observation;
  const bbox = preview.bbox;
  const scale = scaleBarFor(preview.metersPerPixel);
  const maxBin = Math.max(1, ...summary.histogram.map((bin) => bin.count));
  const partial = summary.validPixelPct < PARTIAL_PCT;

  return (
    <div className="mt-4 border-t border-border/40 pt-4">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Georeferenced preview */}
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="label-eyebrow">NDVI preview · georeferenced</div>
            <div className="font-mono text-[9px] text-muted-foreground">
              {preview.width}×{preview.height} px
            </div>
          </div>

          <div
            className="relative overflow-hidden rounded-sm border border-border/40"
            style={CHECKERBOARD}
          >
            {preview.encoding === "ndvi-grayscale" ? (
              <NdviPreviewCanvas preview={preview} sceneId={scene.id} />
            ) : (
              <img
                src={preview.dataUrl}
                alt={`NDVI preview for ${scene.id}; masked pixels are transparent`}
                width={preview.width}
                height={preview.height}
                className="block h-auto w-full"
              />
            )}
            <span className="absolute left-1 top-1 rounded-sm bg-black/60 px-1 py-0.5 font-mono text-[8px] tracking-wider text-white/85">
              {formatDeg(bbox[0], "lon")} {formatDeg(bbox[3], "lat")}
            </span>
            <span className="absolute right-1 top-1 rounded-sm bg-black/60 px-1 py-0.5 font-mono text-[8px] tracking-wider text-white/85">
              {formatDeg(bbox[2], "lon")} {formatDeg(bbox[3], "lat")}
            </span>
            <span className="absolute bottom-1 left-1 rounded-sm bg-black/60 px-1 py-0.5 font-mono text-[8px] tracking-wider text-white/85">
              {formatDeg(bbox[0], "lon")} {formatDeg(bbox[1], "lat")}
            </span>
            <span className="absolute bottom-1 right-1 rounded-sm bg-black/60 px-1 py-0.5 font-mono text-[8px] tracking-wider text-white/85">
              {formatDeg(bbox[2], "lon")} {formatDeg(bbox[1], "lat")}
            </span>
            <span className="absolute left-1/2 top-1 -translate-x-1/2 rounded-sm bg-black/60 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-white/90">
              ▲ N
            </span>
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-3">
            {scale ? (
              <div className="flex items-end gap-1.5">
                <span
                  className="block border-b-2 border-l-2 border-r-2 border-white/70"
                  style={{ width: `${scale.barPx}px`, height: "5px" }}
                />
                <span className="font-mono text-[9px] text-muted-foreground">{scale.label}</span>
              </div>
            ) : (
              <span />
            )}
            <span className="font-mono text-[9px] text-muted-foreground">
              checkerboard = transparent (masked)
            </span>
          </div>

          <div className="mt-3">
            <div className="label-eyebrow mb-1.5">Colour ramp · underlying NDVI values</div>
            <div className="h-3 rounded-sm" style={{ background: ndviRampCssGradient() }} />
            <div className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground">
              <span>−1</span>
              <span>−0.2</span>
              <span>0</span>
              <span>0.2</span>
              <span>0.4</span>
              <span>0.6</span>
              <span>0.8</span>
              <span>1</span>
            </div>
          </div>
        </div>

        {/* Metadata, statistics, disclosure */}
        <div className="min-w-0 space-y-4">
          {partial && (
            <div
              className="flex items-start gap-2 rounded-sm border px-3 py-2 text-[11px] text-muted-foreground"
              style={WARNING_STYLE}
            >
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                style={{ color: "oklch(0.82 0.15 85)" }}
              />
              <span>
                Partial coverage: only {summary.validPixelPct.toFixed(0)}% of the AOI bounding box
                has usable pixels in this scene. Treat the summary with care.
              </span>
            </div>
          )}

          <div>
            <div className="label-eyebrow mb-2">Observation</div>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-2">
              <MetaRow label="Acquisition" value={formatUtc(scene.acquiredAt)} mono />
              <MetaRow label="Retrieved" value={formatUtc(observation.retrievedAt)} mono />
              <MetaRow
                label="Source"
                value={
                  observation.provider === "cdse"
                    ? "Copernicus Sentinel-2 L2A · Sentinel Hub"
                    : "Copernicus Sentinel-2 L2A · Microsoft Planetary Computer"
                }
              />
              <MetaRow
                label="Statistics resolution"
                value={`${observation.statsResolutionMeters} m`}
                mono
              />
              <MetaRow
                label="Preview scale"
                value={
                  preview.metersPerPixel !== null
                    ? `~${preview.metersPerPixel.toFixed(1)} m/px`
                    : "—"
                }
                mono
              />
              <MetaRow
                label="Cloud (tile-wide)"
                value={
                  scene.tileCloudCoverPct !== null
                    ? `${scene.tileCloudCoverPct.toFixed(0)}%`
                    : "not reported"
                }
                mono
              />
              <MetaRow
                label="Usable pixels (AOI bbox)"
                value={`${summary.validPixelPct.toFixed(0)}% of ${summary.sampleCount.toLocaleString("en-US")} samples`}
                mono
              />
              <MetaRow
                label="Excluded samples"
                value={summary.noDataCount.toLocaleString("en-US")}
                mono
              />
              <MetaRow label="Product id" value={scene.id} mono truncate />
              <MetaRow label="AOI" value={observation.aoi.label} truncate />
            </dl>
          </div>

          <div>
            <div className="label-eyebrow mb-2">NDVI summary · usable pixels only</div>
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  ["min", formatStat(summary.min)],
                  ["p10", formatStat(summary.p10)],
                  ["mean", formatStat(summary.mean)],
                  ["p50", formatStat(summary.p50)],
                  ["p90", formatStat(summary.p90)],
                  ["max", formatStat(summary.max)],
                  ["stdev", formatStat(summary.stDev)],
                  ["samples", summary.sampleCount.toLocaleString("en-US")],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-sm border border-border/30 bg-black/15 px-2 py-1.5"
                >
                  <div className="font-mono text-[9px] tracking-wider text-muted-foreground">
                    {label}
                  </div>
                  <div className="font-mono text-[12px] text-gold">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="label-eyebrow mb-1.5">NDVI distribution · 10 bins over −1…1</div>
            {summary.histogram.length > 0 ? (
              <>
                <div className="flex h-14 items-end gap-[2px]">
                  {summary.histogram.map((bin) => {
                    const [r, g, b] = ndviToRgb((bin.lowEdge + bin.highEdge) / 2);
                    const height = bin.count === 0 ? 0 : Math.max(4, (bin.count / maxBin) * 100);
                    return (
                      <div
                        key={`${bin.lowEdge}-${bin.highEdge}`}
                        className="min-w-0 flex-1 rounded-t-[2px]"
                        title={`${bin.lowEdge.toFixed(1)} to ${bin.highEdge.toFixed(
                          1,
                        )}: ${bin.count.toLocaleString("en-US")} px`}
                        style={{ height: `${height}%`, background: `rgb(${r}, ${g}, ${b})` }}
                      />
                    );
                  })}
                </div>
                <div className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground">
                  <span>−1</span>
                  <span>0</span>
                  <span>1</span>
                </div>
              </>
            ) : (
              <div className="text-[11px] text-muted-foreground">
                No histogram reported for this scene.
              </div>
            )}
          </div>

          <div>
            <div className="label-eyebrow mb-1.5">
              Mask applied · excluded from image and statistics
            </div>
            <ul className="space-y-1">
              {masking.excluded.map((entry) => (
                <li key={entry.value} className="flex flex-wrap items-baseline gap-x-2 text-[10px]">
                  <span className="font-mono text-gold">SCL {entry.value}</span>
                  <span className="text-foreground/85">{entry.label}</span>
                  <span className="text-muted-foreground">— {entry.reason}</span>
                </li>
              ))}
            </ul>
            <div className="mt-1.5 text-[10px] text-muted-foreground">
              Kept:{" "}
              {masking.retained.map((entry) => `SCL ${entry.value} ${entry.label}`).join(" · ")}
            </div>
            <pre className="mt-2 overflow-x-auto rounded-sm border border-border/30 bg-black/20 p-2 font-mono text-[9px] leading-relaxed text-muted-foreground">
              {masking.rules.join("\n")}
            </pre>
          </div>

          <div>
            <div className="label-eyebrow mb-1.5">Caveats</div>
            <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
              {caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-sm border border-border/30 bg-black/15 px-3 py-2 font-mono text-[9px] leading-relaxed tracking-wider text-muted-foreground">
            {attribution}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SentinelObservationPanel({ boundary }: { boundary: ImportedBoundary | null }) {
  const [aoiChoice, setAoiChoice] = useState(() => SAMPLE_AOIS[0]?.id ?? "imported");
  const [from, setFrom] = useState(() => defaultFromDate());
  const [to, setTo] = useState(() => defaultToDate());
  const [formError, setFormError] = useState<string | null>(null);

  const [searchPhase, setSearchPhase] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SceneSearchResult | null>(null);

  const [selectedScene, setSelectedScene] = useState<SentinelScene | null>(null);
  const [obsPhase, setObsPhase] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [obsError, setObsError] = useState<string | null>(null);
  const [observation, setObservation] = useState<NdviObservationResult | null>(null);

  const searchSeq = useRef(0);
  const obsSeq = useRef(0);

  const activeChoice = normalizeChoice(aoiChoice, boundary !== null);
  const activeSample = activeChoice === "imported" ? null : sampleAoiById(activeChoice);
  const isSample = activeChoice !== "imported";

  const aoiInput: AoiInput | null =
    activeChoice === "imported"
      ? boundary
        ? {
            kind: "imported",
            estateId: boundary.estateId,
            sourceName: boundary.sourceName,
            geometry: { type: "MultiPolygon", coordinates: boundary.estate },
          }
        : null
      : activeSample
        ? { kind: "sample", sampleId: activeSample.id }
        : null;

  const provenance = isSample
    ? (activeSample?.description ?? "Choose an area of interest.")
    : importedAoiDescriptor(boundary?.sourceName ?? "").provenance;
  const aoiLabel = isSample
    ? (activeSample?.label ?? "Sample")
    : `Imported boundary · ${boundary?.sourceName ?? ""}`;

  const sceneList = searchResult?.scenes ?? null;
  const allCloudy =
    sceneList !== null &&
    sceneList.length > 0 &&
    sceneList.every(
      (scene) => scene.tileCloudCoverPct !== null && scene.tileCloudCoverPct >= LIST_CLOUDY_PCT,
    );

  function resetResults(): void {
    searchSeq.current += 1;
    obsSeq.current += 1;
    setFormError(null);
    setSearchPhase("idle");
    setSearchError(null);
    setSearchResult(null);
    setSelectedScene(null);
    setObsPhase("idle");
    setObsError(null);
    setObservation(null);
  }

  function chooseAoi(choice: string): void {
    setAoiChoice(choice);
    resetResults();
  }

  function changeFrom(value: string): void {
    setFrom(value);
    resetResults();
  }

  function changeTo(value: string): void {
    setTo(value);
    resetResults();
  }

  async function handleSearch(): Promise<void> {
    if (!aoiInput) {
      setFormError("Choose an area of interest before searching.");
      return;
    }
    const range = validateDateRange(from, to);
    if (!range.ok) {
      setFormError(range.message);
      return;
    }

    const seq = ++searchSeq.current;
    setFormError(null);
    setSearchPhase("loading");
    setSearchError(null);
    setSearchResult(null);
    setSelectedScene(null);
    setObsPhase("idle");
    setObsError(null);
    setObservation(null);

    try {
      const response = await searchSentinelScenes({
        data: { aoi: aoiInput, from: range.from, to: range.to },
      });
      if (seq !== searchSeq.current) return; // superseded by a newer request
      if (!response.ok) {
        setSearchPhase("error");
        setSearchError(response.error.message);
        return;
      }
      setSearchResult(response);
      setSearchPhase("done");
    } catch {
      if (seq !== searchSeq.current) return;
      setSearchPhase("error");
      setSearchError("Could not reach the server. Check the connection and try again.");
    }
  }

  async function handleSelectScene(scene: SentinelScene): Promise<void> {
    if (!aoiInput) return;

    const seq = ++obsSeq.current;
    setSelectedScene(scene);
    setObsPhase("loading");
    setObsError(null);
    setObservation(null);

    try {
      const response = await retrieveNdviObservation({
        data: {
          aoi: aoiInput,
          scene: {
            sceneId: scene.id,
            acquiredAt: scene.acquiredAt,
            tileCloudCoverPct: scene.tileCloudCoverPct,
            gsdMeters: scene.gsdMeters,
            platform: scene.platform,
            provider: scene.provider,
          },
        },
      });
      if (seq !== obsSeq.current) return; // superseded by a newer selection
      if (!response.ok) {
        setObsPhase("error");
        setObsError(response.error.message);
        return;
      }
      setObservation(response);
      setObsPhase("done");
    } catch {
      if (seq !== obsSeq.current) return;
      setObsPhase("error");
      setObsError("Could not reach the server. Check the connection and try again.");
    }
  }

  function clearSelection(): void {
    obsSeq.current += 1;
    setSelectedScene(null);
    setObsPhase("idle");
    setObsError(null);
    setObservation(null);
  }

  const today = defaultToDate();

  return (
    <div className="glass-panel p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Satellite className="h-4 w-4 text-gold" />
            <h2 className="font-display text-xl leading-none text-foreground">
              Sentinel-2 Observation
            </h2>
          </div>
          <div className="label-eyebrow mt-1.5">
            Sentinel-2 L2A · real scene metadata and satellite pixels
          </div>
        </div>
        <div className="text-right font-mono text-[9px] leading-relaxed tracking-wider text-muted-foreground">
          <div>NDVI = (B08 − B04) / (B08 + B04)</div>
          <div>reflectance only · not a diagnosis</div>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <div className="min-w-0">
          <div className="label-eyebrow mb-1.5">Area of interest</div>
          <div className="flex flex-wrap gap-2">
            {boundary && (
              <button
                type="button"
                onClick={() => chooseAoi("imported")}
                className={`rounded-full border px-3 py-1 font-mono text-[10px] transition-colors ${
                  activeChoice === "imported"
                    ? "border-gold/60 bg-gold/10 text-gold"
                    : "border-border/50 text-muted-foreground hover:border-gold/40"
                }`}
              >
                Imported boundary · {boundary.sourceName}
              </button>
            )}
            {SAMPLE_AOIS.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => chooseAoi(sample.id)}
                className={`rounded-full border px-3 py-1 font-mono text-[10px] transition-colors ${
                  activeChoice === sample.id
                    ? "border-gold/60 bg-gold/10 text-gold"
                    : "border-border/50 text-muted-foreground hover:border-gold/40"
                }`}
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="label-eyebrow mb-1.5">From</div>
          <Input
            type="date"
            value={from}
            min="2015-06-23"
            max={to}
            onChange={(event) => changeFrom(event.target.value)}
            className="h-9 w-[150px] font-mono text-[11px]"
            style={{ colorScheme: "dark" }}
          />
        </div>
        <div>
          <div className="label-eyebrow mb-1.5">To</div>
          <Input
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(event) => changeTo(event.target.value)}
            className="h-9 w-[150px] font-mono text-[11px]"
            style={{ colorScheme: "dark" }}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            size="sm"
            onClick={handleSearch}
            disabled={searchPhase === "loading"}
            className="h-9"
          >
            {searchPhase === "loading" ? <Loader2 className="animate-spin" /> : <Search />}
            {searchPhase === "loading" ? "Searching…" : "Search scenes"}
          </Button>
        </div>
      </div>

      {/* AOI provenance — always visible, samples always labelled */}
      <div
        className="mt-3 flex items-start gap-2 rounded-sm border px-3 py-2 text-[11px]"
        style={
          isSample
            ? WARNING_STYLE
            : { borderColor: "oklch(1 0 0 / 0.14)", background: "oklch(1 0 0 / 0.04)" }
        }
      >
        {isSample ? (
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            style={{ color: "oklch(0.82 0.15 85)" }}
          />
        ) : (
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
        )}
        <span className="min-w-0 text-muted-foreground">
          {isSample && (
            <span
              className="mr-1.5 rounded-sm px-1.5 py-0.5 font-mono text-[9px] tracking-widest"
              style={{ background: "oklch(0.82 0.15 85 / 0.16)", color: "oklch(0.82 0.15 85)" }}
            >
              SAMPLE
            </span>
          )}
          <span className="font-mono text-foreground/80">{aoiLabel}</span> — {provenance}
        </span>
      </div>

      {formError && (
        <div
          className="mt-3 flex items-start gap-2 rounded-sm border px-3 py-2 text-[11px] text-muted-foreground"
          style={DANGER_STYLE}
        >
          <XCircle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            style={{ color: "oklch(0.66 0.21 25)" }}
          />
          <span>{formError}</span>
        </div>
      )}

      {/* Search states */}
      {searchPhase === "idle" && !formError && (
        <div className="mt-4 rounded-sm border border-border/40 bg-black/10 px-3 py-3 text-[11px] text-muted-foreground">
          Choose an area and date range, then search the Sentinel-2 archive. With no CDSE
          credentials, the Khanewal and Okara sample areas use the public Microsoft Planetary
          Computer catalog and data API; imported boundaries stay on the CDSE path. Nothing is
          fetched until you search, and NDVI is only computed once you select a scene.
        </div>
      )}

      {searchPhase === "loading" && (
        <div className="mt-4 flex items-center gap-2 rounded-sm border border-border/40 bg-black/10 px-3 py-3 text-[11px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" />
          Searching the Sentinel-2 L2A archive for this area of interest…
        </div>
      )}

      {searchPhase === "error" && searchError && (
        <div
          className="mt-4 flex items-start gap-2 rounded-sm border px-3 py-3 text-[11px] text-muted-foreground"
          style={DANGER_STYLE}
        >
          <XCircle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            style={{ color: "oklch(0.66 0.21 25)" }}
          />
          <span>{searchError}</span>
        </div>
      )}

      {searchPhase === "done" && sceneList && sceneList.length === 0 && (
        <div className="mt-4 rounded-sm border border-border/40 bg-black/10 px-3 py-3 text-[11px] text-muted-foreground">
          <span className="font-mono text-foreground/80">No scenes found.</span> There are no
          Sentinel-2 L2A acquisitions over this area between {searchResult?.dateRange.from} and{" "}
          {searchResult?.dateRange.to}. Widen the date range or choose a different area of interest.
        </div>
      )}

      {searchPhase === "done" && sceneList && sceneList.length > 0 && searchResult && (
        <div className="mt-4 border-t border-border/40 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="label-eyebrow">
              Scenes · newest first ·{" "}
              {searchResult.provider === "cdse" ? "CDSE" : "Public demo provider"}
            </div>
            <div className="font-mono text-[9px] text-muted-foreground">
              {searchResult.truncated
                ? `${sceneList.length} of ${searchResult.limit}+`
                : `${sceneList.length}`}{" "}
              · {searchResult.dateRange.from} → {searchResult.dateRange.to}
            </div>
          </div>

          {allCloudy && (
            <div
              className="mt-2 flex items-start gap-2 rounded-sm border px-3 py-2 text-[11px] text-muted-foreground"
              style={WARNING_STYLE}
            >
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                style={{ color: "oklch(0.82 0.15 85)" }}
              />
              <span>
                All {sceneList.length} scenes in this window are ≥{LIST_CLOUDY_PCT}% cloud-covered
                tile-wide. Consider a different date range.
              </span>
            </div>
          )}

          <div className="mt-2 max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
            {sceneList.map((scene) => (
              <SceneRow
                key={scene.id}
                scene={scene}
                selected={selectedScene?.id === scene.id}
                disabled={obsPhase === "loading"}
                onSelect={handleSelectScene}
              />
            ))}
          </div>

          {/* Retrieval states — only after a scene is selected */}
          {!selectedScene && (
            <div className="mt-3 text-[11px] text-muted-foreground">
              Select a scene above to compute its NDVI preview and statistics. Nothing else is
              fetched until you do.
            </div>
          )}

          {selectedScene && obsPhase === "loading" && (
            <div className="mt-3 flex items-center gap-2 rounded-sm border border-border/40 bg-black/10 px-3 py-3 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" />
              Computing NDVI for{" "}
              <span className="truncate font-mono text-foreground/80">{selectedScene.id}</span>…
            </div>
          )}

          {selectedScene && obsPhase === "error" && obsError && (
            <div
              className="mt-3 flex items-start gap-2 rounded-sm border px-3 py-3 text-[11px] text-muted-foreground"
              style={DANGER_STYLE}
            >
              <XCircle
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                style={{ color: "oklch(0.66 0.21 25)" }}
              />
              <span>
                {obsError} You can pick another scene from the list, or select this one again to
                retry.
              </span>
            </div>
          )}

          {selectedScene && obsPhase === "done" && observation && (
            <>
              {observation.summary.validPixelPct < UNUSABLE_PCT ? (
                <div className="mt-3 rounded-sm border px-4 py-4" style={WARNING_STYLE}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0"
                      style={{ color: "oklch(0.82 0.15 85)" }}
                    />
                    <div className="min-w-0">
                      <div
                        className="font-display text-lg leading-none"
                        style={{ color: "oklch(0.82 0.15 85)" }}
                      >
                        Too cloudy to use
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                        Only{" "}
                        <span className="font-mono text-foreground">
                          {observation.summary.validPixelPct.toFixed(0)}%
                        </span>{" "}
                        of the AOI bounding box has usable pixels in{" "}
                        <span className="truncate font-mono text-foreground/80">
                          {selectedScene.id}
                        </span>{" "}
                        — the rest is cloud, shadow, water, or no-data under the mask.
                      </p>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        Pick another scene from the list, or widen the date range and search again.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3 h-8"
                        onClick={clearSelection}
                      >
                        Choose another scene
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <ObservationView observation={observation} scene={selectedScene} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
