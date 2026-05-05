// File: services/reports/recommendations.ts
// Role: règles déterministes pour produire 3 à 5 recommandations à partir d'une
// analyse. Aucun appel LLM — uniquement des seuils financiers standards.
// Consommé par le rapport PDF (Vyzor financial report) côté serveur.

import type { AnalysisRecord } from "@/types/analysis";

export type RecommendationSeverity = "good" | "warning" | "risk" | "info";

export type Recommendation = {
  id: string;
  severity: RecommendationSeverity;
  title: string;
  detail: string;
};

/**
 * Évalue les KPIs de l'analyse et renvoie les points d'attention déclenchés.
 * Toutes les règles ignorent silencieusement les KPI absents (`null`) — on ne
 * génère pas de "warning fictif" sur des données manquantes.
 */
export function buildRecommendations(analysis: AnalysisRecord): Recommendation[] {
  const out: Recommendation[] = [];
  const k = analysis.kpis;

  // Règle 1 — Résultat net négatif.
  if (typeof k.resultat_net === "number" && k.resultat_net < 0) {
    out.push({
      id: "negative-net-income",
      severity: "risk",
      title: "Résultat net négatif",
      detail:
        "Votre résultat net est négatif sur la période. Analysez vos charges principales (salaires, achats, autres charges externes) pour identifier les leviers d'économie. Une perte structurelle prolongée fragilise les capitaux propres.",
    });
  }

  // Règle 2 — DSO > 45 jours (clients qui paient lentement).
  if (typeof k.dso === "number" && k.dso > 45) {
    out.push({
      id: "high-dso",
      severity: "warning",
      title: `DSO élevé (${Math.round(k.dso)} jours)`,
      detail:
        `Vos clients mettent en moyenne ${Math.round(k.dso)} jours à vous payer (norme PME : 30 à 45 jours). ` +
        "Mettez en place des relances automatiques à J+15 / J+30, et envisagez l'escompte pour paiement anticipé.",
    });
  }

  // Règle 3 — Solvabilité fragile (capitaux propres / total passif < 0.2).
  if (typeof k.solvabilite === "number" && k.solvabilite < 0.2) {
    out.push({
      id: "low-solvency",
      severity: "risk",
      title: "Solvabilité fragile",
      detail:
        `Votre ratio de solvabilité est de ${k.solvabilite.toFixed(2).replace(".", ",")} ` +
        "(seuil de vigilance : 0,20). Vos capitaux propres couvrent peu vos engagements. Renforcez les fonds propres ou réduisez l'endettement avant tout nouvel investissement.",
    });
  }

  // Règle 4 — Concentration top 3 clients > 60 % du CA.
  // Source : granularInsights (présent uniquement pour les sources dynamiques).
  const customers = analysis.granularInsights?.customers;
  if (customers && customers.topByRevenue.length >= 1) {
    const top3Share = customers.topByRevenue.slice(0, 3).reduce((s, c) => s + (c.share ?? 0), 0);
    if (top3Share > 0.6) {
      out.push({
        id: "customer-concentration",
        severity: "warning",
        title: "Forte concentration clients",
        detail:
          `Plus de ${(top3Share * 100).toFixed(0)} % de votre chiffre d'affaires dépend de vos 3 plus gros clients. ` +
          "Cette concentration crée un risque de dépendance — diversifiez votre portefeuille et sécurisez vos contrats.",
      });
    }
  }

  // Règle 5 — BFR en jours > 60.
  if (typeof k.rot_bfr === "number" && k.rot_bfr > 60) {
    out.push({
      id: "high-bfr",
      severity: "warning",
      title: `BFR élevé (${Math.round(k.rot_bfr)} jours)`,
      detail:
        `Votre besoin en fonds de roulement représente ${Math.round(k.rot_bfr)} jours de chiffre d'affaires. ` +
        "Cherchez à réduire les délais clients, à allonger les délais fournisseurs et à ajuster les niveaux de stock pour libérer de la trésorerie.",
    });
  }

  // Règle 6 — Trésorerie nette négative (signal d'alerte simple).
  if (typeof k.tn === "number" && k.tn < 0) {
    out.push({
      id: "negative-treasury",
      severity: "risk",
      title: "Trésorerie nette négative",
      detail:
        "Votre trésorerie nette est négative — vos disponibilités ne couvrent pas vos emprunts à court terme. " +
        "Anticipez vos échéances et envisagez une ligne de crédit court terme pour sécuriser le cycle d'exploitation.",
    });
  }

  // Si on n'a déclenché aucune règle, on émet un message rassurant (mais pas plus de 5 au total).
  if (out.length === 0) {
    out.push({
      id: "no-alert",
      severity: "good",
      title: "Aucune alerte majeure détectée",
      detail:
        "Sur la période analysée, aucun de nos seuils de vigilance (résultat net, DSO, solvabilité, BFR, trésorerie) n'a été franchi. Continuez de suivre régulièrement vos indicateurs.",
    });
  }

  // Limite haute à 5 selon la spec (priorité : risk > warning > info).
  const severityRank: Record<RecommendationSeverity, number> = {
    risk: 0, warning: 1, info: 2, good: 3,
  };
  return out
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .slice(0, 5);
}
