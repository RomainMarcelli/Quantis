"use client";

import { ReferenceDot } from "recharts";

type BreakEvenPointMarkerProps = {
  x: number;
  y: number;
  isDark: boolean;
  tone?: "gold" | "light" | "muted";
  pulse?: boolean;
  ifOverflow?: "discard" | "hidden" | "visible" | "extendDomain";
  zIndex?: number;
  haloRadius?: number;
  coreRadius?: number;
};

type BreakEvenPointGuideProps = {
  left: string;
  top: number;
  bottom: number;
  isDark: boolean;
  label: string;
};

export function BreakEvenPointMarker({
  x,
  y,
  isDark,
  tone = "gold",
  pulse = false,
  ifOverflow = "extendDomain",
  zIndex = 6,
  haloRadius,
  coreRadius
}: BreakEvenPointMarkerProps) {
  const palette =
    tone === "light"
      ? {
          halo: isDark ? "rgba(248,250,252,0.18)" : "rgba(15,23,42,0.15)",
          core: isDark ? "#f8fafc" : "#0f172a",
          stroke: isDark ? "rgba(248,250,252,0.74)" : "rgba(15,23,42,0.65)"
        }
      : tone === "muted"
        ? {
            halo: isDark ? "rgba(148,163,184,0.18)" : "rgba(100,116,139,0.14)",
            core: isDark ? "#cbd5e1" : "#64748b",
            stroke: isDark ? "rgba(148,163,184,0.72)" : "rgba(100,116,139,0.7)"
          }
        : {
            halo: isDark ? "rgba(197,160,89,0.2)" : "rgba(197,160,89,0.26)",
            core: isDark ? "#0f0f12" : "#ffffff",
            stroke: "#C5A059"
          };

  const halo = haloRadius ?? (tone === "gold" ? 13 : 11);
  const core = coreRadius ?? (tone === "gold" ? 6.2 : 5.2);

  return (
    <>
      <ReferenceDot
        x={x}
        y={y}
        r={halo}
        fill={palette.halo}
        stroke="none"
        className={pulse ? "animate-pulse" : undefined}
        ifOverflow={ifOverflow}
        zIndex={zIndex}
      />
      <ReferenceDot
        x={x}
        y={y}
        r={core}
        fill={palette.core}
        stroke={palette.stroke}
        strokeWidth={tone === "gold" ? 3.1 : 2.4}
        ifOverflow={ifOverflow}
        zIndex={zIndex + 1}
      />
    </>
  );
}

export function BreakEvenPointGuide({ left, top, bottom, isDark, label }: BreakEvenPointGuideProps) {
  return (
    <>
      <div
        className="pointer-events-none absolute z-20 border-l-2 border-dashed"
        style={{
          left,
          top: `${top}px`,
          bottom: `${bottom}px`,
          borderLeftColor: "rgba(197,160,89,0.7)"
        }}
        aria-hidden="true"
      />

      <div className="pointer-events-none absolute inset-x-0 top-3 z-30">
        <div className="absolute -translate-x-1/2" style={{ left }}>
          <span
            className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
              isDark
                ? "border-quantis-gold/45 bg-black/68 text-quantis-gold"
                : "border-amber-500/40 bg-white/95 text-amber-700"
            }`}
          >
            {label}
          </span>
        </div>
      </div>

      <div
        className="pointer-events-none absolute z-30 border-l-2 border-dashed"
        style={{
          left,
          top: "34px",
          height: `${Math.max(top - 34, 12)}px`,
          borderLeftColor: isDark ? "rgba(197,160,89,0.58)" : "rgba(197,160,89,0.66)"
        }}
        aria-hidden="true"
      />
    </>
  );
}
