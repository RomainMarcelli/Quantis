import { isCompanySizeValue } from "@/lib/onboarding/options";
import {
  isOnboardingObjectiveValue,
  type OnboardingObjectiveValue
} from "@/lib/onboarding/objectives";
import { getPasswordValidationError } from "@/lib/auth/passwordPolicy";
import type {
  AuthenticatedUser,
  RegisterCredentials,
  RegisterResult,
  RegisterValidationErrors
} from "@/types/auth";

export type RegisterProfilePayload = {
  firstName: string;
  lastName: string;
  companyName: string;
  siren: string;
  companySize: string;
  sector: string;
  email: string;
  usageObjectives: OnboardingObjectiveValue[];
};

export interface RegisterGateway {
  register(credentials: RegisterCredentials): Promise<AuthenticatedUser>;
  saveProfile(userId: string, profile: RegisterProfilePayload): Promise<void>;
}

export function validateRegisterCredentials(
  credentials: RegisterCredentials
): RegisterValidationErrors {
  const errors: RegisterValidationErrors = {};
  const lastName = credentials.lastName.trim();
  const firstName = credentials.firstName.trim();
  const email = credentials.email.trim();
  const password = credentials.password;
  const companyName = credentials.companyName.trim();
  const siren = credentials.siren.trim();
  const sector = credentials.sector.trim();

  if (lastName.length < 2) {
    errors.lastName = "Le nom doit contenir au moins 2 caracteres.";
  } else if (lastName.length > 80) {
    errors.lastName = "Le nom ne doit pas depasser 80 caracteres.";
  }

  if (firstName.length < 2) {
    errors.firstName = "Le prenom doit contenir au moins 2 caracteres.";
  } else if (firstName.length > 80) {
    errors.firstName = "Le prenom ne doit pas depasser 80 caracteres.";
  }

  if (!email) {
    errors.email = "L'email est obligatoire.";
  } else if (!isValidEmailFormat(email)) {
    errors.email = "Format d'email invalide.";
  }

  const passwordError = getPasswordValidationError(password);
  if (passwordError) {
    errors.password = passwordError;
  }

  if (companyName.length < 2) {
    errors.companyName = "Le nom d'entreprise doit contenir au moins 2 caracteres.";
  } else if (companyName.length > 120) {
    errors.companyName = "Le nom d'entreprise ne doit pas depasser 120 caracteres.";
  }

  if (!/^\d{9}$/.test(siren)) {
    errors.siren = "Le SIREN doit contenir exactement 9 chiffres.";
  }

  if (!credentials.companySize || !isCompanySizeValue(credentials.companySize)) {
    errors.companySize = "Veuillez choisir une taille d'entreprise.";
  }

  if (sector.length < 2) {
    errors.sector = "Veuillez choisir un secteur.";
  }

  const hasOnlyKnownObjectives =
    Array.isArray(credentials.usageObjectives) &&
    credentials.usageObjectives.length > 0 &&
    credentials.usageObjectives.every((objective) => isOnboardingObjectiveValue(objective));

  if (!hasOnlyKnownObjectives) {
    errors.usageObjectives = "Veuillez sélectionner au moins un objectif d'utilisation.";
  }

  return errors;
}

export async function registerWithEmailPassword(
  gateway: RegisterGateway,
  credentials: RegisterCredentials
): Promise<RegisterResult> {
  const errors = validateRegisterCredentials(credentials);

  if (hasValidationErrors(errors)) {
    return {
      success: false,
      errors
    };
  }

  const sanitizedCredentials: RegisterCredentials = {
    ...credentials,
    lastName: credentials.lastName.trim(),
    firstName: credentials.firstName.trim(),
    email: credentials.email.trim(),
    companyName: credentials.companyName.trim(),
    siren: credentials.siren.trim(),
    sector: credentials.sector.trim(),
    usageObjectives: credentials.usageObjectives.filter((objective) =>
      isOnboardingObjectiveValue(objective)
    )
  };

  let user: AuthenticatedUser;
  try {
    user = await gateway.register(sanitizedCredentials);
  } catch (error) {
    return {
      success: false,
      errors: {
        general: mapFirebaseRegisterError(extractErrorCode(error))
      }
    };
  }

  try {
    await gateway.saveProfile(user.uid, {
      firstName: sanitizedCredentials.firstName,
      lastName: sanitizedCredentials.lastName,
      email: sanitizedCredentials.email,
      companyName: sanitizedCredentials.companyName,
      siren: sanitizedCredentials.siren,
      companySize: sanitizedCredentials.companySize,
      sector: sanitizedCredentials.sector,
      usageObjectives: sanitizedCredentials.usageObjectives
    });
  } catch {
    // Le compte Firebase existe deja a ce stade; on retourne success
    // pour eviter le faux negatif "erreur puis email deja utilise".
  }

  return {
    success: true,
    user
  };
}

function hasValidationErrors(errors: RegisterValidationErrors): boolean {
  return Boolean(
    errors.lastName ||
      errors.firstName ||
      errors.email ||
      errors.password ||
      errors.companyName ||
      errors.siren ||
      errors.companySize ||
      errors.sector ||
      errors.usageObjectives ||
      errors.general
  );
}

function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !('code' in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function mapFirebaseRegisterError(code: string | undefined): string {
  switch (code) {
    case "auth/email-already-in-use":
      return "Cet email est deja utilise.";
    case "auth/invalid-email":
      return "Format d'email invalide.";
    case "auth/weak-password":
      return "Mot de passe trop faible.";
    case "auth/too-many-requests":
      return "Trop de tentatives. Réessayez plus tard.";
    default:
      return "Inscription impossible pour le moment. Veuillez réessayer.";
  }
}
