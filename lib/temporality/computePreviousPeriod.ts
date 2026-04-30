// File: lib/temporality/computePreviousPeriod.ts
// Role: calcule la période précédente "de même durée" pour comparer un
// KPI sur la période courante vs celle d'avant.
//
// Convention :
//   - Entrée : `periodStart` / `periodEnd` au format ISO YYYY-MM-DD
//     (aligné sur `recomputeKpisForPeriod`).
//   - Sortie : { periodStart, periodEnd } de la période juste antérieure,
//     bornes incluses, de durée identique en jours.
//
// Pour les bascules calendaires courantes :
//   - Mois (M)        : avril 2026 → mars 2026
//   - Trimestre (T)   : Q2 2026   → Q1 2026
//   - Année (Y)       : 2026      → 2025
//   - Semaine (S)     : semaine 17 → semaine 16
//   - Période custom  : duration jours → mêmes N jours juste avant
//
// L'algorithme est duration-based : on calcule N = (end - start) en jours,
// puis on retourne [start - N - 1j ; start - 1j]. C'est la même logique
// que le pattern "Compare to previous period" de Mixpanel / Amplitude /
// Google Analytics — robuste pour toutes les granularités sans cas
// particuliers calendaires.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Période précédente de même durée. Renvoie null si les bornes d'entrée
 * sont invalides (parse échoué ou end < start).
 */
export function computePreviousPeriod(
  periodStart: string,
  periodEnd: string
): { periodStart: string; periodEnd: string } | null {
  const start = parseIsoDate(periodStart);
  const end = parseIsoDate(periodEnd);
  if (start === null || end === null) return null;
  if (end < start) return null;

  // Durée incluant les bornes (ex. 2026-01-01 → 2026-01-31 = 31 jours).
  const durationDays = Math.round((end - start) / MS_PER_DAY) + 1;

  // prevEnd = start - 1 jour ; prevStart = prevEnd - duration + 1.
  const prevEnd = start - MS_PER_DAY;
  const prevStart = prevEnd - (durationDays - 1) * MS_PER_DAY;

  return {
    periodStart: toIsoDate(prevStart),
    periodEnd: toIsoDate(prevEnd),
  };
}

function parseIsoDate(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const ms = Date.parse(`${iso}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
