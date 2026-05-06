"use client";

import type { TooltipContentProps } from "recharts";
import { INSUFFICIENT_DATA_LABEL } from "@/components/dashboard/formatting";
import type { BreakEvenPoint } from "@/lib/dashboard/tabs/valueCreationData";

type BreakEvenTooltipProps = TooltipContentProps & {
  isDark: boolean;
};

export function BreakEvenTooltip({ active, payload, isDark }: BreakEvenTooltipProps) {
  const point = payload?.[0]?.payload as BreakEvenPoint | undefined;

  if (!active || !point) {
    return null;
  }

  const delta = point.ca - point.totalCosts;
  const isProfit = delta >= 0;
  const deltaLabel = isProfit ? "Benefice" : "Perte";
  const panelClass = isDark
    ? "border-white/15 bg-[rgba(8,10,14,0.82)] text-white shadow-2xl"
    : "border-slate-200/80 bg-[rgba(255,255,255,0.88)] text-slate-900 shadow-2xl";
  const deltaClass = isProfit
    ? isDark
      ? "text-emerald-300"
      : "text-emerald-700"
    : isDark
      ? "text-rose-300"
      : "text-rose-700";
  const deltaPillClass = isProfit
    ? isDark
      ? "border-emerald-400/35 bg-emerald-500/12 text-emerald-200"
      : "border-emerald-300 bg-emerald-50 text-emerald-700"
    : isDark
      ? "border-rose-400/35 bg-rose-500/12 text-rose-200"
      : "border-rose-300 bg-rose-50 text-rose-700";

  return (
    <div className={`min-w-[250px] rounded-xl border px-4 py-3 backdrop-blur-md ${panelClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-[11px] font-mono uppercase tracking-[0.18em] ${isDark ? "text-white/45" : "text-slate-500"}`}>
          {point.month}
        </p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${deltaPillClass}`}>
          {deltaLabel}
        </span>
      </div>

      <div className="mt-3 space-y-2 text-sm">
        <TooltipRow color={isDark ? "#f8fafc" : "#0f172a"} label="CA" value={formatCurrencyValue(point.ca)} />
        <TooltipRow
          color={isDark ? "rgba(255,255,255,0.42)" : "rgba(100,116,139,0.82)"}
          label="Couts fixes"
          value={formatCurrencyValue(point.fixedCosts)}
        />
        <TooltipRow color="#C5A059" label="Couts totaux" value={formatCurrencyValue(point.totalCosts)} />

        <div className="mt-2 flex items-center justify-between border-t border-current/10 pt-2">
          <span className="text-xs uppercase tracking-[0.12em] text-current/70">Resultat</span>
          <span className={`text-sm font-semibold ${deltaClass}`}>
            {delta >= 0 ? "+" : "-"}
            {formatCurrencyValue(Math.abs(delta))}
          </span>
        </div>
      </div>
    </div>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
        <span>{label}</span>
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function formatCurrencyValue(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return INSUFFICIENT_DATA_LABEL;
  }

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(value);
}
