// File: lib/synthese/pdfReportModel.ts
// Role: mappe la synthèse applicative vers un modèle de rapport PDF lisible et stable.

import type { SyntheseViewModel } from "@/lib/synthese/syntheseViewModel";

export type PdfScoreLevel = "excellent" | "bon" | "fragile" | "critique" | "na";

export type PdfReportData = {
  meta: {
    companyName: string;
    userName: string;
    analysisDateLabel: string;
    generatedAtLabel: string;
    periodLabel: string;
  };
  score: {
    value: number | null;
    valueLabel: string;
    level: PdfScoreLevel;
    levelLabel: string;
    description: string;
  };
  pillars: Array<{
    id: "rentabilite" | "solvabilite" | "liquidite" | "efficacite";
    label: string;
    value: number | null;
    valueLabel: string;
    color: string;
  }>;
  kpis: Array<{
    id: string;
    title: string;
    subtitle: string;
    valueLabel: string;
    trendLabel: string;
    trendTone: "positive" | "negative" | "neutral";
    benchmarkLabel: string;
  }>;
  recommendations: string[];
  alerts: Array<{
    label: string;
    severity: "high" | "medium" | "low";
  }>;
};

type BuildPdfReportDataInput = {
  companyName: string;
  greetingName: string;
  analysisCreatedAt: string;
  selectedYearLabel: string;
  synthese: SyntheseViewModel;
};

// Mapping unique: on centralise ici la transformation du modèle métier vers le modèle document.
export function buildPdfReportData({
  companyName,
  greetingName,
  analysisCreatedAt,
  selectedYearLabel,
  synthese
}: BuildPdfReportDataInput): PdfReportData {
  const level = resolveScoreLevel(synthese.score);

  return {
    meta: {
      companyName,
      userName: greetingName,
      analysisDateLabel: toDateLabel(analysisCreatedAt),
      generatedAtLabel: toDateLabel(new Date().toISOString()),
      periodLabel: selectedYearLabel
    },
    score: {
      value: synthese.score,
      valueLabel: synthese.score === null ? "N/A" : `${Math.round(synthese.score)} / 100`,
      level,
      levelLabel: scoreLevelLabel(level),
      description: scoreDescription(level, synthese.alerts.length)
    },
    pillars: [
      buildPillar("rentabilite", "Rentabilité", synthese.scorePiliers?.rentabilite ?? null),
      buildPillar("solvabilite", "Solvabilité", synthese.scorePiliers?.solvabilite ?? null),
      buildPillar("liquidite", "Liquidité", synthese.scorePiliers?.liquidite ?? null),
      buildPillar("efficacite", "Efficacité", synthese.scorePiliers?.efficacite ?? null)
    ],
    kpis: synthese.metrics.map((metric) => ({
      id: metric.id,
      title: metric.title,
      subtitle: metric.subtitle,
      valueLabel: formatCurrency(metric.value),
      trendLabel: metric.trend.label || "N/A",
      trendTone: metric.trend.tone,
      benchmarkLabel: metric.benchmarkLabel || "N/A"
    })),
    recommendations: synthese.actions.length ? synthese.actions : ["N/A"],
    alerts: synthese.alerts.length
      ? synthese.alerts.map((alert) => ({ label: alert.label, severity: alert.severity }))
      : [{ label: "Aucune alerte active.", severity: "low" }]
  };
}

export function resolveScoreLevel(score: number | null): PdfScoreLevel {
  if (score === null) {
    return "na";
  }
  if (score >= 80) {
    return "excellent";
  }
  if (score >= 65) {
    return "bon";
  }
  if (score >= 50) {
    return "fragile";
  }
  return "critique";
}

function scoreLevelLabel(level: PdfScoreLevel): string {
  if (level === "excellent") {
    return "Excellent";
  }
  if (level === "bon") {
    return "Bon";
  }
  if (level === "fragile") {
    return "Fragile";
  }
  if (level === "critique") {
    return "Critique";
  }
  return "N/A";
}

function scoreDescription(level: PdfScoreLevel, alertsCount: number): string {
  if (level === "excellent") {
    return `Structure financière solide. ${alertsCount} alerte(s) à surveiller.`;
  }
  if (level === "bon") {
    return `Performance satisfaisante avec des optimisations ciblées à mener (${alertsCount} alerte(s)).`;
  }
  if (level === "fragile") {
    return `Équilibre sensible. Prioriser les actions de trésorerie et de rentabilité (${alertsCount} alerte(s)).`;
  }
  if (level === "critique") {
    return "Risque élevé. Un plan d'action immédiat est recommandé sur la trésorerie et la rentabilité.";
  }
  return "Score indisponible. Complétez les données pour générer une lecture fiable.";
}

function buildPillar(
  id: PdfReportData["pillars"][number]["id"],
  label: string,
  value: number | null
): PdfReportData["pillars"][number] {
  return {
    id,
    label,
    value,
    valueLabel: value === null ? "N/A" : `${formatNumber(value)} / 100`,
    color: pillarColorHex(value)
  };
}

function pillarColorHex(value: number | null): string {
  if (value === null) {
    return "#A1A1AA";
  }
  if (value >= 80) {
    return "#22C55E";
  }
  if (value >= 50) {
    return "#F59E0B";
  }
  return "#F43F5E";
}

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "N/A";
  }
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value);
}

function toDateLabel(isoLike: string): string {
  const date = new Date(isoLike);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }
  return date.toLocaleString("fr-FR");
}

