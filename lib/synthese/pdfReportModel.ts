import type { SyntheseViewModel } from "@/lib/synthese/syntheseViewModel";
import type { CalculatedKpis, MappedFinancialData } from "@/types/analysis";

export type PdfScoreLevel = "excellent" | "bon" | "fragile" | "critique" | "na";

export type PdfKpiItem = {
  label: string;
  valueLabel: string;
  interpretation: string;
};

export type PdfKpiCard = {
  id: string;
  title: string;
  subtitle: string;
  valueLabel: string;
  trendTone: "positive" | "negative" | "neutral";
  trendLabel: string;
  benchmarkLabel: string;
};

export type PdfScore = {
  value: number | null;
  valueLabel: string;
  level: PdfScoreLevel;
  levelLabel: string;
  description: string;
};

export type PdfReportData = {
  meta: {
    companyName: string;
    periodLabel: string;
    generatedAtLabel: string;
    userName?: string;
    analysisDateLabel?: string;
  };
  cover: {
    scoreValue: number | null;
    scoreValueLabel: string;
    scoreLevel: PdfScoreLevel;
    scoreLevelLabel: string;
    pillars: Array<{
      id: string;
      label: string;
      value: number | null;
      valueLabel: string;
      color: string;
    }>;
  };
  synthese: {
    heroKpis: Array<{ label: string; valueLabel: string }>;
    summaryRows: Array<{ label: string; valueLabel: string }>;
    alerts: Array<{ label: string; severity: "high" | "medium" | "low" }>;
    recommendations: string[];
  };
  score: PdfScore;
  kpis: PdfKpiCard[];
  valueCreation: { items: PdfKpiItem[] };
  investment: { items: PdfKpiItem[] };
  financing: { items: PdfKpiItem[] };
  profitability: {
    items: PdfKpiItem[];
    strengths: string[];
    improvements: string[];
  };
};

export type BuildPdfReportDataInput = {
  companyName: string;
  greetingName: string;
  analysisCreatedAt: string;
  selectedYearLabel: string;
  synthese: SyntheseViewModel;
  kpis?: CalculatedKpis;
  mappedData?: MappedFinancialData;
};

export function buildPdfReportData(input: BuildPdfReportDataInput): PdfReportData {
  const { companyName, selectedYearLabel, synthese, kpis, mappedData } = input;
  const level = resolveScoreLevel(synthese.score);

  return {
    meta: {
      companyName,
      periodLabel: selectedYearLabel,
      generatedAtLabel: formatDateFr(new Date()),
      userName: input.greetingName || undefined,
      analysisDateLabel: input.analysisCreatedAt
        ? formatDateFr(new Date(input.analysisCreatedAt))
        : undefined
    },
    cover: {
      scoreValue: synthese.score,
      scoreValueLabel: synthese.score === null ? "N/D" : `${Math.round(synthese.score)} / 100`,
      scoreLevel: level,
      scoreLevelLabel: scoreLevelLabel(level),
      pillars: [
        buildPillar("rentabilite", "Rentabilité", synthese.scorePiliers?.rentabilite ?? null),
        buildPillar("solvabilite", "Solvabilité", synthese.scorePiliers?.solvabilite ?? null),
        buildPillar("liquidite", "Liquidité", synthese.scorePiliers?.liquidite ?? null),
        buildPillar("efficacite", "Efficacité", synthese.scorePiliers?.efficacite ?? null)
      ]
    },
    score: buildScore(synthese.score),
    synthese: buildSyntheseSection(synthese, kpis, mappedData),
    kpis: buildKpiCards(kpis),
    valueCreation: { items: buildValueCreationItems(kpis) },
    investment: { items: buildInvestmentItems(kpis) },
    financing: { items: buildFinancingItems(kpis) },
    profitability: buildProfitabilitySection(kpis)
  };
}

export function resolveScoreLevel(score: number | null): PdfScoreLevel {
  if (score === null) return "na";
  if (score >= 80) return "excellent";
  if (score >= 60) return "bon";
  if (score >= 40) return "fragile";
  return "critique";
}

function scoreLevelLabel(level: PdfScoreLevel): string {
  const map: Record<PdfScoreLevel, string> = {
    excellent: "Excellent",
    bon: "Bon",
    fragile: "Fragile",
    critique: "Critique",
    na: "N/D"
  };
  return map[level];
}

function buildPillar(id: string, label: string, value: number | null) {
  return {
    id,
    label,
    value,
    valueLabel: value === null ? "N/D" : `${Math.round(value)} / 100`,
    color: pillarColor(value)
  };
}

