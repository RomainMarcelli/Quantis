// File: components/dashboard/formatting.ts
// Role: centralise les helpers de formatage (EUR, %, nombres, mois) utilises par les composants dashboard.
// Helper centralise pour formater les devises en EUR de maniere consistente.
export function formatCurrency(value: number | null): string {
  if (value === null) {
    return "N/D";
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
    return "N/D";
  }

  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${normalized.toFixed(digits)}%`;
}

// Helper compact pour les nombres simples avec separateur FR.
export function formatNumber(value: number | null, digits: number = 1): string {
  if (value === null) {
    return "N/D";
  }

  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: digits
  }).format(value);
}

// Helper metier dedie runway (en mois).
export function formatMonths(value: number | null): string {
  if (value === null) {
    return "N/D";
  }

  return `${value.toFixed(1)} mois`;
}
