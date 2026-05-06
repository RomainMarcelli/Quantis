// File: components/dashboard/widgets/DonutWidget.tsx
// Role: widget "donut" — répartition d'un KPI en sous-postes. La décomposition
// est définie par KPI dans le map ci-dessous (lecture depuis MappedFinancialData).
// Couvre les KPIs financiers les plus parlants en répartition :
//   - bfr : stocks + créances - fournisseurs - dettes_fisc_soc
//   - charges_fixes : ace + salaires + charges_soc + dap
//   - va : production - consommations intermédiaires
//   - total_passif : capitaux propres + emprunts + fournisseurs + autres dettes
"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, type TooltipContentProps } from "recharts";
import {
  formatCurrency,
  INSUFFICIENT_DATA_LABEL
} from "@/components/dashboard/formatting";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import type { MappedFinancialData } from "@/types/analysis";

type DonutWidgetProps = {
  kpiId: string;
  mappedData: MappedFinancialData | null;
};

type Slice = {
  name: string;
  value: number;
  color: string;
};

// Palette pour les sous-postes — or + variations chaudes pour les apports
// (positif), rose pour les consommations (négatif) si présent.
const SLICE_COLORS = ["#C5A059", "#E5C580", "#A88445", "#7E5F2F", "#FBBF24", "#FB923C"];

// Map KPI → décomposition. Chaque entrée doit retourner une liste de slices
// avec valeurs >= 0. Pour les variables négatives (créances clients vs
// fournisseurs), on absolutise et on étiquette clairement.
function buildSlices(kpiId: string, m: MappedFinancialData | null): Slice[] {
  if (!m) return [];

  switch (kpiId) {
    case "bfr": {
      // BFR = (stocks + créances) - (fournisseurs + dettes_fisc_soc)
      const positive: Slice[] = [
        { name: "Stocks", value: posVal(m.total_stocks), color: SLICE_COLORS[0] },
        { name: "Créances clients", value: posVal(m.creances), color: SLICE_COLORS[1] }
      ];
      const negative: Slice[] = [
        { name: "Fournisseurs", value: posVal(m.fournisseurs), color: SLICE_COLORS[2] },
        { name: "Dettes fisc/soc", value: posVal(m.dettes_fisc_soc), color: SLICE_COLORS[3] }
      ];
      return [...positive, ...negative].filter((s) => s.value > 0);
    }
    case "charges_fixes":
      return [
        { name: "Charges externes", value: posVal(m.ace), color: SLICE_COLORS[0] },
        { name: "Salaires", value: posVal(m.salaires), color: SLICE_COLORS[1] },
        { name: "Charges sociales", value: posVal(m.charges_soc), color: SLICE_COLORS[2] },
        { name: "Dotations amort.", value: posVal(m.dap), color: SLICE_COLORS[3] }
      ].filter((s) => s.value > 0);
    case "total_passif":
      return [
        { name: "Capitaux propres", value: posVal(m.total_cp), color: SLICE_COLORS[0] },
        { name: "Provisions", value: posVal(m.total_prov), color: SLICE_COLORS[1] },
        { name: "Emprunts", value: posVal(m.emprunts), color: SLICE_COLORS[2] },
        { name: "Fournisseurs", value: posVal(m.fournisseurs), color: SLICE_COLORS[3] },
        { name: "Dettes fisc/soc", value: posVal(m.dettes_fisc_soc), color: SLICE_COLORS[4] },
        { name: "Autres dettes", value: posVal(m.autres_dettes), color: SLICE_COLORS[5] }
      ].filter((s) => s.value > 0);
    case "va":
      return [
        { name: "Total production", value: posVal(m.total_prod_expl), color: SLICE_COLORS[0] },
        { name: "Achats marchandises", value: posVal(m.achats_march), color: SLICE_COLORS[2] },
        { name: "Achats matières", value: posVal(m.achats_mp), color: SLICE_COLORS[3] },
        { name: "Charges externes", value: posVal(m.ace), color: SLICE_COLORS[4] }
      ].filter((s) => s.value > 0);
    default:
      return [];
  }
}

function posVal(v: number | null): number {
  if (v === null || !Number.isFinite(v)) return 0;
  return Math.abs(v);
}

export function DonutWidget({ kpiId, mappedData }: DonutWidgetProps) {
  const definition = getKpiDefinition(kpiId);
  const slices = buildSlices(kpiId, mappedData);
  const total = slices.reduce((acc, s) => acc + s.value, 0);
  const title = definition?.label ?? kpiId;
  const shortLabel = definition?.shortLabel ?? kpiId;

  return (
    <article className="precision-card fade-up flex h-full flex-col rounded-2xl p-5">
      <header className="mb-3">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
          Répartition · {shortLabel}
        </span>
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </header>

      {slices.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr]">
          <div className="relative h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={80}
                  paddingAngle={2}
                  stroke="rgba(0,0,0,0.4)"
                  strokeWidth={1}
                >
                  {slices.map((s, i) => (
                    <Cell key={`cell-${i}`} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip content={(props) => <DonutTooltip {...props} total={total} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] font-mono uppercase text-white/55">Total</span>
              <span className="tnum text-base font-semibold text-white">{formatCurrency(total)}</span>
            </div>
          </div>

          <ul className="space-y-1.5 self-center">
            {slices.map((s) => {
              const pct = total > 0 ? (s.value / total) * 100 : 0;
              return (
                <li key={s.name} className="flex items-center justify-between gap-3 text-xs">
                  <span className="inline-flex items-center gap-2 text-white/75">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </span>
                  <span className="tnum text-white/65">{pct.toFixed(0)}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
          <p className="max-w-xs text-xs text-white/55">
            Décomposition non disponible pour ce KPI ou données manquantes.
          </p>
        </div>
      )}
    </article>
  );
}

type DonutTooltipPayloadEntry = { value?: number | string; name?: string | number };

function DonutTooltip(props: TooltipContentProps & { total: number }) {
  const { active, payload, total } = props;
  if (!active || !payload || !payload.length) return null;
  const entry = payload[0] as DonutTooltipPayloadEntry;
  const value = typeof entry.value === "number" ? entry.value : null;
  const name = entry.name;
  const pct = total > 0 && value !== null ? (value / total) * 100 : null;
  return (
    <div className="rounded-lg border border-white/15 bg-quantis-base/95 p-3 text-xs text-white/85 shadow-xl backdrop-blur">
      <p className="font-medium text-white">{name}</p>
      <p className="mt-1 tnum text-white/70">
        {value !== null ? formatCurrency(value) : INSUFFICIENT_DATA_LABEL}
        {pct !== null ? ` · ${pct.toFixed(0)}%` : ""}
      </p>
    </div>
  );
}
