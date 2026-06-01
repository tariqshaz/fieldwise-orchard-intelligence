import { useEffect, useState } from "react";

type Sector = { id: string; x: number; y: number; w: number; h: number; ndvi: number };
const SECTORS: Sector[] = [
  { id: "S1", x: 6, y: 10, w: 22, h: 26, ndvi: 0.82 },
  { id: "S2", x: 30, y: 8, w: 20, h: 22, ndvi: 0.41 },
  { id: "S3", x: 52, y: 12, w: 24, h: 28, ndvi: 0.74 },
  { id: "S4", x: 78, y: 10, w: 16, h: 24, ndvi: 0.18 },
  { id: "S5", x: 6, y: 40, w: 28, h: 24, ndvi: 0.68 },
  { id: "S6", x: 36, y: 34, w: 22, h: 30, ndvi: 0.58 },
  { id: "S7", x: 60, y: 38, w: 20, h: 28, ndvi: 0.88 },
  { id: "S8", x: 82, y: 38, w: 12, h: 28, ndvi: 0.55 },
  { id: "S9", x: 8, y: 68, w: 30, h: 24, ndvi: 0.62 },
  { id: "S10", x: 40, y: 68, w: 26, h: 22, ndvi: 0.71 },
  { id: "S11", x: 68, y: 68, w: 26, h: 24, ndvi: 0.49 },
];

function ndviColor(v: number) {
  // red (stressed) -> amber -> green (healthy)
  if (v < 0.3) return "oklch(0.6 0.22 28 / 0.55)";
  if (v < 0.5) return "oklch(0.78 0.16 60 / 0.5)";
  if (v < 0.7) return "oklch(0.78 0.16 110 / 0.45)";
  return "oklch(0.72 0.18 145 / 0.5)";
}

type LayerKey = "ndvi" | "moisture" | "flight";

export function GeoMap({ layers }: { layers: Record<LayerKey, boolean> }) {
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

  // Drone flight path waypoints (percent coordinates)
  const path: [number, number][] = [
    [12, 22], [40, 18], [64, 26], [86, 22],
    [78, 50], [50, 48], [22, 52], [18, 78],
    [50, 80], [80, 78],
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
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        <defs>
          <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M5 0H0V5" fill="none" stroke="oklch(0.82 0.13 85 / 0.06)" strokeWidth="0.1" />
          </pattern>
          <radialGradient id="moisture" cx="40%" cy="55%" r="45%">
            <stop offset="0%" stopColor="oklch(0.7 0.18 240 / 0.55)" />
            <stop offset="100%" stopColor="oklch(0.5 0.18 240 / 0)" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="0.6" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="100" height="100" fill="url(#grid)" />

        {/* Field parcels */}
        {SECTORS.map((s) => (
          <g key={s.id}>
            <rect
              x={s.x}
              y={s.y}
              width={s.w}
              height={s.h}
              fill={layers.ndvi ? ndviColor(s.ndvi) : "oklch(0.3 0.04 260 / 0.25)"}
              stroke="oklch(0.82 0.13 85 / 0.18)"
              strokeWidth="0.15"
            />
            <text
              x={s.x + 1}
              y={s.y + 3}
              fontSize="1.6"
              fill="oklch(0.82 0.13 85 / 0.7)"
              fontFamily="JetBrains Mono"
            >
              {s.id}
            </text>
          </g>
        ))}

        {/* Moisture overlay */}
        {layers.moisture && (
          <>
            <ellipse cx="28" cy="55" rx="22" ry="14" fill="url(#moisture)" />
            <ellipse cx="70" cy="40" rx="18" ry="12" fill="url(#moisture)" opacity="0.7" />
            <ellipse cx="55" cy="78" rx="20" ry="10" fill="url(#moisture)" opacity="0.5" />
          </>
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
              <circle r="2.4" fill="none" stroke="oklch(0.88 0.14 85)" strokeWidth="0.2" opacity="0.6" />
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
        style={{ background: "linear-gradient(90deg, transparent, oklch(0.82 0.13 85 / 0.55), transparent)" }}
      />
    </div>
  );
}
