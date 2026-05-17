// File: lib/config/onboarding.ts
// Role: options du picker pré-auth /onboarding. Modifier ici pour changer
// les labels / icônes / redirections sans toucher au composant.

import { ROUTES } from "./routes";
import { ACCOUNT_TYPES, type AccountType } from "./account-types";

export interface OnboardingOption {
  id: AccountType;
  title: string;
  description: string;
  /** Emoji ou identifiant d'icône — le composant gère le rendu. */
  icon: string;
  redirectTo: string;
  /** Le parcours firm_member est mis en avant via `highlighted` (look "gold"). */
  highlighted?: boolean;
}

export const ONBOARDING_OPTIONS: OnboardingOption[] = [
  {
    id: ACCOUNT_TYPES.COMPANY_OWNER,
    title: "Je pilote mon entreprise",
    description:
      "Connectez votre comptabilité (Pennylane, MyU, FEC…) et suivez vos KPIs financiers en temps réel.",
    icon: "🏢",
    redirectTo: `${ROUTES.SIGNUP}?next=${encodeURIComponent(ROUTES.SYNTHESE)}`,
  },
  {
    id: ACCOUNT_TYPES.FIRM_MEMBER,
    title: "Je gère un cabinet comptable",
    description:
      "Connectez votre cabinet Pennylane et accédez à plusieurs dossiers clients depuis un portefeuille unique.",
    icon: "👥",
    redirectTo: ROUTES.CABINET_SETUP,
    highlighted: true,
  },
];
