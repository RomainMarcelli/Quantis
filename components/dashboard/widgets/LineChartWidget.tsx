// File: components/dashboard/widgets/LineChartWidget.tsx
// Role: widget "évolution temporelle" — wrappe KpiEvolutionChart pour le
// système de dashboards personnalisables. Le KPI tracé est figé sur le
// `kpiId` du widget (pas de sélection runtime comme dans le chart top des
// onglets dashboard).
"use client";

import { KpiEvolutionChart } from "@/components/synthese/KpiEvolutionChart";
import type { AnalysisRecord } from "@/types/analysis";

type LineChartWidgetProps = {
  kpiId: string;
  analyses: AnalysisRecord[];
  currentAnalysis: AnalysisRecord | null;
};

export function LineChartWidget({ kpiId, analyses, currentAnalysis }: LineChartWidgetProps) {
  return (
    <KpiEvolutionChart
      kpiId={kpiId}
      analyses={analyses}
      currentAnalysis={currentAnalysis}
    />
  );
}
