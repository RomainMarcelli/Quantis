// File: services/reports/buildDashboardReportPayload.ts
// Role: builder du payload mode "dashboard". Le rapport contient :
//   - Cover (commune)
//   - Sommaire dynamique (1 entrée par tableau sélectionné)
//   - Une section par tableau, avec ses widgets sérialisés
//
// Le rendu Python (widgets/registry.py) consomme les widgets sérialisés
// pour produire les KPI tiles, les boîtes de texte, et les placeholders
// pour les charts (rendu graphique à venir).

import type { AnalysisRecord, CalculatedKpis, MappedFinancialData } from "@/types/analysis";
import type { DashboardLayout, WidgetInstance } from "@/types/dashboard";
import type { SyntheseViewModel } from "@/lib/synthese/syntheseViewModel";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import { isKpiAvailable } from "@/lib/kpi/kpiAvailability";
import { getRawVariableDefinition, isRawVariableId } from "@/lib/dashboard/rawVariableCatalog";
import {
  fmtMoney, fmtPercent, fmtRatio, fmtDays,
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
  mappedData: MappedFinancialData | null,
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

  // Widgets riches catégorisés — chaque widget est rendu comme une kpiCard
  // standard avec une valeur principale (le KPI pivot) et une description
  // condensant les métriques secondaires. Visuellement aligné avec les
  // autres tiles, plus de "bullet list" asymétrique.
  if (vizType === "breakEvenChart") {
    const card = buildBreakEvenCard(kpis);
    if (!card) return null;
    return card;
  }
  if (vizType === "bfrCycle") {
    const card = buildBfrCycleCard(kpis);
    if (!card) return null;
    return card;
  }
  if (vizType === "liquidityRatios") {
    const card = buildLiquidityRatiosCard(kpis);
    if (!card) return null;
    return card;
  }
  if (vizType === "roeRoceChart") {
    const card = buildRoeRoceCard(kpis);
    if (!card) return null;
    return card;
  }
  if (vizType === "customChart") {
    const title = widget.customConfig?.title?.trim() || "Graphique personnalisé";
    const seriesCount = widget.customConfig?.series?.length ?? 0;
    return {
      vizType: "lineChart",
      label: title,
      placeholderNote: seriesCount > 0
        ? `Graphique personnalisé (${seriesCount} série${seriesCount > 1 ? "s" : ""}) — visible dans l'application.`
        : "Graphique personnalisé — visible dans l'application.",
    };
  }

  // Variables brutes Bilan / CdR (préfixe `raw:`) : valeur lue dans
  // mappedData via le catalogue, rendue comme une carte KPI standard.
  if (isRawVariableId(kpiId)) {
    const def = getRawVariableDefinition(kpiId);
    if (!def || !mappedData) return null;
    const value = (mappedData as unknown as Record<string, number | null>)[def.field];
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    return {
      vizType: "kpiCard",
      label: def.label,
      valueLabel: fmtMoney(value) ?? "",
      description: def.source === "bilan" ? "Variable du bilan" : "Variable du compte de résultat",
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

  // Widgets graphiques (lineChart, barChart, gauge, donut, comparison,
  // waterfall, evolutionChart) adossés à un KPI réel : rendus comme une
  // kpiCard avec la valeur courante + une note "Évolution / graphique
  // dans l'application". Beaucoup plus propre que le placeholder vide.
  return {
    vizType: "kpiCard",
    label,
    valueLabel: formatKpiValue(kpiId, value),
    description: chartContextNote(vizType, description),
  };
}

function chartContextNote(vizType: string, baseDescription: string): string {
  const visual: Record<string, string> = {
    lineChart: "Évolution",
    barChart: "Histogramme",
    gauge: "Jauge",
    donut: "Décomposition",
    comparison: "Comparaison marché",
    waterfall: "Cascade",
    evolutionChart: "Évolution multi-séries",
  };
  const kind = visual[vizType] ?? "Graphique";
  // On garde la description du registre KPI tronquée + une note discrète
  // que la visualisation est dispo dans l'app. La concaténation reste
  // courte (≤ 200 chars) pour ne pas faire déborder la tile dans le PDF.
  const truncatedBase = baseDescription.length > 130
    ? baseDescription.slice(0, 129).replace(/[,;.\s]+$/, "") + "…"
    : baseDescription;
  return `${truncatedBase} ${kind} dans l'application.`.trim();
}

// ─── Builders kpiCard pour les widgets riches catégorisés ──────────────
// Chaque widget riche concentre 2-4 métriques. On choisit une "valeur
// principale" (le KPI pivot affiché en gros sur l'écran) et on condense
// les autres en description compacte → la tile PDF est uniforme avec les
// kpiCards standards, plutôt qu'une bullet list asymétrique.

type KpiCardData = Extract<DashboardWidgetData, { vizType: "kpiCard" }>;

function buildBreakEvenCard(k: CalculatedKpis): KpiCardData | null {
  if (k.point_mort === null || !Number.isFinite(k.point_mort)) return null;
  const parts: string[] = [];
  if (k.ca !== null && k.point_mort > 0) {
    const ratio = k.ca / k.point_mort;
    parts.push(ratio >= 1
      ? `Dépassé de ${((ratio - 1) * 100).toFixed(0)} %`
      : `Reste ${((1 - ratio) * 100).toFixed(0)} % à atteindre`);
  }
  if (k.tmscv !== null && Number.isFinite(k.tmscv)) {
    const pct = k.tmscv > 1 ? k.tmscv : k.tmscv * 100;
    parts.push(`TMSCV ${fmtPercent(pct, 1)}`);
  }
  return {
    vizType: "kpiCard",
    label: "Seuil de rentabilité",
    valueLabel: fmtMoney(k.point_mort) ?? "",
    description: parts.length > 0
      ? parts.join(" • ")
      : "CA minimum à réaliser pour couvrir toutes les charges.",
  };
}

function buildBfrCycleCard(k: CalculatedKpis): KpiCardData | null {
  if (k.rot_bfr === null || !Number.isFinite(k.rot_bfr)) return null;
  const parts: string[] = [];
  if (k.dso !== null) parts.push(`DSO ${Math.round(k.dso)} j`);
  if (k.rot_stocks !== null) parts.push(`DIO ${Math.round(k.rot_stocks)} j`);
  if (k.dpo !== null) parts.push(`DPO ${Math.round(k.dpo)} j`);
  return {
    vizType: "kpiCard",
    label: "Cycle d'exploitation (rotation BFR)",
    valueLabel: fmtDays(k.rot_bfr) ?? "",
    description: parts.length > 0
      ? parts.join(" • ")
      : "Nombre de jours de CA immobilisés dans le cycle.",
  };
}

function buildLiquidityRatiosCard(k: CalculatedKpis): KpiCardData | null {
  if (k.liq_gen === null || !Number.isFinite(k.liq_gen)) return null;
  const parts: string[] = [];
  if (k.liq_red !== null) parts.push(`Réduite ${fmtRatio(k.liq_red)}`);
  if (k.liq_imm !== null) parts.push(`Immédiate ${fmtRatio(k.liq_imm)}`);
  return {
    vizType: "kpiCard",
    label: "Liquidité générale",
    valueLabel: fmtRatio(k.liq_gen) ?? "",
    description: parts.length > 0
      ? parts.join(" • ")
      : "Capacité à couvrir les dettes court terme.",
  };
}

function buildRoeRoceCard(k: CalculatedKpis): KpiCardData | null {
  const roePct = k.roe !== null && Number.isFinite(k.roe) ? k.roe * 100 : null;
  const rocePct = k.roce !== null && Number.isFinite(k.roce) ? k.roce * 100 : null;
  if (roePct === null) return null;
  const parts: string[] = [];
  if (rocePct !== null) parts.push(`ROCE ${fmtPercent(rocePct, 2)}`);
  if (rocePct !== null) {
    const spread = roePct - rocePct;
    const sign = spread >= 0 ? "+" : "";
    parts.push(`Effet de levier ${sign}${spread.toFixed(2).replace(".", ",")} pts`);
  }
  return {
    vizType: "kpiCard",
    label: "Rentabilité des capitaux propres (ROE)",
    valueLabel: fmtPercent(roePct, 2) ?? "",
    description: parts.length > 0
      ? parts.join(" • ")
      : "Rendement des capitaux investis par les actionnaires.",
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
  const m = analysis.mappedData;
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
  // mappedData passé au serializer pour résoudre les variables brutes
  // (raw:*) et les widgets riches qui en ont besoin.
  const sections: DashboardSection[] = [];
  const ctx = { kpis: k, mappedData: m ?? null, synthese: null, currentAnalysis: analysis };

  for (const d of input.dashboards) {
    const widgets: DashboardWidgetData[] = [];
    for (const w of d.layout.widgets) {
      if (!isKpiAvailable(w.kpiId, ctx)) continue;
      const serialized = serializeWidget(w, k, m ?? null, null);
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
