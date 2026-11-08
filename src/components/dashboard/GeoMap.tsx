import { useEffect, useMemo, useState } from "react";
import type { Sector as FieldSector } from "@/types/fieldwise";
import type { ImportedBoundary } from "@/lib/geospatial";
import { projectBoundary } from "@/lib/geospatial";

type Parcel = { id: string; x: number; y: number; w: number; h: number };
const PARCELS: Parcel[] = [
  { id: "S1", x: 6, y: 10, w: 22, h: 26 },
  { id: "S2", x: 30, y: 8, w: 20, h: 22 },
  { id: "S3", x: 52, y: 12, w: 24, h: 28 },
  { id: "S4", x: 78, y: 10, w: 16, h: 24 },
  { id: "S5", x: 6, y: 40, w: 28, h: 24 },
  { id: "S6", x: 36, y: 34, w: 22, h: 30 },
  { id: "S7", x: 60, y: 38, w: 20, h: 28 },
  { id: "S8", x: 82, y: 38, w: 12, h: 28 },
  { id: "S9", x: 8, y: 68, w: 30, h: 24 },
  { id: "S10", x: 40, y: 68, w: 26, h: 22 },
  { id: "S11", x: 68, y: 68, w: 26, h: 24 },
];

function ndviColor(v: number) {
  // red (stressed) -> amber -> green (healthy)
  if (v < 0.3) return "oklch(0.6 0.22 28 / 0.55)";
  if (v < 0.5) return "oklch(0.78 0.16 60 / 0.5)";
  if (v < 0.7) return "oklch(0.78 0.16 110 / 0.45)";
  return "oklch(0.72 0.18 145 / 0.5)";
}

function moistureColor(v: number) {
  if (v < 20) return "oklch(0.62 0.2 28 / 0.58)";
  if (v < 25) return "oklch(0.78 0.16 70 / 0.5)";
  return "oklch(0.68 0.17 240 / 0.52)";
}

type LayerKey = "ndvi" | "moisture" | "flight";

