import { isCompanySizeValue, isSectorValue } from "@/lib/onboarding/options";
import type { UserProfileUpdateInput } from "@/types/profile";

export type AccountValidationErrors = {
  firstName?: string;
  lastName?: string;
  companyName?: string;
  siren?: string;
  companySize?: string;
  sector?: string;
  general?: string;
};

export type AccountUpdateResult =
  | { success: true }
  | { success: false; errors: AccountValidationErrors };

export type AccountDeleteResult =
  | { success: true; deletedAnalysesCount?: number }
  | { success: false; message: string };

export interface AccountGateway {
  updateProfile(userId: string, updates: UserProfileUpdateInput): Promise<void>;
  deleteUserData(userId: string): Promise<{ deletedAnalysesCount: number }>;
  deleteAuthAccount(): Promise<void>;
}

export function validateAccountProfileInput(
  input: UserProfileUpdateInput
): AccountValidationErrors {
  const errors: AccountValidationErrors = {};

  if (input.firstName.trim().length < 2) {
    errors.firstName = "Le prenom doit contenir au moins 2 caracteres.";
  }

  if (input.lastName.trim().length < 2) {
    errors.lastName = "Le nom doit contenir au moins 2 caracteres.";
  }

  if (input.companyName.trim().length < 2) {
    errors.companyName = "Le nom d'entreprise doit contenir au moins 2 caracteres.";
  }

  if (!/^\d{9}$/.test(input.siren.trim())) {
    errors.siren = "Le SIREN doit contenir exactement 9 chiffres.";
  }

  if (!input.companySize || !isCompanySizeValue(input.companySize)) {
    errors.companySize = "Veuillez choisir une taille d'entreprise.";
  }

  if (!input.sector || !isSectorValue(input.sector)) {
    errors.sector = "Veuillez choisir un secteur.";
  }

  return errors;
}

export async function updateAccountProfile(
  gateway: Pick<AccountGateway, "updateProfile">,
  userId: string,
  input: UserProfileUpdateInput
): Promise<AccountUpdateResult> {
  const errors = validateAccountProfileInput(input);
  if (hasErrors(errors)) {
    return {
      success: false,
      errors
    };
  }

  await gateway.updateProfile(userId, sanitizeAccountInput(input));
  return { success: true };
}

export async function deleteAccountData(
  gateway: Pick<AccountGateway, "deleteUserData">,
  userId: string
): Promise<AccountDeleteResult> {
  try {
    const result = await gateway.deleteUserData(userId);
    return {
      success: true,
      deletedAnalysesCount: result.deletedAnalysesCount
    };
  } catch (error) {
    return {
      success: false,
      message: mapDeleteError(error)
    };
  }
}

export async function deleteAccountCompletely(
  gateway: Pick<AccountGateway, "deleteUserData" | "deleteAuthAccount">,
  userId: string
): Promise<AccountDeleteResult> {
  try {
    const result = await gateway.deleteUserData(userId);
    await gateway.deleteAuthAccount();
    return {
      success: true,
      deletedAnalysesCount: result.deletedAnalysesCount
    };
  } catch (error) {
    return {
      success: false,
      message: mapDeleteError(error)
    };
  }
}

function sanitizeAccountInput(input: UserProfileUpdateInput): UserProfileUpdateInput {
  return {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    companyName: input.companyName.trim(),
    siren: input.siren.trim(),
    companySize: input.companySize,
    sector: input.sector
  };
}

function hasErrors(errors: AccountValidationErrors): boolean {
  return Boolean(
    errors.firstName ||
      errors.lastName ||
      errors.companyName ||
      errors.siren ||
      errors.companySize ||
      errors.sector ||
      errors.general
  );
}

function mapDeleteError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "auth/requires-recent-login") {
      return "Veuillez vous reconnecter avant de supprimer votre compte.";
    }
  }

  return "Operation impossible pour le moment. Veuillez reessayer.";
}

