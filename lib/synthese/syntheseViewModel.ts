// File: lib/synthese/syntheseViewModel.ts
// Role: transforme les KPI d'analyse en données de synthèse lisibles (score, tendances, actions, alertes).
import type { CalculatedKpis } from "@/types/analysis";
import { calculateQuantisScore } from "@/lib/quantisScore";

export type TrendDirection = "up" | "down" | "flat" | "na";

export type TrendInfo = {
  direction: TrendDirection;
  // Variation en pourcentage vs période précédente (null si non calculable).
  changePercent: number | null;
  // Libellé humain directement affichable dans l'UI.
  label: string;
  tone: "positive" | "negative" | "neutral";
};

export type SyntheseMetric = {
  id: "ca" | "ebe" | "cash";
  title: string;
  subtitle: string;
  value: number | null;
  trend: TrendInfo;
};

export type SyntheseAlert = {
  id: string;
  label: string;
  severity: "high" | "medium" | "low";
};

export type SyntheseViewModel = {
  score: number | null;
  scoreLabel: string;
  scorePiliers: {
    rentabilite: number;
    solvabilite: number;
    liquidite: number;
    efficacite: number;
  } | null;
  alerteInvestissement: boolean;
  metrics: SyntheseMetric[];
  actions: string[];
  alerts: SyntheseAlert[];
};

export function buildSyntheseViewModel(
  currentKpis: CalculatedKpis,
  previousKpis?: CalculatedKpis | null
): SyntheseViewModel {
  // Le Quantis Score est recalculé dynamiquement à partir des KPI courants.
  const quantisScore = calculateQuantisScore(currentKpis);

  const metrics: SyntheseMetric[] = [
    {
      id: "ca",
      title: "Chiffre d'affaires",
      subtitle: "Performance commerciale",
      value: currentKpis.ca,
      trend: buildTrend(currentKpis.ca, previousKpis?.ca ?? null)
    },
    {
      id: "ebe",
      title: "Rentabilité opérationnelle",
      subtitle: "EBE",
      value: currentKpis.ebe,
      trend: buildTrend(currentKpis.ebe, previousKpis?.ebe ?? null)
    },
    {
      id: "cash",
      title: "Cash disponible",
      subtitle: "Disponibilités",
      value: currentKpis.disponibilites,
      trend: buildTrend(currentKpis.disponibilites, previousKpis?.disponibilites ?? null)
    }
  ];

  const alerts: SyntheseAlert[] = [];

  // Les seuils restent simples en MVP pour fournir une lecture immédiate et actionnable.
  if (quantisScore.quantis_score < 50) {
    alerts.push({
      id: "health-critical",
      label: "Score global fragile : renforcer la structure financière court terme.",
      severity: "high"
    });
  }

  if (currentKpis.bfr !== null && currentKpis.bfr > 100000) {
    alerts.push({
      id: "bfr-high",
      label: "BFR élevé : besoin en trésorerie important à financer.",
      severity: "high"
    });
  }

  if (currentKpis.disponibilites !== null && currentKpis.disponibilites < 0) {
    alerts.push({
      id: "cash-low",
      label: "Cash négatif : tension de liquidité immédiate.",
      severity: "high"
    });
  }

  if (currentKpis.ebe !== null && currentKpis.ebe < 0) {
    alerts.push({
      id: "ebe-down",
      label: "EBE négatif : la rentabilité opérationnelle est à redresser.",
      severity: "medium"
    });
  }

  if (quantisScore.alerte_investissement) {
    alerts.push({
      id: "investment-wear",
      label: "Alerte investissement : usure des immobilisations à surveiller.",
      severity: "medium"
    });
  }

  if (!alerts.length) {
    alerts.push({
      id: "no-alert",
      label: "Alerte majeure non détectée sur la période actuelle.",
      severity: "low"
    });
  }

  const actions = buildActions(metrics, alerts);

  return {
    score: quantisScore.quantis_score,
    scoreLabel: resolveScoreLabel(quantisScore.quantis_score),
    scorePiliers: quantisScore.piliers,
    alerteInvestissement: quantisScore.alerte_investissement,
    metrics,
    actions,
    alerts
  };
}

// Fonction pure de tendance: compare valeur courante et précédente avec gestion des cas limites.
export function buildTrend(current: number | null, previous: number | null): TrendInfo {
  if (current === null || previous === null) {
    return {
      direction: "na",
      changePercent: null,
      label: "N/D",
      tone: "neutral"
    };
  }

  if (previous === 0) {
    if (current === 0) {
      return {
        direction: "flat",
        changePercent: 0,
        label: "Stable",
        tone: "neutral"
      };
    }

    return {
      direction: current > 0 ? "up" : "down",
      changePercent: null,
      label: "Base 0",
      tone: current > 0 ? "positive" : "negative"
    };
  }

  const changePercent = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(changePercent) < 0.1) {
    return {
      direction: "flat",
      changePercent: 0,
      label: "Stable",
      tone: "neutral"
    };
  }

  if (changePercent > 0) {
    return {
      direction: "up",
      changePercent,
      label: `+${Math.abs(changePercent).toFixed(1)}%`,
      tone: "positive"
    };
  }

  return {
    direction: "down",
    changePercent,
    label: `-${Math.abs(changePercent).toFixed(1)}%`,
    tone: "negative"
  };
}

function resolveScoreLabel(score: number | null): string {
  if (score === null) {
    return "Santé globale indéterminée";
  }
  if (score > 80) {
    return "Santé globale solide";
  }
  if (score >= 50) {
    return "Santé globale sous surveillance";
  }
  return "Santé globale fragile";
}

function buildActions(metrics: SyntheseMetric[], alerts: SyntheseAlert[]): string[] {
  const actions: string[] = [];

  const cashMetric = metrics.find((metric) => metric.id === "cash");
  const revenueMetric = metrics.find((metric) => metric.id === "ca");

  if (cashMetric?.trend.direction === "down") {
    actions.push("Sécuriser la trésorerie : accélérer le recouvrement client cette semaine.");
  }

  if (revenueMetric?.trend.direction === "down") {
    actions.push("Lancer un plan de relance commerciale ciblé sur les comptes prioritaires.");
  }

  if (alerts.some((alert) => alert.id === "bfr-high")) {
    actions.push("Réduire le BFR : optimiser les stocks et négocier des délais fournisseurs.");
  }

  if (!actions.length) {
    actions.push("Maintenir la trajectoire actuelle et suivre les KPI de manière hebdomadaire.");
    actions.push("Préparer un scénario d'investissement progressif si la tendance se confirme.");
  }

  return actions;
}
