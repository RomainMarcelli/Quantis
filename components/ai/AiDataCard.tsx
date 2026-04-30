// File: components/ai/AiDataCard.tsx
// Role: micro-card inline qui présente un chiffre clé extrait d'une réponse
// IA structurée. Fond doré transparent, valeur en blanc bold, variation
// colorée (vert ↗ / rouge ↘) et nom du KPI en small-caps gold.
//
// Optionnellement embarque un sparkline (cf. `AiSparkline`) à droite quand la
// série mensuelle est disponible — sinon la card reste compacte.
//
// Cliquable : si `kpiId` est fourni, on dispatche `vyzor:kpi:open-chat` pour
// que le provider du chat ré-ouvre le panel focus sur ce KPI. La page
// dashboard peut écouter le même event pour scroll vers la carte concernée.
"use client";

import { AiSparkline } from "@/components/ai/AiSparkline";

type AiDataCardProps = {
  label: string;
  value: string;
  variationPct?: number | null;
  kpiId?: string;
  sparklinePoints?: number[];
  /** Override du clic — sinon dispatch CustomEvent(`vyzor:kpi:open-chat`). */
  onClick?: () => void;
};

export function AiDataCard({
  label,
  value,
  variationPct,
  kpiId,
  sparklinePoints,
  onClick,
}: AiDataCardProps) {
  const clickable = Boolean(onClick) || Boolean(kpiId);

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (kpiId && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("vyzor:kpi:open-chat", { detail: { kpiId } })
      );
    }
  };

  const variation = formatVariation(variationPct);
  const ariaLabel = `${label} : ${value}${
    variation ? `, variation ${variation.label}` : ""
  }`;

  const Wrapper = clickable ? "button" : "div";
  const wrapperProps = clickable
    ? {
        type: "button" as const,
        onClick: handleClick,
        "aria-label": ariaLabel,
      }
    : { "aria-label": ariaLabel };

  return (
    <Wrapper
      {...wrapperProps}
      className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition${
        clickable ? " cursor-pointer" : ""
      }`}
      style={{
        backgroundColor: "rgba(197, 160, 89, 0.08)",
        border: "1px solid rgba(197, 160, 89, 0.2)",
      }}
      onMouseEnter={
        clickable
          ? (e) => {
              e.currentTarget.style.backgroundColor = "rgba(197, 160, 89, 0.14)";
              e.currentTarget.style.borderColor = "rgba(197, 160, 89, 0.4)";
              e.currentTarget.style.boxShadow = "0 0 12px rgba(197, 160, 89, 0.18)";
            }
          : undefined
      }
      onMouseLeave={
        clickable
          ? (e) => {
              e.currentTarget.style.backgroundColor = "rgba(197, 160, 89, 0.08)";
              e.currentTarget.style.borderColor = "rgba(197, 160, 89, 0.2)";
              e.currentTarget.style.boxShadow = "none";
            }
          : undefined
      }
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className="truncate text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "#C5A059" }}
        >
          {label}
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-[16px] font-semibold tabular-nums text-white">
            {value}
          </span>
          {variation ? (
            <span
              className="text-[12px] font-medium tabular-nums"
              style={{ color: variation.color }}
            >
              {variation.label}
            </span>
          ) : null}
        </div>
      </div>

      {sparklinePoints && sparklinePoints.length >= 2 ? (
        <div className="flex-shrink-0">
          <AiSparkline points={sparklinePoints} width={64} height={28} />
        </div>
      ) : null}
    </Wrapper>
  );
}

function formatVariation(pct: number | null | undefined): { label: string; color: string } | null {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null;
  if (Math.abs(pct) < 0.05) return null;
  const isUp = pct > 0;
  const arrow = isUp ? "↗" : "↘";
  const sign = isUp ? "+" : "";
  return {
    label: `${arrow} ${sign}${pct.toFixed(1)}%`,
    color: isUp ? "#22C55E" : "#EF4444",
  };
}
