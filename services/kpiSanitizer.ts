// Garde-fou contre les valeurs aberrantes dans `MappedFinancialData`.
//
// Contexte : le parser PDF v1 produit parfois des nombres absurdes (ex. stocks
// à 6,57 × 10²⁶ €, salaires à 18 × 10¹² €) quand il interprète mal des colonnes
// concaténées ou un séparateur de milliers. Ces valeurs polluent ensuite tous
// les KPI et le score de santé.
//
// Règle simple : aucune PME française n'a un poste comptable supérieur à
// 1 000 milliards d'euros. On capte tout ce qui dépasse ±10¹² en valeur
// absolue, on le remplace par null, et on remonte un warning.
//
// Volontairement passif : on ne tente PAS de "corriger" la valeur (diviser par
// 10, etc.) — ça masquerait le vrai problème de parsing. Mieux vaut une donnée
// manquante qu'une donnée fausse.

import type { MappedFinancialData } from "@/types/analysis";

export const ABERRANT_VALUE_THRESHOLD = 1_000_000_000_000; // 10^12 € = 1 000 milliards

export type SanitizationWarning = {
  field: keyof MappedFinancialData;
  rejectedValue: number;
  reason: "exceeds_threshold" | "non_finite";
};

export type SanitizationResult = {
  sanitized: MappedFinancialData;
  warnings: SanitizationWarning[];
};

/**
 * Remplace par `null` toute valeur numérique dont la magnitude dépasse 10¹² €
 * ou qui n'est pas finie. Retourne l'objet nettoyé + la liste des champs
 * écartés (utile pour journaliser et pour les garde-fous en aval — par
 * exemple le `healthScore` qui doit savoir si le parsing a foiré).
 */
export function sanitizeMappedData(data: MappedFinancialData): SanitizationResult {
  const warnings: SanitizationWarning[] = [];
  const sanitized = { ...data } as Record<string, unknown>;

  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== "number") continue;
    if (!Number.isFinite(value)) {
      warnings.push({
        field: key as keyof MappedFinancialData,
        rejectedValue: value,
        reason: "non_finite",
      });
      sanitized[key] = null;
      continue;
    }
    if (Math.abs(value) > ABERRANT_VALUE_THRESHOLD) {
      warnings.push({
        field: key as keyof MappedFinancialData,
        rejectedValue: value,
        reason: "exceeds_threshold",
      });
      sanitized[key] = null;
    }
  }

  return { sanitized: sanitized as MappedFinancialData, warnings };
}
