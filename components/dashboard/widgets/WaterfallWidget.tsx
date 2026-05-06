// File: components/dashboard/widgets/WaterfallWidget.tsx
// Role: widget "cascade" — décomposition d'un KPI en étapes additives /
// soustractives. Visualise comment on passe d'un total à un autre via une
// suite de + et de -.
//
// Exemple "ebitda" : Production - Achats - Charges externes - Charges
// personnel = EBITDA. Chaque marche est une barre verticale ; les marches
// soustractives sont en rose, les positives en vert/or, le total en blanc.
"use client";

import { useMemo } from "react";
import { formatCurrency, INSUFFICIENT_DATA_LABEL } from "@/components/dashboard/formatting";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import type { MappedFinancialData } from "@/types/analysis";

type WaterfallWidgetProps = {
  kpiId: string;
  mappedData: MappedFinancialData | null;
};

type WaterfallStep = {
  label: string;
  value: number;
  /** "start" = barre pleine valeur initiale ; "delta" = saut additif/soustractif ; "total" = barre pleine valeur finale. */
  kind: "start" | "delta" | "total";
};

// Construit les étapes de cascade pour un KPI donné. Retourne une liste vide
// si le KPI ne supporte pas la cascade (ou si les données manquent).
function buildWaterfallSteps(kpiId: string, m: MappedFinancialData | null): WaterfallStep[] {
  if (!m) return [];

  switch (kpiId) {
    case "va":
      // Production - Achats - Charges externes = VA
      return [
        { label: "Production", value: posVal(m.total_prod_expl), kind: "start" },
        { label: "− Achats march.", value: -posVal(m.achats_march), kind: "delta" },
        { label: "− Achats matières", value: -posVal(m.achats_mp), kind: "delta" },
        { label: "− Charges externes", value: -posVal(m.ace), kind: "delta" },
        {
          label: "VA",
          value:
            posVal(m.total_prod_expl) -
            posVal(m.achats_march) -
            posVal(m.achats_mp) -
            posVal(m.ace),
          kind: "total"
        }
      ];
    case "ebitda":
    case "ebe": {
      // VA - Impôts/taxes - Salaires - Charges sociales = EBITDA
      const va =
        posVal(m.total_prod_expl) -
        posVal(m.achats_march) -
        posVal(m.achats_mp) -
        posVal(m.ace);
      return [
        { label: "VA", value: va, kind: "start" },
        { label: "− Impôts/taxes", value: -posVal(m.impots_taxes), kind: "delta" },
        { label: "− Salaires", value: -posVal(m.salaires), kind: "delta" },
        { label: "− Charges sociales", value: -posVal(m.charges_soc), kind: "delta" },
        {
          label: "EBITDA",
          value: va - posVal(m.impots_taxes) - posVal(m.salaires) - posVal(m.charges_soc),
          kind: "total"
        }
      ];
    }
    case "resultat_net":
    case "netProfit": {
      // EBIT - Charges fin + Prod fin + Excep - IS = Résultat net
      const ebit = m.ebit ?? 0;
      const fin = posVal(m.prod_fin) - posVal(m.charges_fin);
      const excep = posVal(m.prod_excep) - posVal(m.charges_excep);
      const is = posVal(m.is_impot);
      const rn = ebit + fin + excep - is;
      return [
        { label: "Résultat exploitation", value: posVal(ebit), kind: "start" },
        { label: fin >= 0 ? "+ Résultat financier" : "− Résultat financier", value: fin, kind: "delta" },
        { label: excep >= 0 ? "+ Résultat exceptionnel" : "− Résultat exceptionnel", value: excep, kind: "delta" },
        { label: "− Impôts (IS)", value: -is, kind: "delta" },
        { label: "Résultat net", value: rn, kind: "total" }
      ];
    }
    case "caf":
      // Résultat net + DAP = CAF (méthode soustractive simplifiée)
      return [
        { label: "Résultat net", value: posVal(m.res_net ?? m.resultat_exercice), kind: "start" },
        { label: "+ Dotations amort./prov.", value: posVal(m.dap), kind: "delta" },
        {
          label: "CAF",
          value: posVal(m.res_net ?? m.resultat_exercice) + posVal(m.dap),
          kind: "total"
        }
      ];
    default:
      return [];
  }
}

function posVal(v: number | null | undefined): number {
  if (v === null || v === undefined || !Number.isFinite(v)) return 0;
  return v;
}

export function WaterfallWidget({ kpiId, mappedData }: WaterfallWidgetProps) {
  const definition = getKpiDefinition(kpiId);
  const steps = useMemo(() => buildWaterfallSteps(kpiId, mappedData), [kpiId, mappedData]);
  const title = definition?.label ?? kpiId;
  const shortLabel = definition?.shortLabel ?? kpiId;

  // Calcule l'échelle Y : on prend la plage [0, max(step values absolus)] pour
  // que toutes les barres soient comparables.
  const maxAbs = Math.max(...steps.map((s) => Math.abs(s.value)), 1);
  const barWidth = 60;
  const barGap = 24;
  const chartWidth = steps.length * (barWidth + barGap);
  const chartHeight = 200;

  function barColor(kind: WaterfallStep["kind"], value: number): string {
    if (kind === "start" || kind === "total") return "#FFFFFF";
    return value >= 0 ? "#10B981" : "#FB7185";
  }

  if (steps.length === 0) {
    return (
      <article className="precision-card fade-up flex h-full flex-col rounded-2xl p-5">
        <header className="mb-3">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
            Cascade · {shortLabel}
          </span>
          <h3 className="text-base font-semibold text-white">{title}</h3>
        </header>
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
          <p className="max-w-xs text-xs text-white/55">
            Décomposition cascade non disponible pour ce KPI ou données manquantes.
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className="precision-card fade-up flex h-full flex-col rounded-2xl p-5">
      <header className="mb-3">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
          Cascade · {shortLabel}
        </span>
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </header>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight + 40}`}
          width="100%"
          height={chartHeight + 40}
          className="min-w-full"
          preserveAspectRatio="xMidYMin meet"
        >
          {/* Ligne de base */}
          <line
            x1={0}
            y1={chartHeight}
            x2={chartWidth}
            y2={chartHeight}
            stroke="rgba(255,255,255,0.1)"
          />
          {steps.map((step, idx) => {
            const x = idx * (barWidth + barGap) + barGap / 2;
            const heightRatio = Math.abs(step.value) / maxAbs;
            const h = heightRatio * (chartHeight - 30);
            const y = chartHeight - h;
            return (
              <g key={`${step.label}-${idx}`}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={h}
                  fill={barColor(step.kind, step.value)}
                  rx={3}
                  opacity={step.kind === "delta" ? 0.85 : 1}
                />
                <text
                  x={x + barWidth / 2}
                  y={y - 6}
                  fontSize="10"
                  fill="rgba(255,255,255,0.85)"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {formatCompact(step.value)}
                </text>
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 18}
                  fontSize="10"
                  fill="rgba(255,255,255,0.55)"
                  textAnchor="middle"
                >
                  {step.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </article>
  );
}

function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return INSUFFICIENT_DATA_LABEL;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${Math.round(abs)}`;
}

// ─── Helpers (export non utilisé ici mais pratique pour tests) ──────────
export function getWaterfallTotal(kpiId: string, m: MappedFinancialData | null): number | null {
  const steps = buildWaterfallSteps(kpiId, m);
  if (steps.length === 0) return null;
  const total = steps.find((s) => s.kind === "total");
  return total?.value ?? null;
}

void formatCurrency; // garde l'import au cas où on ré-active le tooltip Recharts plus tard