function pillarColor(value: number | null): string {
  if (value === null) return "#9CA3AF";
  if (value >= 80) return "#10B981";
  if (value >= 60) return "#F59E0B";
  if (value >= 40) return "#F97316";
  return "#EF4444";
}

function buildSyntheseSection(
  synthese: SyntheseViewModel,
  kpis?: CalculatedKpis,
  mappedData?: MappedFinancialData
) {
  const ca = kpis?.ca ?? synthese.metrics.find((m) => m.id === "ca")?.value ?? null;
  const ebe = kpis?.ebe ?? synthese.metrics.find((m) => m.id === "ebe")?.value ?? null;
  const dispo = kpis?.disponibilites ?? synthese.metrics.find((m) => m.id === "cash")?.value ?? null;

  return {
    heroKpis: [
      { label: "Chiffre d'affaires", valueLabel: fmtCurrency(ca) },
      { label: "EBE", valueLabel: fmtCurrency(ebe) },
      { label: "Trésorerie disponible", valueLabel: fmtCurrency(dispo) }
    ],
    summaryRows: [
      { label: "Chiffre d'affaires", valueLabel: fmtCurrency(ca) },
      { label: "Total bilan", valueLabel: fmtCurrency(mappedData?.total_actif ?? null) },
      { label: "Résultat net", valueLabel: fmtCurrency(kpis?.resultat_net ?? null) },
      { label: "Capitaux propres", valueLabel: fmtCurrency(mappedData?.total_cp ?? null) },
      { label: "Dettes totales", valueLabel: fmtCurrency(mappedData?.total_dettes ?? null) }
    ],
    alerts: synthese.alerts.map((a) => ({ label: a.label, severity: a.severity })),
    recommendations: synthese.actions.length ? synthese.actions : ["Aucune recommandation."]
  };
}

function buildScore(score: number | null): PdfScore {
  const level = resolveScoreLevel(score);
  const descriptions: Record<PdfScoreLevel, string> = {
    excellent: "La situation financière est excellente. L'entreprise présente de solides fondamentaux sur l'ensemble des piliers analysés.",
    bon: "La situation financière est bonne. Quelques axes d'amélioration peuvent optimiser la performance.",
    fragile: "La situation financière est fragile. Des vigilances sont à surveiller sur certains indicateurs clés.",
    critique: "La situation financière est critique. Des actions correctrices sont nécessaires dans les meilleurs délais.",
    na: "Données insuffisantes pour établir un score global."
  };
  return {
    value: score,
    valueLabel: score === null ? "N/D" : `${Math.round(score)} / 100`,
    level,
    levelLabel: scoreLevelLabel(level),
    description: descriptions[level]
  };
}

function buildKpiCards(kpis?: CalculatedKpis): PdfKpiCard[] {
  if (!kpis) return [];

  const tone = (v: number | null, good: number, ok: number, invert = false): PdfKpiCard["trendTone"] => {
    if (v === null) return "neutral";
    if (invert) return v <= good ? "positive" : v <= ok ? "neutral" : "negative";
    return v >= good ? "positive" : v >= ok ? "neutral" : "negative";
  };

  return [
    {
      id: "ca",
      title: "Chiffre d'affaires",
      subtitle: "Exercice N",
      valueLabel: fmtCurrency(kpis.ca ?? null),
      trendTone: "neutral",
      trendLabel: "—",
      benchmarkLabel: "Référence sectorielle non disponible"
    },
    {
      id: "marge_ebitda",
      title: "Marge EBITDA",
      subtitle: "Rentabilité opérationnelle",
      valueLabel: fmtPercent(kpis.marge_ebitda ?? null),
      trendTone: tone(kpis.marge_ebitda ?? null, 0.15, 0.05),
      trendLabel: (kpis.marge_ebitda ?? null) === null ? "N/D" : (kpis.marge_ebitda! >= 0.15 ? "Solide" : kpis.marge_ebitda! >= 0.05 ? "Correct" : "Faible"),
      benchmarkLabel: "Seuil PME : > 5 %"
    },
    {
      id: "solvabilite",
      title: "Solvabilité",
      subtitle: "Part CP / total actif",
      valueLabel: fmtPercent(kpis.solvabilite ?? null),
      trendTone: tone(kpis.solvabilite ?? null, 0.30, 0.15),
      trendLabel: (kpis.solvabilite ?? null) === null ? "N/D" : (kpis.solvabilite! >= 0.30 ? "Solide" : kpis.solvabilite! >= 0.15 ? "Correct" : "Fragile"),
      benchmarkLabel: "Seuil recommandé : > 20 %"
    },
    {
      id: "liq_gen",
      title: "Liquidité générale",
      subtitle: "Actif CT / Passif CT",
      valueLabel: fmtRatio(kpis.liq_gen ?? null),
      trendTone: tone(kpis.liq_gen ?? null, 2, 1),
      trendLabel: (kpis.liq_gen ?? null) === null ? "N/D" : (kpis.liq_gen! >= 2 ? "Bonne" : kpis.liq_gen! >= 1 ? "Correcte" : "Risquée"),
      benchmarkLabel: "Ratio cible : > 1"
    }
  ];
}

