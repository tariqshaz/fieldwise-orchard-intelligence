import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BoundaryImportDialog } from "@/components/dashboard/BoundaryImportDialog";
import { GeoMap } from "@/components/dashboard/GeoMap";
import { SentinelObservationPanel } from "@/components/dashboard/SentinelObservationPanel";
import { WeatherPanel } from "@/components/dashboard/WeatherPanel";
import type { ActionStatus, Drone, Recommendation, SensorNode } from "@/types/fieldwise";
import type { ImportedBoundary } from "@/lib/geospatial";
import { getBoundarySummary, loadImportedBoundary } from "@/lib/geospatial";
import {
  getActionLog,
  getFieldwiseSnapshot,
  updateRecommendationStatus,
} from "@/lib/fieldwise-service";
import {
  Activity,
  Battery,
  Cpu,
  Droplets,
  Layers,
  Leaf,
  Plane,
  Radar,
  Signal,
  Wheat,
} from "lucide-react";

type LayerKey = "ndvi" | "moisture" | "flight";

/** Format an instant as Pakistan wall-clock time (UTC+05), the zone the header labels. */
function formatPakistanTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour12: false,
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function Metric({
  label,
  value,
  delta,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  delta?: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="glass-panel relative flex flex-1 items-start gap-4 p-5">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-sm"
        style={{
          background: "oklch(0.82 0.13 85 / 0.1)",
          border: "1px solid oklch(0.82 0.13 85 / 0.25)",
        }}
      >
        <Icon className="h-4 w-4 text-gold" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="label-eyebrow truncate">{label}</div>
        <div className="font-display mt-1 text-3xl leading-none text-gold">{value}</div>
        {hint && <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
      {delta && (
        <div
          className="rounded-sm px-2 py-1 font-mono text-[10px] tracking-wider"
          style={{ background: "oklch(0.78 0.17 150 / 0.12)", color: "oklch(0.84 0.17 150)" }}
        >
          {delta}
        </div>
      )}
    </div>
  );
}

function StatusDot({ tone }: { tone: "ok" | "warn" | "off" }) {
  const c =
    tone === "ok"
      ? "oklch(0.78 0.17 150)"
      : tone === "warn"
        ? "oklch(0.82 0.15 85)"
        : "oklch(0.5 0.02 260)";
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ background: c, boxShadow: `0 0 6px ${c}` }}
    />
  );
}

