// Helpers pour déterminer la plage de dates effectivement couverte par une
// analyse (selon son `dailyAccounting`) et savoir si la TemporalityBar doit
// rester affichée. Utilisé par SyntheseView + AnalysisDetailView.

import type { AnalysisRecord } from "@/types/analysis";

export type AvailableRange = { minDate: string; maxDate: string };

/**
 * Retourne la plage [min, max] des dates trouvées dans `dailyAccounting`.
 * Renvoie null si l'analyse n'a pas de données journalières (source statique
 * pure ou sync sans entries dans la fenêtre).
 */
export function computeAvailableRange(analysis: AnalysisRecord): AvailableRange | null {
  const daily = analysis.dailyAccounting ?? [];
  if (daily.length === 0) return null;

  let min = daily[0]!.date;
  let max = daily[0]!.date;
  for (let i = 1; i < daily.length; i++) {
    const d = daily[i]!.date;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { minDate: min, maxDate: max };
}

/**
 * Décide si la TemporalityBar doit s'afficher pour une analyse donnée.
 * Règle : on affiche la barre uniquement quand on a un `dailyAccounting`
 * exploitable. Une source statique (PDF/Excel sans daily) n'a qu'un jeu
 * annuel — pas de granularité temporelle à proposer.
 */
export function shouldShowTemporalityBar(analysis: AnalysisRecord | null): boolean {
  if (!analysis) return false;
  const daily = analysis.dailyAccounting ?? [];
  return daily.length > 0;
}
