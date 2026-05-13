// File: lib/synthese/syntheseViewModel.ts
// Role: transforme les KPI d'analyse en données de synthèse lisibles (score, tendances, actions, alertes).
import type { CalculatedKpis } from "@/types/analysis";
import { calculateVyzorScore } from "@/lib/vyzorScore";
import { buildKpiTrend, type KpiTrend } from "@/lib/kpi/kpiTrend";
import { buildSectorBenchmark } from "@/lib/synthese/sectorBenchmark";

export type TrendDirection = KpiTrend["direction"];
export type TrendInfo = KpiTrend;

export type SyntheseMetric = {
  id: "ca" | "ebe" | "cash";
  title: string;
  subtitle: string;
  value: number | null;
  status: "good" | "medium" | "risk" | "na";
  missingMessage: string | null;
  benchmarkLabel: string;
  trend: TrendInfo;
};

export type SyntheseAlert = {
  id: string;
  label: string;
  severity: "high" | "medium" | "low";
};

/**
 * Tile fiscal compacte (TVA / IS). `value` à null ⇒ tile non rendue côté
 * dashboard (cf. consigne produit "ne pas afficher si pas calculable").
 */
export type SyntheseFiscalTile = {
  id: "tva_a_payer" | "provision_is";
  title: string;
  label: string;
  value: number | null;
  /** Phrase de bas de tile : moyenne mensuelle ou message de fallback. */
  hint: string;
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
  /** Tiles fiscales — TVA à reverser + provision IS. Null si pas calculable. */
  fiscalTiles: SyntheseFiscalTile[];
  actions: string[];
  alerts: SyntheseAlert[];
};