function buildValueCreationItems(kpis?: CalculatedKpis): PdfKpiItem[] {
  return [
    {
      label: "Valeur Ajoutée (VA)",
      valueLabel: fmtCurrency(kpis?.va ?? null),
      interpretation: "La VA mesure la richesse créée par l'entreprise après déduction des consommations intermédiaires."
    },
    {
      label: "EBITDA",
      valueLabel: fmtCurrency(kpis?.ebitda ?? null),
      interpretation: "L'EBITDA mesure la performance opérationnelle pure, indépendamment de la structure financière."
    },
    {
      label: "Marge EBITDA",
      valueLabel: fmtPercent(kpis?.marge_ebitda ?? null),
      interpretation: "Une marge supérieure à 10% est généralement considérée comme saine."
    },
    {
      label: "Taux de Marge sur Coûts Variables (TMSCV)",
      valueLabel: fmtPercent(kpis?.tmscv ?? null),
      interpretation: "Part du chiffre d'affaires restant après couverture des charges variables."
    },
    {
      label: "Point mort",
      valueLabel: fmtCurrency(kpis?.point_mort ?? null),
      interpretation: "Chiffre d'affaires minimum pour couvrir toutes les charges fixes."
    },
    {
      label: "Résultat net",
      valueLabel: fmtCurrency(kpis?.resultat_net ?? null),
      interpretation: "Bénéfice final après toutes charges, impôts et éléments exceptionnels."
    }
  ];
}

function buildInvestmentItems(kpis?: CalculatedKpis): PdfKpiItem[] {
  return [
    {
      label: "BFR",
      valueLabel: fmtCurrency(kpis?.bfr ?? null),
      interpretation: "Un BFR négatif signifie que vos fournisseurs vous financent — situation favorable."
    },
    {
      label: "Ratio d'immobilisation",
      valueLabel: fmtPercent(kpis?.ratio_immo ?? null),
      interpretation: "Part des actifs immobilisés dans le total de l'actif — mesure l'intensité capitalistique."
    },
    {
      label: "DSO (Rotation clients)",
      valueLabel: fmtDays(kpis?.dso ?? null),
      interpretation: "Nombre de jours moyen pour encaisser vos créances clients."
    },
    {
      label: "DPO (Rotation fournisseurs)",
      valueLabel: fmtDays(kpis?.dpo ?? null),
      interpretation: "Nombre de jours moyen pour régler vos fournisseurs."
    },
    {
      label: "Rotation des stocks",
      valueLabel: fmtDays(kpis?.rot_stocks ?? null),
      interpretation: "Durée moyenne de détention des stocks avant vente ou utilisation."
    },
    {
      label: "Rotation BFR",
      valueLabel: fmtDays(kpis?.rot_bfr ?? null),
      interpretation: "Nombre de jours de chiffre d'affaires immobilisés dans le cycle d'exploitation."
    }
  ];
}

function buildFinancingItems(kpis?: CalculatedKpis): PdfKpiItem[] {
  return [
    {
      label: "CAF",
      valueLabel: fmtCurrency(kpis?.caf ?? null),
      interpretation: "Capacité de l'entreprise à générer des liquidités par son activité."
    },
    {
      label: "Solvabilité",
      valueLabel: fmtPercent(kpis?.solvabilite ?? null),
      interpretation: "Part des actifs financés par les capitaux propres — idéalement > 20%."
    },
    {
      label: "Ratio d'endettement (Gearing)",
      valueLabel: fmtRatio(kpis?.gearing ?? null),
      interpretation: "Rapport entre la dette nette et les capitaux propres."
    },
    {
      label: "Trésorerie nette",
      valueLabel: fmtCurrency(kpis?.tn ?? null),
      interpretation: "Différence entre les disponibilités et les dettes financières court terme."
    },
    {
      label: "Liquidité générale",
      valueLabel: fmtRatio(kpis?.liq_gen ?? null),
      interpretation: "Capacité à faire face aux dettes court terme — idéalement > 1."
    },
    {
      label: "Liquidité réduite",
      valueLabel: fmtRatio(kpis?.liq_red ?? null),
      interpretation: "Comme la liquidité générale mais hors stocks — test plus strict."
    },
    {
      label: "Liquidité immédiate",
      valueLabel: fmtRatio(kpis?.liq_imm ?? null),
      interpretation: "Capacité à couvrir les dettes court terme uniquement avec la trésorerie."
    },
    {
      label: "Capacité de remboursement",
      valueLabel: fmtYears(kpis?.capacite_remboursement_annees ?? null),
      interpretation: "Nombre d'années nécessaires pour rembourser la dette avec la CAF."
    }
  ];
}