export function GeoMap({
  layers,
  sectors,
  boundary,
}: {
  layers: Record<LayerKey, boolean>;
  sectors: FieldSector[];
  boundary?: ImportedBoundary | null;
}) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf: number;
    const tick = () => {
      setT((v) => (v + 0.0035) % 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const projectedBoundary = useMemo(
    () => (boundary ? projectBoundary(boundary) : null),
    [boundary],
  );

  const fillForSector = (sector: FieldSector) =>
    layers.ndvi
      ? ndviColor(sector.ndvi)
      : layers.moisture
        ? moistureColor(sector.moisture)
        : "oklch(0.3 0.04 260 / 0.25)";

  // Drone flight path waypoints (percent coordinates)
  const path: [number, number][] = [
    [12, 22],
    [40, 18],
    [64, 26],
    [86, 22],
    [78, 50],
    [50, 48],
    [22, 52],
    [18, 78],
    [50, 80],
    [80, 78],
  ];
  const segIdx = Math.floor(t * (path.length - 1));
  const segT = t * (path.length - 1) - segIdx;
  const [px1, py1] = path[segIdx];
  const [px2, py2] = path[Math.min(segIdx + 1, path.length - 1)];
  const droneX = px1 + (px2 - px1) * segT;
  const droneY = py1 + (py2 - py1) * segT;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md">
      {/* Base satellite-ish backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, oklch(0.32 0.05 150 / 0.4), transparent 60%), radial-gradient(ellipse at 75% 70%, oklch(0.28 0.05 80 / 0.35), transparent 55%), linear-gradient(180deg, oklch(0.2 0.04 255), oklch(0.16 0.04 255))",
        }}
      />

      {/* Topographic contour lines */}
      <svg
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio={projectedBoundary ? "xMidYMid meet" : "none"}
        viewBox="0 0 100 100"
      >
        <defs>
          <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M5 0H0V5" fill="none" stroke="oklch(0.82 0.13 85 / 0.06)" strokeWidth="0.1" />
          </pattern>
          <filter id="glow">
            <feGaussianBlur stdDeviation="0.6" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="100" height="100" fill="url(#grid)" />

        {/* Imported boundaries, or the illustrative demo layout */}
        {projectedBoundary ? (
          <>
            <path
              d={projectedBoundary.estatePath}
              fill="oklch(0.26 0.04 255 / 0.55)"
              stroke="oklch(0.82 0.13 85 / 0.9)"
              strokeWidth="0.35"
              strokeDasharray="1 0.5"
              strokeLinejoin="round"
              fillRule="evenodd"
            />
            {projectedBoundary.sectors.map((parcel) => {
              const sector = sectors.find((item) => item.id === parcel.sectorId);
              if (!sector) return null;

              return (
                <g key={parcel.sectorId}>
                  <path
                    d={parcel.path}
                    fill={fillForSector(sector)}
                    stroke="oklch(0.82 0.13 85 / 0.5)"
                    strokeWidth="0.14"
                    strokeLinejoin="round"
                    fillRule="evenodd"
                  >
                    <title>
                      {sector.name} · NDVI {sector.ndvi.toFixed(2)} · Soil moisture{" "}
                      {sector.moisture}%
                    </title>
                  </path>
                  <text
                    x={parcel.labelX}
                    y={parcel.labelY}
                    fontSize="1.5"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="oklch(0.9 0.1 88)"
                    stroke="oklch(0.1 0.03 255 / 0.9)"
                    strokeWidth="0.3"
                    style={{ paintOrder: "stroke" }}
                    fontFamily="JetBrains Mono"
                  >
                    {sector.name.replace("Sector ", "S")}
                  </text>
                </g>
              );
            })}
          </>
        ) : (
          PARCELS.map((parcel) => {
            const sector = sectors.find((item) => item.id === `sector-${parcel.id.slice(1)}`);
            if (!sector) return null;
            return (
              <g key={sector.id}>
                <rect
                  x={parcel.x}
                  y={parcel.y}
                  width={parcel.w}
                  height={parcel.h}
                  fill={fillForSector(sector)}
                  stroke="oklch(0.82 0.13 85 / 0.18)"
                  strokeWidth="0.15"
                />
                <text
                  x={parcel.x + 1}
                  y={parcel.y + 3}
                  fontSize="1.6"
                  fill="oklch(0.82 0.13 85 / 0.7)"
                  fontFamily="JetBrains Mono"
                >
                  {sector.name.replace("Sector ", "S")}
                </text>
              </g>
            );
          })
        )}

        {/* Flight path */}
        {layers.flight && (
          <>
            <polyline
              points={path.map((p) => p.join(",")).join(" ")}
              fill="none"
              stroke="oklch(0.82 0.13 85 / 0.35)"
              strokeWidth="0.25"
              strokeDasharray="0.6 0.6"
            />
            <polyline
              points={path.map((p) => p.join(",")).join(" ")}
              fill="none"
              stroke="oklch(0.88 0.14 85)"
              strokeWidth="0.4"
              strokeDasharray="3 200"
              strokeDashoffset={-t * 200}
              filter="url(#glow)"
              opacity="0.9"
            />
            {path.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="0.45" fill="oklch(0.88 0.14 85)" opacity="0.7" />
            ))}
            {/* Drone */}
            <g transform={`translate(${droneX} ${droneY})`} filter="url(#glow)">
              <circle r="1.2" fill="oklch(0.92 0.14 88)" />
              <circle
                r="2.4"
                fill="none"
                stroke="oklch(0.88 0.14 85)"
                strokeWidth="0.2"
                opacity="0.6"
              />
            </g>
          </>
        )}

        {/* IoT sensor dots */}
        {Array.from({ length: 22 }).map((_, i) => {
          const x = ((i * 37) % 95) + 3;
          const y = ((i * 53) % 90) + 5;
          return <circle key={i} cx={x} cy={y} r="0.35" fill="oklch(0.82 0.13 85 / 0.75)" />;
        })}
      </svg>

      {/* Crosshair / corner brackets */}
      <div className="pointer-events-none absolute inset-3">
        {(["tl", "tr", "bl", "br"] as const).map((c) => (
          <div
            key={c}
            className="absolute h-4 w-4 border-gold/60"
            style={{
              top: c.startsWith("t") ? 0 : "auto",
              bottom: c.startsWith("b") ? 0 : "auto",
              left: c.endsWith("l") ? 0 : "auto",
              right: c.endsWith("r") ? 0 : "auto",
              borderColor: "oklch(0.82 0.13 85 / 0.55)",
              borderTopWidth: c.startsWith("t") ? 1 : 0,
              borderBottomWidth: c.startsWith("b") ? 1 : 0,
              borderLeftWidth: c.endsWith("l") ? 1 : 0,
              borderRightWidth: c.endsWith("r") ? 1 : 0,
            }}
          />
        ))}
      </div>

      {/* Scan line */}
      <div
        className="pointer-events-none absolute inset-x-0 h-px scan-line"
        style={{
          background:
            "linear-gradient(90deg, transparent, oklch(0.82 0.13 85 / 0.55), transparent)",
        }}
      />
    </div>
  );
}
