import type { CompanySizeValue, SectorValue } from "@/lib/onboarding/options";

export type UserProfile = {
  firstName: string;
  lastName: string;
  companyName: string;
  siren: string;
  companySize: CompanySizeValue | "";
  sector: SectorValue | "";
  email: string;
  emailVerified: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type UserProfileUpdateInput = Omit<UserProfile, "email" | "emailVerified" | "createdAt" | "updatedAt">;

