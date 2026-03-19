import type {
  AuthenticatedUser,
  LoginCredentials,
  LoginResult,
  LoginValidationErrors
} from "@/types/auth";

export interface LoginGateway {
  signIn(credentials: LoginCredentials): Promise<AuthenticatedUser>;
}

export function validateLoginCredentials(credentials: LoginCredentials): LoginValidationErrors {
  const errors: LoginValidationErrors = {};
  const email = credentials.email.trim();
  const password = credentials.password;

  if (!email) {
    errors.email = "L'email est obligatoire.";
  } else if (!isValidEmailFormat(email)) {
    errors.email = "Format d'email invalide.";
  }

  if (!password) {
    errors.password = "Le mot de passe est obligatoire.";
  }

  return errors;
}

export async function loginWithEmailPassword(
  gateway: LoginGateway,
  credentials: LoginCredentials
): Promise<LoginResult> {
  const errors = validateLoginCredentials(credentials);

  if (hasValidationErrors(errors)) {
    return {
      success: false,
      errors
    };
  }

  try {
    const user = await gateway.signIn({
      email: credentials.email.trim(),
      password: credentials.password
    });

    return {
      success: true,
      user
    };
  } catch (error) {
    return {
      success: false,
      errors: {
        general: mapFirebaseAuthErrorToMessage(extractErrorCode(error))
      }
    };
  }
}

function hasValidationErrors(errors: LoginValidationErrors): boolean {
  return Boolean(errors.email || errors.password || errors.general);
}

function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function mapFirebaseAuthErrorToMessage(code: string | undefined): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Email ou mot de passe invalide.";
    case "auth/too-many-requests":
      return "Trop de tentatives. Reessayez dans quelques minutes.";
    default:
      return "Connexion impossible pour le moment. Veuillez reessayer.";
  }
}