function buildProfitabilitySection(kpis?: CalculatedKpis) {
  const roe = kpis?.roe ?? null;
  const roce = kpis?.roce ?? null;
  const spread = roe !== null && roce !== null ? roe - roce : null;

  const items: PdfKpiItem[] = [
    {
      label: "ROE",
      valueLabel: fmtPercent(roe),
      interpretation: "Rentabilité des capitaux propres — mesure l'efficacité du financement actionnaire."
    },
    {
      label: "ROCE",
      valueLabel: fmtPercent(roce),
      interpretation: "Rentabilité du capital employé — mesure l'efficacité de l'outil industriel."
    },
    {
      label: "Effet de levier",
      valueLabel: fmtRatio(kpis?.effet_levier ?? null),
      interpretation: "Amplification de la rentabilité des capitaux propres par l'endettement."
    },
    {
      label: "Spread (ROE - ROCE)",
      valueLabel: fmtPercent(spread),
      interpretation: "Un spread positif indique que l'endettement crée de la valeur pour les actionnaires."
    }
  ];

  return {
    items,
    strengths: buildStrengths(kpis),
    improvements: buildImprovements(kpis)
  };
}

type KpiRating = { label: string; score: number };

function rateKpis(kpis?: CalculatedKpis): KpiRating[] {
  if (!kpis) return [];
  const ratings: KpiRating[] = [];

  const add = (label: string, value: number | null, good: number, ok: number, invert = false) => {
    if (value === null) return;
    let score: number;
    if (invert) {
      score = value <= good ? 90 : value <= ok ? 60 : 30;
    } else {
      score = value >= good ? 90 : value >= ok ? 60 : 30;
    }
    ratings.push({ label, score });
  };

  add("Marge EBITDA", kpis.marge_ebitda, 0.15, 0.05);
  add("Solvabilité", kpis.solvabilite, 0.30, 0.15);
  add("Liquidité générale", kpis.liq_gen, 2, 1);
  add("ROE", kpis.roe, 0.15, 0.05);
  add("ROCE", kpis.roce, 0.12, 0.05);
  add("DSO", kpis.dso, 30, 60, true);
  add("DPO", kpis.dpo, 60, 30);
  add("Gearing", kpis.gearing, 0.5, 1, true);
  add("Capacité de remboursement", kpis.capacite_remboursement_annees, 2, 5, true);
  add("Liquidité immédiate", kpis.liq_imm, 0.5, 0.2);

  return ratings;
}

function buildStrengths(kpis?: CalculatedKpis): string[] {
  const ratings = rateKpis(kpis);
  if (ratings.length === 0) return ["Données insuffisantes pour identifier les points forts."];
  const sorted = [...ratings].sort((a, b) => b.score - a.score);
  return sorted.slice(0, 3).map((r) => r.label);
}

function buildImprovements(kpis?: CalculatedKpis): string[] {
  const ratings = rateKpis(kpis);
  if (ratings.length === 0) return ["Données insuffisantes pour identifier les axes d'amélioration."];
  const sorted = [...ratings].sort((a, b) => a.score - b.score);
  return sorted.slice(0, 3).map((r) => r.label);
}

// --- Formatters ---
// Formatage manuel : Intl.NumberFormat produit des espaces insécables (U+202F)
// que @react-pdf/renderer rend comme "/" ou caractère invalide.

export function fmtCurrency(value: number | null): string {
  if (value === null || value === undefined) return "N/D";
  const formatted = Math.abs(Math.round(value))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return value < 0 ? `- ${formatted} \u20AC` : `${formatted} \u20AC`;
}

export function fmtPercent(value: number | null): string {
  if (value === null || value === undefined) return "N/D";
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  return `${pct.toFixed(2).replace(".", ",")} %`;
}

export function fmtRatio(value: number | null): string {
  if (value === null || value === undefined) return "N/D";
  return `${value.toFixed(2).replace(".", ",")}x`;
}

export function fmtDays(value: number | null): string {
  if (value === null || value === undefined) return "N/D";
  return `${Math.round(value)} jours`;
}

export function fmtYears(value: number | null): string {
  if (value === null || value === undefined) return "N/D";
  return `${value.toFixed(2).replace(".", ",")} an${value >= 2 ? "s" : ""}`;
}

function formatDateFr(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}