export function buildSyntheseViewModel(
  currentKpis: CalculatedKpis,
  previousKpis?: CalculatedKpis | null,
  sector?: string | null
): SyntheseViewModel {
  // Le Vyzor Score est recalculé dynamiquement à partir des KPI courants.
  const quantisScore = calculateVyzorScore(currentKpis);

  const metrics: SyntheseMetric[] = [
    {
      id: "ca",
      title: "Chiffre d'affaires",
      subtitle: "Performance commerciale",
      value: currentKpis.ca,
      status: resolveMetricStatus("ca", currentKpis.ca),
      missingMessage:
        currentKpis.ca === null
          ? "Pour visualiser votre chiffre d'affaires, uploader un document complet."
          : null,
      benchmarkLabel: buildSectorBenchmark("ca", currentKpis.ca, sector).label,
      trend: buildTrend(currentKpis.ca, previousKpis?.ca ?? null)
    },
    {
      id: "ebe",
      title: "Rentabilité opérationnelle",
      subtitle: "EBE",
      value: currentKpis.ebe,
      status: resolveMetricStatus("ebe", currentKpis.ebe),
      missingMessage:
        currentKpis.ebe === null
          ? "Pour visualiser votre EBE, uploader un document complet."
          : null,
      benchmarkLabel: buildSectorBenchmark("ebe", currentKpis.ebe, sector).label,
      trend: buildTrend(currentKpis.ebe, previousKpis?.ebe ?? null)
    },
    {
      id: "cash",
      title: "Cash disponible",
      subtitle: "Disponibilités",
      value: currentKpis.disponibilites,
      status: resolveMetricStatus("cash", currentKpis.disponibilites),
      missingMessage:
        currentKpis.disponibilites === null
          ? "Pour visualiser votre cash disponible, uploader un document complet."
          : null,
      benchmarkLabel: buildSectorBenchmark("cash", currentKpis.disponibilites, sector).label,
      trend: buildTrend(currentKpis.disponibilites, previousKpis?.disponibilites ?? null)
    }
  ];

  const alerts: SyntheseAlert[] = [];

  // Les seuils restent simples en MVP pour fournir une lecture immédiate et actionnable.
  if (quantisScore.vyzor_score < 50) {
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
  const fiscalTiles = buildFiscalTiles(currentKpis);

  return {
    score: quantisScore.vyzor_score,
    scoreLabel: resolveScoreLabel(quantisScore.vyzor_score),
    scorePiliers: quantisScore.piliers,
    alerteInvestissement: quantisScore.alerte_investissement,
    metrics,
    fiscalTiles,
    actions,
    alerts
  };
}

/**
 * Construit les 2 tiles fiscales (TVA + IS) destinées au cockpit Synthèse.
 * Règles produit :
 *  - TVA : si tva_a_payer null ⇒ tile complètement omise (les soldes 4456/4457
 *    ne sont disponibles que via les sources accounting avec trial balance).
 *    La valeur est déjà au prorata de la période sélectionnée (cf.
 *    hydrateFiscalKpis dans recomputeKpisForPeriod).
 *  - IS  : si resultat_exercice null ⇒ tile omise. Si ≤ 0 ⇒ tile affichée à 0
 *    avec un hint "Pas d'IS — résultat négatif" (signal explicite, pas un trou).
 */
function buildFiscalTiles(kpis: CalculatedKpis): SyntheseFiscalTile[] {
  const tiles: SyntheseFiscalTile[] = [];

  const tvaToPay = kpis.tva_a_payer;
  if (typeof tvaToPay === "number" && Number.isFinite(tvaToPay)) {
    // Le label TVA s'adapte à l'échelle implicite (montant période vs ~mensuel).
    // Si la valeur courante est proche du mensuel ⇒ on dit "ce mois", sinon
    // on indique le rythme moyen pour ancrer la lecture.
    const monthly = kpis.tva_provision_mensuelle;
    let hint: string;
    if (
      typeof monthly === "number" &&
      Number.isFinite(monthly) &&
      Math.abs(monthly) > 0.5
    ) {
      const ratio = Math.abs(monthly) > 0 ? Math.abs(tvaToPay) / Math.abs(monthly) : 0;
      if (ratio > 0 && ratio < 1.5) {
        hint = `≈ 1 mois — moyenne ${formatEuroCompact(monthly)}/mois`;
      } else if (ratio >= 1.5 && ratio < 4.5) {
        hint = `≈ ${Math.round(ratio)} mois — moyenne ${formatEuroCompact(monthly)}/mois`;
      } else {
        hint = `~${formatEuroCompact(monthly)}/mois en moyenne`;
      }
    } else {
      hint = "À reverser à l'État sur la période";
    }
    tiles.push({
      id: "tva_a_payer",
      title: "TVA à sortir",
      label: "TVA COLLECTÉE − TVA DÉDUCTIBLE",
      value: tvaToPay,
      hint,
    });
  }

  const isProvision = kpis.provision_is;
  // Si la provision est null ⇒ on ne sait pas (résultat manquant). On affiche
  // quand même la tile à 0 si resultat_exercice = 0 (= pas d'IS dû mais
  // calculable) — le test sur null suffit.
  if (typeof isProvision === "number" && Number.isFinite(isProvision)) {
    const isZero = isProvision <= 0;
    const monthly = kpis.provision_is_mensuelle;
    const hint = isZero
      ? "Pas d'IS — résultat négatif"
      : typeof monthly === "number" && Number.isFinite(monthly)
        ? `Mettez ~${formatEuroCompact(monthly)}/mois de côté`
        : "À provisionner mensuellement";
    tiles.push({
      id: "provision_is",
      title: "Impôts à provisionner",
      label: "ESTIMATION IS",
      value: isProvision,
      hint,
    });
  }

  return tiles;
}

/** Format euro compact pour les hints (~1.2 k€, ~24 k€, …). Pas de décimales. */
function formatEuroCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace(".0", "")} M€`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1).replace(".0", "")} k€`;
  return `${sign}${Math.round(abs)} €`;
}

function resolveMetricStatus(
  metricId: SyntheseMetric["id"],
  value: number | null
): SyntheseMetric["status"] {
  if (value === null) {
    return "na";
  }

  if (metricId === "ca") {
    if (value >= 200000) {
      return "good";
    }
    if (value >= 80000) {
      return "medium";
    }
    return "risk";
  }

  if (metricId === "ebe") {
    if (value >= 30000) {
      return "good";
    }
    if (value >= 0) {
      return "medium";
    }
    return "risk";
  }

  if (value >= 50000) {
    return "good";
  }
  if (value >= 0) {
    return "medium";
  }
  return "risk";
}

// Fonction pure de tendance: compare valeur courante et précédente avec gestion des cas limites.
export function buildTrend(current: number | null, previous: number | null): TrendInfo {
  return buildKpiTrend(current, previous);
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
