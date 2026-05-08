// File: services/reports/buildDashboardReportPayload.ts
// Role: builder du payload mode "dashboard". Le rapport contient :
//   - Cover (commune)
//   - Sommaire dynamique (1 entrée par tableau sélectionné)
//   - Une section par tableau, avec ses widgets sérialisés
//
// Le rendu Python (widgets/registry.py) consomme les widgets sérialisés
// pour produire les KPI tiles, les boîtes de texte, et les placeholders
// pour les charts (rendu graphique à venir).

import type { AnalysisRecord, CalculatedKpis } from "@/types/analysis";
import type { DashboardLayout, WidgetInstance } from "@/types/dashboard";
import type { SyntheseViewModel } from "@/lib/synthese/syntheseViewModel";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import { isKpiAvailable } from "@/lib/kpi/kpiAvailability";
import {
  fmtMoney, fmtPercent, fmtRatio, fmtDays, fmtYears,
  type CompanyInfo,
} from "@/services/reports/buildSyntheseReportPayload";

// ─── Types du payload ──────────────────────────────────────────────────────

export type DashboardWidgetData =
  | {
      vizType: "kpiCard";
      label: string;
      valueLabel: string;
      description: string;
    }
  | {
      vizType: "quantisScore";
      label: string;
      score: number | null;
      scoreLabel: string;
    }
  | {
      vizType: "aiInsight" | "alertList" | "actionList";
      label: string;
      items: string[];
    }
  | {
      vizType: "evolutionChart" | "lineChart" | "barChart" | "donut" | "comparison" | "waterfall" | "gauge";
      label: string;
      placeholderNote: string;
    };

export type DashboardSection = {
  title: string;
  description?: string;
  widgets: DashboardWidgetData[];
};

export type DashboardReportPayload = {
  mode: "dashboard";
  companyName: string;
  reportDate: string;
  reportTitle: string;
  periodLabel: string;
  periodEndLabel: string;
  logoPath: string;
  source: { kind: "dynamic" | "static"; providerLabel: string };
  companyInfo: CompanyInfo;
  toc: Array<{ num: number; title: string; description: string; page: number }>;
  tocGroups: Array<{ title: string; description: string }>;
  dashboards: DashboardSection[];
};

// ─── Helpers de formatage par unité KPI ────────────────────────────────────

function formatKpiValue(kpiId: string, value: number | null): string {
  const def = getKpiDefinition(kpiId);
  const unit = def?.unit ?? "currency";
  if (value === null) return "";
  if (unit === "currency") return fmtMoney(value) ?? "";
  if (unit === "percent") return fmtPercent(value) ?? "";
  if (unit === "ratio" || unit === "score") return fmtRatio(value) ?? "";
  if (unit === "days") return fmtDays(value) ?? "";
  return fmtMoney(value) ?? "";
}

function kpiLabelAndDescription(kpiId: string): { label: string; description: string } {
  const def = getKpiDefinition(kpiId);
  return {
    label: def?.label ?? kpiId,
    description: def?.tooltip?.explanation ?? def?.formula ?? "",
  };
}

// ─── Sérialisation widget → DashboardWidgetData ────────────────────────────

function serializeWidget(
  widget: WidgetInstance,
  kpis: CalculatedKpis,
  synthese: SyntheseViewModel | null,
): DashboardWidgetData | null {
  const { vizType, kpiId } = widget;

  // Widgets contextuels synthèse.
  if (kpiId === "synthese:score") {
    if (!synthese) return null;
    return {
      vizType: "quantisScore",
      label: "Vyzor Score",
      score: synthese.score,
      scoreLabel: synthese.scoreLabel,
    };
  }
  if (kpiId === "synthese:recommendation" || kpiId === "synthese:actions") {
    if (!synthese?.actions?.length) return null;
    return {
      vizType: kpiId === "synthese:recommendation" ? "aiInsight" : "actionList",
      label: kpiId === "synthese:recommendation" ? "Recommandation Vyzor" : "Plan d'action",
      items: synthese.actions,
    };
  }
  if (kpiId === "synthese:alerts") {
    if (!synthese?.alerts?.length) return null;
    return {
      vizType: "alertList",
      label: "Alertes",
      items: synthese.alerts.map((a) => a.label),
    };
  }
  if (kpiId === "synthese:evolution") {
    return {
      vizType: "evolutionChart",
      label: "Performance financière",
      placeholderNote: "Évolution multi-séries (CA, EBE, Résultat net) — disponible dans l'application.",
    };
  }

  // Widgets KPI standards.
  const value = (kpis as unknown as Record<string, number | null>)[kpiId];
  if (value === null || value === undefined || !Number.isFinite(value)) return null;

  const { label, description } = kpiLabelAndDescription(kpiId);

  if (vizType === "kpiCard") {
    return {
      vizType: "kpiCard",
      label,
      valueLabel: formatKpiValue(kpiId, value),
      description,
    };
  }

  // Charts → placeholder pour V1 (rendu graphique à venir).
  // On caste explicitement le vizType vers le sous-ensemble graphique.
  type ChartVizType = Extract<
    DashboardWidgetData,
    { vizType: "evolutionChart" | "lineChart" | "barChart" | "donut" | "comparison" | "waterfall" | "gauge" }
  >["vizType"];
  const allowedChartTypes: readonly ChartVizType[] = [
    "evolutionChart", "lineChart", "barChart", "donut", "comparison", "waterfall", "gauge",
  ];
  const chartViz = (allowedChartTypes as readonly string[]).includes(vizType)
    ? (vizType as ChartVizType)
    : "lineChart";
  return {
    vizType: chartViz,
    label,
    placeholderNote: `Visualisation ${vizType} — graphique disponible dans l'application.`,
  };
}

