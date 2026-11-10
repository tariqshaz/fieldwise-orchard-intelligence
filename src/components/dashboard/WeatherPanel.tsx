import { useState } from "react";
import {
  AlertCircle,
  Info,
  Loader2,
  Sun,
  Thermometer,
  Wind,
  Droplets,
  MapPin,
  FileText,
  Link,
  ShieldAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  retrieveEra5LandHistory,
  retrieveEcmwfForecast,
  retrieveWeatherContext,
  type WeatherForecastInput,
  type WeatherHistoricalInput,
} from "@/lib/api/weather.functions";
import { WEATHER_SAMPLE_AOIS, weatherSampleAoiById } from "@/lib/weather/aoi";
import type {
  EcmwfIfsForecast,
  Era5LandHistorical,
  WeatherContextResult,
  WeatherProductResult,
  WeatherStatus,
} from "@/lib/weather/types";

function formatUtc(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toISOString().replace("T", " ") + " UTC";
}

function formatCoord(value: number, axis: "lat" | "lon"): string {
  const suffix = axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(4)}°${suffix}`;
}

function formatTemp(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(1) + " °C";
}

function formatPrecip(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return (value * 1000).toFixed(1) + " mm";
}

/**
 * Format an hourly precipitation amount.
 *
 * The ERA5-Land value is the amount over the hour that ended at the
 * timestamp, in metres; it is shown in millimetres like the forecast card,
 * and it is not a daily total.
 */
function formatHourlyPrecip(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return (value * 1000).toFixed(2) + " mm/h";
}

function statusBadge(status: WeatherStatus): {
  label: string;
  color: string;
} {
  switch (status) {
    case "ok":
      return { label: "Available", color: "oklch(0.78 0.17 150 / 0.15)" };
    case "partial":
      return { label: "Partial", color: "oklch(0.82 0.15 85 / 0.15)" };
    case "unavailable":
      return { label: "Unavailable", color: "oklch(0.5 0.02 260 / 0.15)" };
    case "missing":
      return { label: "Missing", color: "oklch(0.5 0.02 260 / 0.15)" };
    case "stale":
      return { label: "Stale", color: "oklch(0.82 0.15 85 / 0.15)" };
    case "credentials_required":
      return { label: "Setup required", color: "oklch(0.82 0.15 85 / 0.15)" };
    default:
      return { label: "Unknown", color: "oklch(0.5 0.02 260 / 0.15)" };
  }
}

function StatusChip({ status }: { status: WeatherStatus }) {
  const { label, color } = statusBadge(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-0.5 text-[10px] font-medium"
      style={{ borderColor: color, background: color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
      {label}
    </span>
  );
}

function defaultFromDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 6);
  return d.toISOString().slice(0, 10);
}

function defaultToDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function Era5LandProduct({ product }: { product: Era5LandHistorical }) {
  const latest = product.observations[product.observations.length - 1];

  return (
    <Card className="border border-border">
      <CardHeader className="flex flex-row items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <Thermometer className="h-4 w-4" />
          <CardTitle className="text-sm">Historical Weather — ERA5-Land</CardTitle>
        </div>
        <StatusChip status={product.status} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <div className="text-muted-foreground">Source</div>
            <div className="font-mono">{product.source}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Version</div>
            <div className="font-mono">{product.version}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Spatial resolution</div>
            <div className="font-mono">{product.spatialResolution}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Temporal resolution</div>
            <div className="font-mono">{product.temporalResolution}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Grid cell</div>
            <div className="font-mono">
              {product.gridCell.cellCenter
                ? `${formatCoord(product.gridCell.cellCenter[0], "lon")} ${formatCoord(product.gridCell.cellCenter[1], "lat")}`
                : "Not grid sampled"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Grid method</div>
            <div className="font-mono truncate">{product.gridCell.method}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Period</div>
            <div className="font-mono">
              {product.period.from} → {product.period.to}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Retrieved</div>
            <div className="font-mono">{formatUtc(product.retrievedAt)}</div>
          </div>
        </div>

        {/* Attribution is part of the licence of the source data, so it is
            shown with the product rather than only in the page footer. */}
        <div className="text-[10px] text-muted-foreground">
          <span className="label-eyebrow">Attribution</span> {product.attribution}
        </div>

        {product.status === "credentials_required" && (
          <div className="rounded-sm border border-border/40 bg-amber/50 p-3">
            <div className="flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" style={{ color: "oklch(0.82 0.15 85)" }} />
              <div className="text-[11px] leading-relaxed">
                <strong className="text-[11px]">
                  CDS setup needed; no credentials are configured.
                </strong>{" "}
                {product.message}
                <br />
                The server-side request, job polling, download and GRIB decoding are in place, but
                nothing can be retrieved until a CDS credential exists, so no historical value is
                shown here.
              </div>
            </div>
          </div>
        )}

        {product.message && product.status !== "credentials_required" && (
          <div className="rounded-sm border border-border/40 bg-background p-3">
            <div className="text-[11px] text-muted-foreground">{product.message}</div>
          </div>
        )}

        {product.observations.length > 0 && (
          <div className="border-t border-border/40 pt-2">
            <div className="text-[10px] text-muted-foreground mb-1">
              Hourly reanalysis — {product.observations.length} hours, each timestamp the end of the
              hour it describes
            </div>
            <div
              aria-label={`All ${product.observations.length} hourly observations`}
              className="flex gap-1 overflow-x-auto pb-1"
            >
              {product.observations.map((observation) => (
                <div
                  key={observation.validTime}
                  className="flex min-w-16 flex-col items-center gap-1 text-[10px]"
                >
                  {/* The date is shown as well as the hour: the period can
                      span several days, so the hour alone would be ambiguous. */}
                  <div className="font-mono text-muted-foreground">
                    {formatUtc(observation.validTime).slice(5, 16)}
                  </div>
                  <div className="font-mono">{formatTemp(observation.temperature2mC)}</div>
                  <div className="font-mono">
                    {formatHourlyPrecip(observation.hourlyPrecipitationM)}
                  </div>
                </div>
              ))}
            </div>
            {product.precipitationValidated ? (
              <div className="rounded-sm border border-emerald-500/40 bg-emerald-500/10 p-2 text-[10px]">
                ERA5-Land GRIB1 timing and hourly precipitation were independently compared with
                ecCodes against live CDS files for both sample AOIs, including the 00 UTC boundary.
                Values are grid-cell reanalysis estimates.
              </div>
            ) : (
              <div className="rounded-sm border border-amber-500/40 bg-amber/10 p-2 text-[10px]">
                Hourly precipitation decoding has not yet been independently checked against a
                genuine CDS payload and ecCodes. Read the hourly amounts as unverified.
              </div>
            )}
          </div>
        )}

        {product.caveats.length > 0 && (
          <div className="border-t border-border/40 pt-2">
            <div className="text-[10px] text-muted-foreground mb-1">Caveats</div>
            <ul className="text-[10px] text-muted-foreground list-disc list-inside space-y-1">
              {product.caveats.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EcmwfProduct({ product }: { product: EcmwfIfsForecast }) {
  const latestFrame = product.frames[0];

  return (
    <Card className="border border-border">
      <CardHeader className="flex flex-row items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <Sun className="h-4 w-4" />
          <CardTitle className="text-sm">Forecast — ECMWF Open Data IFS</CardTitle>
        </div>
        <StatusChip status={product.status} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <div className="text-muted-foreground">Source</div>
            <div className="font-mono">{product.source}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Model</div>
            <div className="font-mono">IFS ({product.resolution})</div>
          </div>
          <div>
            <div className="text-muted-foreground">Spatial resolution</div>
            <div className="font-mono">
              {product.resolution === "0.1_deg" ? "0.1° (~11 km)" : "0.25° (~28 km)"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Grid cell</div>
            <div className="font-mono">
              {product.gridCell.cellCenter
                ? `${formatCoord(product.gridCell.cellCenter[0], "lon")} ${formatCoord(product.gridCell.cellCenter[1], "lat")}`
                : "Not grid sampled"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Grid method</div>
            <div className="font-mono truncate">{product.gridCell.method}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Issue time (run)</div>
            <div className="font-mono">{formatUtc(product.issueTime)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Horizon</div>
            <div className="font-mono">{product.horizonHours} h</div>
          </div>
          <div>
            <div className="text-muted-foreground">Retrieved</div>
            <div className="font-mono">{formatUtc(product.retrievedAt)}</div>
          </div>
        </div>

        {product.message && (
          <div className="rounded-sm border border-border/40 bg-background p-3">
            <div className="text-[11px] text-muted-foreground">{product.message}</div>
          </div>
        )}

        {/* Attribution is part of the licence of the source data, so it is
            shown with the values rather than only in the page footer. */}
        <div className="text-[10px] text-muted-foreground">
          <span className="label-eyebrow">Attribution</span> {product.attribution}
        </div>

        {product.status === "ok" && latestFrame && (
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div>
              <div className="text-muted-foreground">
                Temperature (step {latestFrame.stepHours})
              </div>
              <div className="font-mono">{formatTemp(latestFrame.temperature2mC)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">
                Precipitation (0–{latestFrame.stepHours} h accumulation)
              </div>
              <div className="font-mono">{formatPrecip(latestFrame.totalPrecipitationM)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Valid time</div>
              <div className="font-mono">{formatUtc(latestFrame.validTime)}</div>
            </div>
          </div>
        )}

        <div className="border-t border-border/40 pt-2">
          <div className="text-[10px] text-muted-foreground mb-1">Forecast steps</div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {product.frames.slice(0, 8).map((f) => (
              <div key={f.stepHours} className="flex flex-col items-center gap-1 text-[10px]">
                <div className="font-mono text-muted-foreground">{f.stepHours}h</div>
                <div className="font-mono">{formatTemp(f.temperature2mC)}</div>
                <div className="font-mono">{formatPrecip(f.totalPrecipitationM)}</div>
              </div>
            ))}
          </div>
          {product.frames.some((frame) => (frame.missingFields?.length ?? 0) > 0) && (
            <details className="mt-2 text-[10px] text-muted-foreground">
              <summary>Unavailable fields and steps</summary>
              <ul className="mt-1 list-disc list-inside space-y-1">
                {product.frames
                  .filter((frame) => (frame.missingFields?.length ?? 0) > 0)
                  .map((frame) => (
                    <li key={frame.stepHours}>
                      {frame.stepHours}h: {frame.missingFields?.join("; ")}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </div>

        <div className="border-t border-border/40 pt-2">
          <div className="text-[10px] text-muted-foreground mb-1">Caveats</div>
          <ul className="text-[10px] text-muted-foreground list-disc list-inside space-y-1">
            {product.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function PmdProduct({
  product,
}: {
  product: Extract<WeatherProductResult, { type: "pmd-station" }>;
}) {
  return (
    <Card className="border border-border">
      <CardHeader className="flex flex-row items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          <CardTitle className="text-sm">Station Reference — PMD (Pakistan)</CardTitle>
        </div>
        <StatusChip status={product.status} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <div className="text-muted-foreground">Source</div>
            <div className="font-mono">{product.source}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Station</div>
            <div className="font-mono">{product.station}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Retrieved</div>
            <div className="font-mono">{formatUtc(product.retrievedAt)}</div>
          </div>
        </div>

        <div className="rounded-sm border border-border/40 bg-background p-3">
          <div className="text-[11px] text-muted-foreground">{product.note}</div>
        </div>

        <Button asChild variant="outline" size="sm">
          <a
            href={product.referenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] underline-offset-4 hover:underline"
          >
            <Link className="h-3 w-3" />
            Open PMD Punjab page
          </a>
        </Button>

        <div className="border-t border-border/40 pt-2">
          <div className="text-[10px] text-muted-foreground mb-1">Caveats</div>
          <ul className="text-[10px] text-muted-foreground list-disc list-inside space-y-1">
            {product.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function FloodProduct({
  product,
}: {
  product: Extract<WeatherProductResult, { type: "flood-event" }>;
}) {
  return (
    <Card className="border border-border">
      <CardHeader className="flex flex-row items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <Droplets className="h-4 w-4" />
          <CardTitle className="text-sm">Flood-Event Context — PDMA / PMD FFD</CardTitle>
        </div>
        <StatusChip status={product.status} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <div className="text-muted-foreground">Source</div>
            <div className="font-mono">{product.source}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Retrieved</div>
            <div className="font-mono">{formatUtc(product.retrievedAt)}</div>
          </div>
        </div>

        <div className="rounded-sm border border-border/40 bg-background p-3">
          <div className="text-[11px] text-muted-foreground">{product.message}</div>
        </div>

        {product.events.length > 0 && (
          <div className="border-t border-border/40 pt-2">
            <div className="text-[10px] text-muted-foreground mb-1">Dated reference records</div>
            <ul className="space-y-2">
              {product.events.map((event) => (
                <li key={`${event.date}-${event.publisher}`} className="text-[11px]">
                  <div className="font-mono">{event.date}</div>
                  <div className="text-muted-foreground">{event.geography}</div>
                  <div className="text-muted-foreground">{event.description}</div>
                  <div className="text-muted-foreground">— {event.caveat}</div>
                  <div className="mt-0.5">
                    <a
                      className="underline underline-offset-4"
                      href={event.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {event.publisher}
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t border-border/40 pt-2">
          <div className="text-[10px] text-muted-foreground mb-1">Caveats</div>
          <ul className="text-[10px] text-muted-foreground list-disc list-inside space-y-1">
            {product.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function CropProduct({
  product,
}: {
  product: Extract<WeatherProductResult, { type: "crop-district" }>;
}) {
  return (
    <Card className="border border-border">
      <CardHeader className="flex flex-row items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          <CardTitle className="text-sm">District Crop Context — Punjab CRS</CardTitle>
        </div>
        <StatusChip status={product.status} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <div className="text-muted-foreground">Source</div>
            <div className="font-mono">{product.source}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Retrieved</div>
            <div className="font-mono">{formatUtc(product.retrievedAt)}</div>
          </div>
        </div>

        <div className="rounded-sm border border-border/40 bg-background p-3">
          <div className="text-[11px] text-muted-foreground">{product.message}</div>
        </div>

        {product.estimates.length > 0 && (
          <div className="border-t border-border/40 pt-2">
            <div className="text-[10px] text-muted-foreground mb-1">District estimates</div>
            <ul className="space-y-2">
              {product.estimates.map((estimate) => (
                <li key={`${estimate.crop}-${estimate.year}`} className="text-[11px]">
                  <div className="font-mono">
                    {estimate.crop} — {estimate.district} — {estimate.year}
                  </div>
                  <div className="font-mono text-muted-foreground">
                    {estimate.areaValue !== null ? (
                      <>
                        area {estimate.areaValue} {estimate.unit}
                        {estimate.yieldValue !== null
                          ? ` — ${estimate.yieldValue} ${estimate.yieldUnit}`
                          : ""}
                      </>
                    ) : (
                      <>{estimate.countLabel}</>
                    )}
                  </div>
                  {estimate.count !== null && estimate.count !== undefined && (
                    <div className="font-mono text-muted-foreground">
                      {estimate.count.toLocaleString("en-US")} {estimate.countLabel}
                    </div>
                  )}
                  <div className="text-muted-foreground">— {estimate.caveat}</div>
                  <div className="mt-0.5">
                    <a
                      className="underline underline-offset-4"
                      href={estimate.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Source
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t border-border/40 pt-2">
          <div className="text-[10px] text-muted-foreground mb-1">Caveats</div>
          <ul className="text-[10px] text-muted-foreground list-disc list-inside space-y-1">
            {product.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export function WeatherPanel() {
  const [sampleId, setSampleId] = useState<(typeof WEATHER_SAMPLE_AOIS)[number]["id"]>(
    "sample-khanewal-orchards",
  );
  const [contextPhase, setContextPhase] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [contextError, setContextError] = useState<string | null>(null);
  const [context, setContext] = useState<WeatherContextResult | null>(null);

  const sample = weatherSampleAoiById(sampleId);

  const fetchContext = async () => {
    setContextPhase("loading");
    setContextError(null);
    try {
      const result = await retrieveWeatherContext({ data: { sampleId } });
      if (result.ok) {
        setContext(result);
        setContextPhase("done");
      } else {
        setContextError(result.error.message);
        setContextPhase("error");
      }
    } catch (error) {
      setContextError("Unexpected error retrieving weather context.");
      setContextPhase("error");
    }
  };

  if (!sample) {
    return (
      <Card className="border border-border">
        <CardContent className="p-4">
          <div className="text-[11px] text-muted-foreground">
            Unknown weather sample AOI: {sampleId}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Environmental History &amp; Forecast</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Sample AOI — public demo rectangle, not a surveyed farm
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-[10px] font-medium text-muted-foreground">Area</label>
        <div className="flex flex-wrap items-center gap-1 rounded-sm border border-border/60 bg-background/50 px-2 py-1">
          {WEATHER_SAMPLE_AOIS.map((aoi) => (
            <Button
              key={aoi.id}
              type="button"
              variant={sampleId === aoi.id ? "default" : "outline"}
              size="sm"
              disabled={contextPhase === "loading"}
              onClick={() => {
                setSampleId(aoi.id);
                setContextPhase("idle");
                setContext(null);
              }}
            >
              {aoi.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-sm border border-border/40 bg-black/10 p-3 text-[11px]">
        {sample.provenance}
      </div>

      <div className="space-y-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={contextPhase === "loading"}
          onClick={fetchContext}
        >
          {contextPhase === "loading" ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin mr-2" />
              Loading weather context…
            </>
          ) : (
            "Refresh weather context"
          )}
        </Button>

        {contextPhase === "error" && contextError && (
          <div className="rounded-sm border border-destructive/50 bg-destructive/10 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "oklch(0.66 0.21 25)" }} />
              <div className="text-[11px] text-destructive">{contextError}</div>
            </div>
          </div>
        )}

        {context && (
          <Tabs defaultValue="overview">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview" className="text-[11px]">
                Overview
              </TabsTrigger>
              <TabsTrigger value="detail" className="text-[11px]">
                Provenance &amp; limits
              </TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="space-y-3">
              {context.products.map((p) => {
                switch (p.type) {
                  case "era5-land-historical":
                    return <Era5LandProduct key={p.type} product={p} />;
                  case "ecmwf-ifs-forecast":
                    return <EcmwfProduct key={p.type} product={p} />;
                  case "pmd-station":
                    return <PmdProduct key={p.type} product={p} />;
                  case "flood-event":
                    return <FloodProduct key={p.type} product={p} />;
                  case "crop-district":
                    return <CropProduct key={p.type} product={p} />;
                  default:
                    return null;
                }
              })}
            </TabsContent>
            <TabsContent value="detail">
              <div className="space-y-3 text-[11px]">
                <div>
                  <div className="text-muted-foreground">AOI</div>
                  <div className="font-mono">{context.aoi.label}</div>
                  <div className="font-mono text-muted-foreground">{context.aoi.provenance}</div>
                  <div className="font-mono text-muted-foreground mt-1">
                    Bbox: [{context.aoi.bbox.join(", ")}]
                  </div>
                </div>
                <Separator />
                <div>
                  <div className="text-muted-foreground">All products retrieved at</div>
                  <div className="font-mono">{formatUtc(context.retrievedAt)}</div>
                </div>
                <Separator />
                <div>
                  <div className="text-muted-foreground">Product types returned</div>
                  <ul className="text-muted-foreground list-disc list-inside space-y-1 mt-1">
                    {context.products.map((p) => (
                      <li key={p.type}>
                        {p.type} — {p.source}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
