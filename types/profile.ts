import type { CompanySizeValue } from "@/lib/onboarding/options";
import type { OnboardingObjectiveValue } from "@/lib/onboarding/objectives";

export type UserThemePreference = "dark" | "light";

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
  createdAt?: string;
  updatedAt?: string;
};

export type UserProfileUpdateInput = Omit<UserProfile, "email" | "emailVerified" | "createdAt" | "updatedAt">;
