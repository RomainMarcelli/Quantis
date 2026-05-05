// Helper qui détermine le diagnostic d'un KPI à partir de sa valeur courante
// et des seuils définis dans le registre. Sert au tooltip pour choisir entre
// le `goodSign` (en vert) ou le `badSign` (en rouge), et au front pour la
// couleur de la valeur affichée.
//
// Subtilité : selon le KPI, "plus grand = mieux" (CA, EBITDA) ou "plus petit
// = mieux" (DSO, gearing). On lit le sens des seuils :
//   - thresholds.danger ≤ thresholds.warning ≤ thresholds.good  → ascendant (CA)
//   - thresholds.good ≤ thresholds.warning ≤ thresholds.danger  → descendant (DSO)

import type { KpiDefinition, KpiThresholds } from "@/lib/kpi/kpiRegistry";

export type KpiDiagnostic = "good" | "warning" | "danger" | "neutral";

/**
 * Renvoie le diagnostic d'une valeur par rapport aux seuils du KPI.
 * Retourne 'neutral' si pas de seuils définis ou valeur null.
 */
export function getKpiDiagnostic(
  value: number | null | undefined,
  thresholds: KpiThresholds | undefined
): KpiDiagnostic {
  if (value === null || value === undefined || !Number.isFinite(value)) return "neutral";
  if (!thresholds) return "neutral";

  const { danger, warning, good } = thresholds;

  // Sens des seuils : si tous fournis, on regarde l'ordre.
  if (danger !== undefined && warning !== undefined && good !== undefined) {
    const ascending = danger <= warning && warning <= good;
    if (ascending) {
      // "Plus grand = mieux" — ex. CA, EBITDA, marge_ebitda
      if (value >= good) return "good";
      if (value <= danger) return "danger";
      if (value >= warning) return "warning"; // entre warning et good = bonne zone basse
      return "danger"; // entre danger et warning = zone à risque
    }
    // "Plus petit = mieux" — ex. DSO, gearing
    if (value <= good) return "good";
    if (value >= danger) return "danger";
    if (value <= warning) return "warning";
    return "danger";
  }

  // Seuils partiels (souvent juste `danger: 0` pour des KPIs comme EBITDA, CAF).
  if (danger !== undefined && value < danger) return "danger";
  if (good !== undefined && value >= good) return "good";

  return "neutral";
}

/**
 * Helper pour les composants : retourne la classe Tailwind de couleur
 * correspondant au diagnostic.
 */
export function getDiagnosticColorClass(diag: KpiDiagnostic): string {
  switch (diag) {
    case "good":
      return "text-emerald-400";
    case "warning":
      return "text-amber-400";
    case "danger":
      return "text-rose-400";
    default:
      return "text-white/70";
  }
}

/**
 * Détermine quelle question suggérée afficher selon le diagnostic. 'good' →
 * whenGood ; sinon → whenBad. La distinction "warning" vs "danger" est masquée
 * pour rester simple — les deux mènent à la même question.
 */
export function pickSuggestedQuestion(
  definition: Pick<KpiDefinition, "suggestedQuestions">,
  diagnostic: KpiDiagnostic
): string {
  return diagnostic === "good"
    ? definition.suggestedQuestions.whenGood
    : definition.suggestedQuestions.whenBad;
}

/**
 * Détermine si le KPI suit la convention "plus grand = mieux".
 * Renvoie :
 *   - true  : croissance favorable (CA, EBITDA, marge…)
 *   - false : décroissance favorable (DSO, gearing, BFR jours, runway burn…)
 *   - null  : indéterminable (seuils manquants / partiels — on ne peut pas
 *     conclure sans risque).
 *
 * Utilisé par les cartes KPI pour choisir la couleur de la variation
 * période vs période précédente (vert si la variation va dans le bon sens).
 */
export function isHigherBetter(thresholds: KpiThresholds | undefined): boolean | null {
  if (!thresholds) return null;
  const { danger, warning, good } = thresholds;
  if (danger !== undefined && warning !== undefined && good !== undefined) {
    return danger <= warning && warning <= good;
  }
  // Seuils partiels — on déduit du couple disponible quand c'est non-ambigu.
  if (danger !== undefined && good !== undefined) return danger < good;
  if (good !== undefined && warning !== undefined) return warning < good;
  return null;
}
