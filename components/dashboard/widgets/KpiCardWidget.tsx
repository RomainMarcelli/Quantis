// File: components/dashboard/widgets/KpiCardWidget.tsx
// Role: widget "valeur unique" — adapte KpiCardLayout pour le système de
// dashboards personnalisables. Lit le KPI dans le registre, formate selon
// son `unit`, propage les props standard (kpiId / value / previousValue)
// vers le layout commun.
"use client";

import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatMonths,
  INSUFFICIENT_DATA_LABEL
} from "@/components/dashboard/formatting";
import { KpiCardLayout } from "@/components/kpi/KpiCardLayout";
import { getKpiDefinition, type KpiUnit } from "@/lib/kpi/kpiRegistry";
import type { CalculatedKpis } from "@/types/analysis";

type KpiCardWidgetProps = {
  kpiId: string;
  kpis: CalculatedKpis;
  previousKpis?: CalculatedKpis | null;
  /** Si défini, la carte devient cliquable et affiche un anneau or quand
   *  sélectionnée — utilisée par les onglets dashboard pour piloter le
   *  graphique d'évolution top via clic sur card. */
  onSelect?: () => void;
  isSelected?: boolean;
  /** Mode édition : masque les overlays (tooltip ✨ + indicateur benchmark)
   *  pour ne pas distraire pendant la manipulation drag/resize. */
  isEditing?: boolean;
};

export function KpiCardWidget({ kpiId, kpis, previousKpis, onSelect, isSelected, isEditing }: KpiCardWidgetProps) {
  const definition = getKpiDefinition(kpiId);
  const value = readKpiValue(kpis, kpiId);
  const previousValue = previousKpis ? readKpiValue(previousKpis, kpiId) : null;

  const formatted = formatByUnit(value, definition?.unit ?? "currency");
  const title = definition?.shortLabel ?? kpiId;
  const tag = definition?.label ?? kpiId;

  return (
    <KpiCardLayout
      kpiId={kpiId}
      fullName={tag}
      title={title}
      value={value}
      previousValue={previousValue}
      formattedValue={formatted}
      onSelect={onSelect}
      isSelected={isSelected}
      disableTooltip={isEditing}
    />
  );
}

function readKpiValue(kpis: CalculatedKpis | null | undefined, kpiId: string): number | null {
  if (!kpis) return null;
  const value = (kpis as unknown as Record<string, number | null | undefined>)[kpiId];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatByUnit(value: number | null, unit: KpiUnit): string {
  if (value === null) return INSUFFICIENT_DATA_LABEL;
  switch (unit) {
    case "currency":
      return formatCurrency(value);
    case "percent":
      return formatPercent(value);
    case "days":
      return `${formatNumber(value, 1)} j`;
    case "ratio":
      return formatNumber(value, 2);
    case "score":
      return `${formatNumber(value, 0)} / 100`;
    default:
      // Fallback : si on rencontre une unit "mois" ou autre dans le registre,
      // on tombe sur formatMonths quand c'est cohérent. Sinon nombre simple.
      return unit === ("months" as KpiUnit) ? formatMonths(value) : formatNumber(value);
  }
}