// ─── Build entry point ─────────────────────────────────────────────────────

export type DashboardReportInput = {
  /** Tableaux à inclure, dans l'ordre de présentation. */
  dashboards: Array<{
    layout: DashboardLayout;
    title: string;
    description?: string;
  }>;
};

export type DashboardReportOptions = {
  companyName: string;
  logoPath: string;
  reportDate?: string;
  reportTitle?: string;
  companyInfo?: CompanyInfo;
};

export function buildDashboardReportPayload(
  analysis: AnalysisRecord,
  input: DashboardReportInput,
  options: DashboardReportOptions,
): DashboardReportPayload {
  const k = analysis.kpis;
  const meta = analysis.sourceMetadata;

  const reportDate = options.reportDate ||
    new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const reportTitle = options.reportTitle || "Rapport tableau de bord";

  let periodLabel = analysis.fiscalYear ? `Exercice ${analysis.fiscalYear}` : "—";
  let periodEndLabel = "";
  if (meta?.periodStart && meta?.periodEnd) {
    const start = new Date(meta.periodStart);
    const end = new Date(meta.periodEnd);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const fmt = (d: Date) => d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
      periodLabel = `${fmt(start)} — ${fmt(end)}`;
      periodEndLabel = end.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
    }
  }

  const PROVIDER_LABELS: Record<string, string> = {
    pennylane: "Pennylane (sync automatique)",
    myunisoft: "MyUnisoft (sync automatique)",
    odoo: "Odoo (sync automatique)",
    fec: "Import FEC",
    upload: "Upload PDF",
  };
  const providerKey = meta?.provider ?? "upload";
  const providerLabel = PROVIDER_LABELS[providerKey] ?? "Source non identifiée";

  // Construction des sections — on filtre les widgets sans data au passage
  // (doctrine "zéro N/D"), MAIS on garde toujours la section dans le rapport
  // si l'utilisateur l'a sélectionnée. Une section sans widget exploitable
  // reste imprimée avec son titre + un message "aucun widget exportable".
  const sections: DashboardSection[] = [];
  const ctx = { kpis: k, synthese: null, currentAnalysis: analysis };

  for (const d of input.dashboards) {
    const widgets: DashboardWidgetData[] = [];
    for (const w of d.layout.widgets) {
      if (!isKpiAvailable(w.kpiId, ctx)) continue;
      const serialized = serializeWidget(w, k, null);
      if (serialized) widgets.push(serialized);
    }
    sections.push({ title: d.title, description: d.description, widgets });
  }

  // Sommaire dynamique : 1 entrée par section retenue. Pages commencent à 3
  // (cover=1, toc=2). Chaque section consomme au moins 1 page ; on suppose
  // 1 page par section pour le V1 (Python ajustera dynamiquement si overflow).
  const toc = sections.map((s, i) => ({
    num: i + 1,
    title: s.title,
    description: s.description ?? "",
    page: 3 + i,
  }));

  return {
    mode: "dashboard",
    companyName: options.companyName,
    reportDate,
    reportTitle,
    periodLabel,
    periodEndLabel,
    logoPath: options.logoPath,
    source: { kind: meta?.type === "dynamic" ? "dynamic" : "static", providerLabel },
    companyInfo: options.companyInfo ?? {},
    toc,
    tocGroups: [],
    dashboards: sections,
  };
}
