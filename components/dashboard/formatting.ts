// File: components/dashboard/formatting.ts
// Role: centralise les helpers de formatage (EUR, %, nombres, mois) utilises par les composants dashboard.

/**
 * Label affiché à la place d'une valeur KPI absente (null). Remplace l'ancien
 * "N/D" pour signifier explicitement à l'utilisateur que le parsing/calcul
 * n'a pas produit de résultat — au lieu de laisser penser que la valeur est
 * vraiment indisponible. Centralisé pour éviter la dérive de wording entre
 * tuiles, tooltips et cartes de score.
 */
export const INSUFFICIENT_DATA_LABEL = "Données insuffisantes";

// Helper centralise pour formater les devises en EUR de maniere consistente.
export function formatCurrency(value: number | null): string {
  if (value === null) {
    return INSUFFICIENT_DATA_LABEL;
  }

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(value);
}

// Helper pour les pourcentages; accepte les ratios (0.12) ou les valeurs deja en %.
export function formatPercent(value: number | null, digits: number = 1): string {
  if (value === null) {
    return INSUFFICIENT_DATA_LABEL;
  }

  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${normalized.toFixed(digits)}%`;
}

// Helper compact pour les nombres simples avec separateur FR.
export function formatNumber(value: number | null, digits: number = 1): string {
  if (value === null) {
    return INSUFFICIENT_DATA_LABEL;
  }

  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: digits
  }).format(value);
}

// Helper metier dedie runway (en mois).
export function formatMonths(value: number | null): string {
  if (value === null) {
    return INSUFFICIENT_DATA_LABEL;
  }

  return `${value.toFixed(1)} mois`;
}
