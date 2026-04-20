// File: lib/onboarding/objectives.ts
// Role: référentiel des objectifs d'utilisation sélectionnables à l'inscription.

export const ONBOARDING_OBJECTIVE_OPTIONS = [
  { value: "analyser_comptes", label: "Analyser mes comptes" },
  { value: "preparer_financement", label: "Préparer un financement" },
  { value: "partager_resultats", label: "Partager des résultats" }
] as const;

export type OnboardingObjectiveValue = (typeof ONBOARDING_OBJECTIVE_OPTIONS)[number]["value"];

export function isOnboardingObjectiveValue(value: string): value is OnboardingObjectiveValue {
  return ONBOARDING_OBJECTIVE_OPTIONS.some((option) => option.value === value);
}
