import type { CompanySizeValue } from "@/lib/onboarding/options";
import type { OnboardingObjectiveValue } from "@/lib/onboarding/objectives";

export type UserThemePreference = "dark" | "light";

/**
 * Type de compte utilisateur (Sprint C multi-tenant).
 * - "company_owner" : dirigeant TPE/PME en accès direct (mode historique).
 * - "firm_member"   : membre d'un cabinet d'expertise comptable (Firm).
 *
 * Absent sur les users pré-Sprint C → traiter comme "company_owner"
 * (fallback partout dans l'app via `resolveAccountType()` helper).
 */
export type UserAccountType = "company_owner" | "firm_member";

export type UserProfile = {
  firstName: string;
  lastName: string;
  companyName: string;
  siren: string;
  companySize: CompanySizeValue | "";
  sector: string;
  usageObjectives?: OnboardingObjectiveValue[];
  email: string;
  emailVerified: boolean;
  themePreference?: UserThemePreference;
  onboardingTourCompleted?: boolean;
  /** Sprint C : type de compte (company_owner ou firm_member). */
  accountType?: UserAccountType;
  /** Sprint C : ID du cabinet — présent uniquement si accountType === "firm_member". */
  firmId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type UserProfileUpdateInput = Omit<UserProfile, "email" | "emailVerified" | "createdAt" | "updatedAt">;
