// File: components/dashboard/KPIBlock.tsx
// Role: carte KPI standard du cockpit Synthèse. Délègue la mise en page
// au composant partagé `KpiCardLayout` (header uppercase + titre vulgarisé
// + valeur + variation conditionnelle + badge de statut).
//
// Convention props héritée du legacy (`title` = vulgarisé, `tag` = nom
// officiel) — préservée pour ne pas casser les call-sites existants. Les
// props désormais inutiles (`icon`, `trendValue`, `trendLabel`, `sideLabel`)
// sont conservées dans la signature avec un commentaire pour permettre une
// suppression progressive.
"use client";

import type { ReactNode } from "react";
import {
  formatCurrency,
  formatMonths,
  formatPercent,
  INSUFFICIENT_DATA_LABEL,
} from "@/components/dashboard/formatting";
import { useAnimatedNumber } from "@/components/dashboard/useAnimatedNumber";
import { KpiCardLayout } from "@/components/kpi/KpiCardLayout";

type KPIBlockFormat = "currency" | "percent";

type KPIBlockProps = {
  /** Titre vulgarisé (ex. "Ce qui rentre"). Rendu sur la ligne 2. */
  title: string;
  /** Nom officiel (ex. "Chiffre d'Affaires"). Rendu uppercase sur la ligne 1. */
  tag: string;
  value: number | null;
  format: KPIBlockFormat;
  /**
   * Valeur du même KPI sur la période précédente. Activée par le parent
   * (SyntheseView / AnalysisDetailView) qui calcule `previousKpis` via
   * `recomputeKpisForPeriod` sur la période antérieure.
   */
  previousValue?: number | null;
  searchId?: string;
  /** id du KPI dans le registre — déclenche tooltip + diagnostic + badge. */
  kpiId?: string;
  /**
   * Props legacy conservées dans la signature pour compatibilité — plus
   * rendues. Le KpiTooltip ✨ et le badge de statut couvrent les besoins.
   */
  icon?: ReactNode;
  trendValue?: number | null;
  trendLabel?: string;
  sideLabel?: string;
};

export function KPIBlock({
  title,
  tag,
  value,
  format,
  previousValue,
  searchId,
  kpiId,
}: KPIBlockProps) {
  // Le compteur anime uniquement la valeur principale.
  const animatedValue = useAnimatedNumber(value, { durationMs: 1200 });

  return (
    <KpiCardLayout
      kpiId={kpiId}
      fullName={tag}
      title={title}
      value={value}
      previousValue={previousValue}
      formattedValue={formatKpiValue(animatedValue, value, format)}
      searchId={searchId}
    />
  );
}

function formatKpiValue(
  animatedValue: number,
  originalValue: number | null,
  format: KPIBlockFormat
): string {
  if (originalValue === null) return INSUFFICIENT_DATA_LABEL;
  if (format === "currency") return formatCurrency(animatedValue);
  return formatPercent(animatedValue);
}

// Helper exposé pour d'autres cartes qui souhaitent afficher un runway.
export function formatRunwayLabel(value: number | null): string {
  return formatMonths(value);
}
