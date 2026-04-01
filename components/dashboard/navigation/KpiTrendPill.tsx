"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { KpiTrend } from "@/lib/kpi/kpiTrend";

type KpiTrendPillProps = {
  trend: KpiTrend;
  compact?: boolean;
  className?: string;
};

export function KpiTrendPill({ trend, compact = false, className = "" }: KpiTrendPillProps) {
  const toneClass =
    trend.tone === "positive"
      ? "border-emerald-400/35 bg-emerald-500/12 text-emerald-200"
      : trend.tone === "negative"
        ? "border-rose-400/35 bg-rose-500/12 text-rose-200"
        : "border-white/20 bg-white/5 text-white/70";
  const sizeClass = compact
    ? "px-1.5 py-0.5 text-[9px] tracking-[0.07em]"
    : "px-2 py-0.5 text-[10px] tracking-[0.08em]";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-semibold uppercase ${sizeClass} ${toneClass} ${className}`.trim()}
    >
      {trend.direction === "up" ? (
        <ArrowUpRight className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      ) : trend.direction === "down" ? (
        <ArrowDownRight className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      ) : (
        <Minus className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      )}
      <span>{trend.label}</span>
    </span>
  );
}
