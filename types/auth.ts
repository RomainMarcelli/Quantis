import type { CompanySizeValue, SectorValue } from "@/lib/onboarding/options";

export type LoginCredentials = {
  email: string;
  password: string;
};

export type RegisterCredentials = {
  lastName: string;
  firstName: string;
  email: string;
  password: string;
  companyName: string;
  siren: string;
  companySize: CompanySizeValue | "";
  sector: SectorValue | "";
};

export type AuthenticatedUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
};

export type LoginValidationErrors = {
  email?: string;
  password?: string;
  general?: string;
};

export type LoginResult =
  | {
      success: true;
      user: AuthenticatedUser;
    }
  | {
      success: false;
      errors: LoginValidationErrors;
    };

export type RegisterValidationErrors = {
  lastName?: string;
  firstName?: string;
  email?: string;
  password?: string;
  companyName?: string;
  siren?: string;
  companySize?: string;
  sector?: string;
  general?: string;
};

export type RegisterResult =
  | {
      success: true;
      user: AuthenticatedUser;
    }
  | {
      success: false;
      errors: RegisterValidationErrors;
    };