function UAVCard({ drone }: { drone: Drone }) {
  const battery = drone.battery;
  const payload = drone.payloadLevel;
  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="label-eyebrow">Unit</div>
          <div className="font-display mt-0.5 text-xl text-foreground">{drone.name}</div>
        </div>
        <div className="flex items-center gap-2 rounded-sm border border-gold/30 px-2 py-1">
          <span
            className="h-1.5 w-1.5 rounded-full pulse-gold"
            style={{ background: "oklch(0.78 0.17 150)" }}
          />
          <span
            className="font-mono text-[10px] tracking-widest"
            style={{ color: "oklch(0.84 0.17 150)" }}
          >
            {drone.status.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <div className="mb-1.5 flex justify-between text-[11px]">
            <span className="text-muted-foreground">Battery Reserve</span>
            <span className="font-mono text-gold">{battery.toFixed(1)}% · 11m</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary/40">
            <div
              className="h-full"
              style={{
                width: `${battery}%`,
                background: "linear-gradient(90deg, oklch(0.78 0.17 150), oklch(0.82 0.13 85))",
              }}
            />
          </div>
        </div>

        <div className="flex items-end gap-4">
          <div className="flex-1">
            <div className="mb-1.5 flex justify-between text-[11px]">
              <span className="text-muted-foreground">Payload Depletion</span>
              <span className="font-mono text-gold">{payload.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary/40">
              <div
                className="h-full"
                style={{
                  width: `${payload}%`,
                  background: "linear-gradient(90deg, oklch(0.7 0.18 240), oklch(0.82 0.13 85))",
                }}
              />
            </div>
          </div>
          <div
            className="relative h-14 w-6 rounded-sm border border-gold/40"
            title="Pesticide tank"
          >
            <div
              className="absolute inset-x-0 bottom-0 rounded-sm transition-all"
              style={{
                height: `${payload}%`,
                background:
                  "linear-gradient(180deg, oklch(0.7 0.18 240 / 0.7), oklch(0.55 0.18 240 / 0.9))",
              }}
            />
            <div className="absolute -right-0.5 top-2 h-1 w-1.5 rounded-sm bg-gold/60" />
            <div className="absolute -right-0.5 top-6 h-1 w-1.5 rounded-sm bg-gold/60" />
            <div className="absolute -right-0.5 top-10 h-1 w-1.5 rounded-sm bg-gold/60" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 text-center">
          {[
            { l: "Altitude", v: `${drone.altitude} m` },
            { l: "Speed", v: `${drone.speed} m/s` },
            { l: "Signal", v: `${drone.signalDbm} dBm` },
          ].map((s) => (
            <div key={s.l} className="rounded-sm border border-border/60 py-2">
              <div className="label-eyebrow text-[9px]">{s.l}</div>
              <div className="font-mono mt-1 text-xs text-foreground">{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IoTMesh({ sensorNodes }: { sensorNodes: SensorNode[] }) {
  const nodes = sensorNodes.map((node) => (node.status === "offline" ? "off" : node.status));
  const active = nodes.filter((status) => status === "ok").length;
  return (
    <div className="glass-panel p-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="label-eyebrow">IoT Mesh Health</div>
          <div className="font-display mt-0.5 text-xl">LoRaWAN · {sensorNodes.length} Nodes</div>
        </div>
        <div className="font-mono text-xs text-gold">
          {active}/{sensorNodes.length} <span className="text-muted-foreground">ONLINE</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-10 gap-1.5">
        {nodes.map((s, i) => {
          const c =
            s === "ok"
              ? "oklch(0.78 0.17 150)"
              : s === "warn"
                ? "oklch(0.82 0.15 85)"
                : "oklch(0.45 0.01 260)";
          return (
            <div
              key={i}
              className="aspect-square rounded-[2px]"
              style={{
                background: c,
                opacity: s === "off" ? 0.4 : 0.9,
                boxShadow: s === "ok" ? `0 0 6px ${c}` : undefined,
              }}
            />
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <StatusDot tone="ok" /> Active
        </span>
        <span className="flex items-center gap-1.5">
          <StatusDot tone="warn" /> Low battery
        </span>
        <span className="flex items-center gap-1.5">
          <StatusDot tone="off" /> Offline
        </span>
      </div>
    </div>
  );
}

type Alert = {
  id: number;
  kind: "anomaly" | "irrigation" | "harvest";
  text: string;
  meta: string;
  action?: string;
};

const ALERTS: Alert[] = [
  {
    id: 1,
    kind: "anomaly",
    text: "Critical anomaly detected in Sector 4. Suspected rust disease (confidence 0.94). Drone spot-spray mission generated.",
    meta: "AGRO-AI · 14:32:08",
    action: "Approve dispatch",
  },
  {
    id: 2,
    kind: "irrigation",
    text: "Soil moisture in Sector 2 dropped below 20%. Opening localized IoT valve 03 for 45 minutes.",
    meta: "HYDRA-LOGIC · 14:29:51",
  },
  {
    id: 3,
    kind: "harvest",
    text: "Biomass growth analysis complete. Sector 7 reaching peak maturity. Recommend heavy machinery deployment in 14 days.",
    meta: "YIELD-CAST · 14:18:02",
    action: "View schedule",
  },
  {
    id: 4,
    kind: "anomaly",
    text: "Wind shear advisory: gust >6.2 m/s expected over Sector 11 at 15:10. Auto-rerouting waypoints 7–9.",
    meta: "ATMOS · 14:11:37",
  },
];

function AlertFeed() {
  const tag = (k: Alert["kind"]) => {
    const map = {
      anomaly: { l: "ANOMALY", c: "oklch(0.7 0.21 27)" },
      irrigation: { l: "IRRIGATION", c: "oklch(0.7 0.18 240)" },
      harvest: { l: "YIELD", c: "oklch(0.82 0.13 85)" },
    } as const;
    const m = map[k];
    return (
      <span
        className="font-mono rounded-sm px-1.5 py-0.5 text-[9px] tracking-widest"
        style={{ background: `${m.c} / 0.15`, color: m.c, border: `1px solid ${m.c}` }}
      >
        {m.l}
      </span>
    );
  };

  return (
    <div className="glass-panel flex h-[260px] flex-col p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="label-eyebrow">Decision Engine</div>
          <div className="font-display mt-0.5 text-xl">Autonomous Actions</div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 rounded-full pulse-gold"
            style={{ background: "oklch(0.78 0.17 150)" }}
          />
          <span className="font-mono text-[10px] tracking-widest text-muted-foreground">LIVE</span>
        </div>
      </div>

      <div className="mt-5 flex-1 space-y-4 overflow-y-auto pr-1">
        {ALERTS.map((a) => (
          <div
            key={a.id}
            className="relative rounded-sm border border-border/60 p-4"
            style={{ background: "oklch(0.22 0.04 258 / 0.5)" }}
          >
            <div
              className="absolute left-0 top-0 h-full w-px"
              style={{ background: "oklch(0.82 0.13 85 / 0.4)" }}
            />
            <div className="flex items-center justify-between">
              {tag(a.kind)}
              <span className="font-mono text-[9px] text-muted-foreground">{a.meta}</span>
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed text-foreground/90">{a.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecommendationFeed({
  recommendations,
  actionLog,
  onTransition,
}: {
  recommendations: Recommendation[];
  actionLog: ReturnType<typeof getActionLog>;
  onTransition: (id: string, status: ActionStatus) => void;
}) {
  const nextAction: Partial<Record<ActionStatus, { label: string; status: ActionStatus }>> = {
    pending: { label: "Approve", status: "approved" },
    approved: { label: "Dispatch", status: "dispatched" },
    dispatched: { label: "Complete", status: "completed" },
  };

  return (
    <div className="glass-panel flex h-[360px] flex-col p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="label-eyebrow">Operator Review</div>
          <div className="font-display mt-0.5 text-xl">Recommendations</div>
        </div>
        <span className="font-mono text-xs text-gold">
          {recommendations.filter((item) => item.status === "pending").length} PENDING
        </span>
      </div>
      <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
        {recommendations.map((recommendation) => {
          const action = nextAction[recommendation.status];
          return (
            <article key={recommendation.id} className="rounded-sm border border-border/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium text-foreground">{recommendation.title}</h3>
                <span className="font-mono text-[9px] uppercase tracking-wider text-gold">
                  {recommendation.status}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {recommendation.description}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {Math.round(recommendation.confidence * 100)}% confidence
                </span>
                {action && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => onTransition(recommendation.id, action.status)}
                      className="rounded-sm border border-gold/50 px-2.5 py-1 text-[10px] font-medium text-gold hover:bg-gold/10"
                    >
                      {action.label}
                    </button>
                    {(recommendation.status === "pending" ||
                      recommendation.status === "approved") && (
                      <button
                        onClick={() => onTransition(recommendation.id, "rejected")}
                        className="rounded-sm border border-border px-2.5 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Reject
                      </button>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <div className="mt-3 border-t border-border/60 pt-2">
        <div className="label-eyebrow mb-1">Recent actions</div>
        {actionLog.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">
            No operator actions recorded this session.
          </p>
        ) : (
          <p className="truncate text-[10px] text-muted-foreground">
            {actionLog[0].action} ·{" "}
            {recommendations.find((item) => item.id === actionLog[0].recommendationId)?.title}
          </p>
        )}
      </div>
    </div>
  );
}

function LayerToggle({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-sm border px-3 py-1.5 text-[11px] tracking-wide transition-all"
      style={{
        borderColor: active ? "oklch(0.82 0.13 85 / 0.6)" : "oklch(0.82 0.13 85 / 0.15)",
        background: active ? "oklch(0.82 0.13 85 / 0.12)" : "transparent",
        color: active ? "oklch(0.88 0.13 88)" : "oklch(0.72 0.02 90)",
        fontFamily: "var(--font-mono)",
      }}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function Dashboard() {
  const [snapshot, setSnapshot] = useState(getFieldwiseSnapshot);
  const [actionLog, setActionLog] = useState(getActionLog);
  const [boundary, setBoundary] = useState<ImportedBoundary | null>(null);
  const boundarySummary = boundary ? getBoundarySummary(boundary) : null;
  const knownSectorIds = useMemo(
    () => snapshot.sectors.map((sector) => sector.id),
    [snapshot.sectors],
  );

  useEffect(() => {
    setBoundary(loadImportedBoundary(snapshot.estate.id, knownSectorIds));
  }, [snapshot.estate.id, knownSectorIds]);

  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    ndvi: true,
    moisture: false,
    flight: true,
  });
  const toggle = (key: LayerKey) =>
    setLayers((current) => {
      const enabled = !current[key];
      if (key === "flight") return { ...current, flight: enabled };
      return {
        ...current,
        ndvi: key === "ndvi" && enabled,
        moisture: key === "moisture" && enabled,
      };
    });
  const transitionRecommendation = (id: string, status: ActionStatus) => {
    if (!updateRecommendationStatus(id, status)) return;
    setSnapshot(getFieldwiseSnapshot());
    setActionLog(getActionLog());
  };

  // The header clock is rendered only after mount, and always in Pakistan
  // time (UTC+05, the timezone the label states). Rendering it during the
  // server pass would give the server's clock and timezone, and the browser
  // would then hydrate a different text than the server sent — which aborts
  // hydration for the whole dashboard and leaves the panels unresponsive.
  const [time, setTime] = useState<Date | null>(null);
  useEffect(() => {
    setTime(new Date());
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen p-5 lg:p-7">
      {/* Header */}
      <header className="mb-6 flex items-end justify-between gap-6 border-b border-border/60 pb-5">
        <div className="flex items-center gap-4">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-sm"
            style={{
              background: "var(--gradient-gold)",
              boxShadow: "var(--shadow-gold-glow)",
            }}
          >
            <Wheat className="h-5 w-5" style={{ color: "oklch(0.18 0.04 255)" }} />
          </div>
          <div>
            <div className="label-eyebrow">Sovereign Agronomics · Command</div>
            <h1 className="font-display text-2xl tracking-tight text-foreground">
              Aurelian <span className="text-gold">Operations Console</span>
            </h1>
          </div>
        </div>

        <div className="hidden items-center gap-8 md:flex">
          <div className="text-right">
            <div className="label-eyebrow">Estate</div>
            <div className="font-display text-sm">
              {snapshot.estate.name} · {snapshot.estate.location}
            </div>
          </div>
          <div className="text-right">
            <div className="label-eyebrow">UTC+05</div>
            <div className="font-mono text-sm text-gold">
              {time ? formatPakistanTime(time) : "--:--:--"}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-sm border border-gold/30 px-3 py-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full pulse-gold"
              style={{ background: "oklch(0.78 0.17 150)" }}
            />
            <span className="font-mono text-[10px] tracking-widest text-gold">SYSTEM NOMINAL</span>
          </div>
        </div>
      </header>

      {/* Executive metrics */}
      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Metric
          icon={Leaf}
          label="Input Optimization"
          value={`${snapshot.kpis.inputOptimization}%`}
          delta={`↓ ${snapshot.kpis.pesticideSavedLiters} L`}
          hint="Pesticide saved vs. blanket-spray baseline · YTD"
        />
        <Metric
          icon={Droplets}
          label="Water Efficiency"
          value={`${snapshot.kpis.waterEfficiency}%`}
          delta="vs baseline"
          hint="Irrigation output reduction · IoT-gated valves"
        />
        <Metric
          icon={Radar}
          label="Fleet Coverage"
          value={`${snapshot.kpis.acreageScanned} / ${snapshot.estate.acreage}`}
          delta={`${snapshot.kpis.fleetCoverage}% · today`}
          hint="Acres audited by autonomous swarm logic"
        />
      </section>

      {/* Main grid */}
      <section className="grid grid-cols-12 gap-4">
        {/* Left telemetry */}
        <aside className="col-span-12 space-y-4 xl:col-span-3">
          <UAVCard drone={snapshot.drone} />
          <IoTMesh sensorNodes={snapshot.sensorNodes} />
        </aside>

        {/* Center map */}
        <div className="col-span-12 xl:col-span-6">
          <div className="glass-panel relative h-[640px] overflow-hidden p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="label-eyebrow">Geospatial Intelligence</div>
                <div className="font-display text-lg">
                  Estate Overview ·{" "}
                  <span className="text-gold">
                    {boundarySummary
                      ? `${boundarySummary.center.lat.toFixed(5)}° N, ${boundarySummary.center.lon.toFixed(5)}° E`
                      : "Demo geometry · not surveyed"}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <BoundaryImportDialog
                  estateId={snapshot.estate.id}
                  sectors={snapshot.sectors}
                  boundary={boundary}
                  onImported={setBoundary}
                  onCleared={() => setBoundary(null)}
                />
                <LayerToggle
                  active={layers.ndvi}
                  onClick={() => toggle("ndvi")}
                  label="NDVI"
                  icon={Leaf}
                />
                <LayerToggle
                  active={layers.moisture}
                  onClick={() => toggle("moisture")}
                  label="MOISTURE"
                  icon={Droplets}
                />
                <LayerToggle
                  active={layers.flight}
                  onClick={() => toggle("flight")}
                  label="FLIGHT PATH"
                  icon={Plane}
                />
              </div>
            </div>

            <div className="relative h-[calc(100%-3.5rem)]">
              <GeoMap layers={layers} sectors={snapshot.sectors} boundary={boundary} />

              {/* Legend */}
              <div className="glass-panel absolute bottom-3 left-3 p-3">
                <div className="label-eyebrow mb-2">NDVI Index</div>
                <div className="flex items-center gap-2">
                  <div
                    className="h-1.5 w-32 rounded-full"
                    style={{
                      background:
                        "linear-gradient(90deg, oklch(0.6 0.22 28), oklch(0.78 0.16 60), oklch(0.78 0.16 110), oklch(0.72 0.18 145))",
                    }}
                  />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    Stressed → Vigorous
                  </span>
                </div>
                <div className="mt-2 max-w-[190px] font-mono text-[9px] leading-relaxed text-muted-foreground">
                  {boundary
                    ? "Imported geometry · NDVI values from seed data"
                    : "Illustrative parcels · not surveyed · NDVI values from seed data"}
                </div>
              </div>

              {/* Coords HUD */}
              <div className="glass-panel absolute right-3 top-3 px-3 py-2">
                <div className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {boundarySummary ? (
                    <>
                      <div>
                        LAT{" "}
                        <span className="text-gold">{boundarySummary.center.lat.toFixed(5)}</span>
                      </div>
                      <div>
                        LON{" "}
                        <span className="text-gold">{boundarySummary.center.lon.toFixed(5)}</span>
                      </div>
                      <div>
                        SPAN{" "}
                        <span className="text-gold">
                          {boundarySummary.extentKm.width.toFixed(1)} ×{" "}
                          {boundarySummary.extentKm.height.toFixed(1)} km
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        LAT <span className="text-gold">—</span>
                      </div>
                      <div>
                        LON <span className="text-gold">—</span>
                      </div>
                      <div>
                        LAYOUT <span className="text-gold">DEMO</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Geometry provenance */}
              <div className="glass-panel absolute bottom-3 right-3 hidden px-3 py-2 sm:block">
                <div className="font-mono text-[9px] leading-relaxed tracking-wider text-muted-foreground">
                  {boundary ? (
                    <>
                      <div style={{ color: "oklch(0.84 0.17 150)" }}>GEOMETRY · IMPORTED</div>
                      <div className="max-w-[180px] truncate">{boundary.sourceName}</div>
                      <div>
                        {boundary.sectors.length}/{snapshot.sectors.length} sectors mapped
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-gold">GEOMETRY · DEMO</div>
                      <div className="max-w-[170px]">Illustrative layout · not surveyed</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right brain */}
        <aside className="col-span-12 space-y-4 xl:col-span-3">
          <RecommendationFeed
            recommendations={snapshot.recommendations}
            actionLog={actionLog}
            onTransition={transitionRecommendation}
          />
          <AlertFeed />
        </aside>
      </section>

      {/* Sentinel-2 observation — separate imagery panel, not a map overlay.
          See SITREP Phase 2: search → select one scene → NDVI with provenance. */}
      <section className="mt-4">
        <SentinelObservationPanel boundary={boundary} />
      </section>

      {/* Phase 3 — Environmental history and live forecast.
          Historical reanalysis (ERA5-Land), current forecast (ECMWF IFS),
          and contextual references (PMD, flood, crop statistics). */}
      <section className="mt-4">
        <WeatherPanel />
      </section>

      {/* Footer strip */}
      <footer className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-4 text-[10px]">
        <div className="flex items-center gap-6 text-muted-foreground">
          <span className="flex items-center gap-2">
            <Cpu className="h-3 w-3 text-gold" /> Edge inference 12 ms
          </span>
          <span className="flex items-center gap-2">
            <Signal className="h-3 w-3 text-gold" /> LoRa RSSI −74 dBm
          </span>
          <span className="flex items-center gap-2">
            <Activity className="h-3 w-3 text-gold" /> Telemetry 2.4 kHz
          </span>
          <span className="flex items-center gap-2">
            <Layers className="h-3 w-3 text-gold" /> 3 layers · 11 sectors
          </span>
        </div>
        <div className="font-mono tracking-widest text-muted-foreground">
          AURELIAN · v4.21 · Q2 LAUNCH WINDOW · JUN 02 2026
        </div>
      </footer>
    </div>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aurelian · Sovereign Agronomics Console" },
      {
        name: "description",
        content:
          "Quiet-luxury operations console for autonomous precision agriculture: geospatial intelligence, UAV telemetry, and AI decision engine.",
      },
      { property: "og:title", content: "Aurelian · Sovereign Agronomics Console" },
      {
        property: "og:description",
        content: "Executive command interface for autonomous farming operations.",
      },
    ],
  }),
  component: Dashboard,
});

// Imports placed at top of file in real bundling order
