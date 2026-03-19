import { getPasswordValidationError } from "@/lib/auth/passwordPolicy";

export type ForgotPasswordInput = {
  email: string;
};

export type ForgotPasswordValidationErrors = {
  email?: string;
  general?: string;
};

export type ForgotPasswordResult =
  | { success: true; message: string }
  | { success: false; errors: ForgotPasswordValidationErrors };

export type VerifyResetCodeResult =
  | { success: true; email: string }
  | { success: false; message: string };

export type ResetPasswordInput = {
  oobCode: string;
  password: string;
  confirmPassword: string;
};

export type ResetPasswordValidationErrors = {
  password?: string;
  confirmPassword?: string;
  general?: string;
};

export type ResetPasswordResult =
  | { success: true; message: string }
  | { success: false; errors: ResetPasswordValidationErrors };

export interface PasswordResetGateway {
  sendPasswordReset(email: string): Promise<void>;
  verifyPasswordResetCode(oobCode: string): Promise<string>;
  confirmPasswordReset(oobCode: string, newPassword: string): Promise<void>;
}

const GENERIC_RESET_REQUEST_SUCCESS_MESSAGE =
  "Si un compte existe pour cet email, un lien de reinitialisation a ete envoye.";

export function validateForgotPasswordInput(
  input: ForgotPasswordInput
): ForgotPasswordValidationErrors {
  const errors: ForgotPasswordValidationErrors = {};
  const email = input.email.trim();

  if (!email) {
    errors.email = "L'email est obligatoire.";
  } else if (!isValidEmailFormat(email)) {
    errors.email = "Format d'email invalide.";
  }

  return errors;
}

export async function requestPasswordReset(
  gateway: Pick<PasswordResetGateway, "sendPasswordReset">,
  input: ForgotPasswordInput
): Promise<ForgotPasswordResult> {
  const errors = validateForgotPasswordInput(input);
  if (hasForgotPasswordValidationErrors(errors)) {
    return {
      success: false,
      errors
    };
  }

  try {
    await gateway.sendPasswordReset(input.email.trim());
    return {
      success: true,
      message: GENERIC_RESET_REQUEST_SUCCESS_MESSAGE
    };
  } catch (error) {
    const code = extractErrorCode(error);

    // Contrainte securite: on ne revele jamais si l'email existe ou non.
    if (code === "auth/user-not-found") {
      return {
        success: true,
        message: GENERIC_RESET_REQUEST_SUCCESS_MESSAGE
      };
    }

    if (code === "auth/invalid-email") {
      return {
        success: false,
        errors: {
          email: "Format d'email invalide."
        }
      };
    }

    if (code === "auth/too-many-requests") {
      return {
        success: false,
        errors: {
          general: "Trop de tentatives. Reessayez dans quelques minutes."
        }
      };
    }

    return {
      success: false,
      errors: {
        general: "Impossible d'envoyer le lien pour le moment. Veuillez reessayer."
      }
    };
  }
}

export async function verifyPasswordResetLink(
  gateway: Pick<PasswordResetGateway, "verifyPasswordResetCode">,
  oobCode: string
): Promise<VerifyResetCodeResult> {
  const trimmedCode = oobCode.trim();
  if (!trimmedCode) {
    return {
      success: false,
      message: "Lien de reinitialisation invalide ou incomplet."
    };
  }

  try {
    const email = await gateway.verifyPasswordResetCode(trimmedCode);
    return {
      success: true,
      email
    };
  } catch (error) {
    return {
      success: false,
      message: mapResetLinkErrorToMessage(extractErrorCode(error))
    };
  }
}

export function validateResetPasswordInput(
  input: ResetPasswordInput
): ResetPasswordValidationErrors {
  const errors: ResetPasswordValidationErrors = {};

  if (!input.oobCode.trim()) {
    errors.general = "Lien de reinitialisation invalide ou incomplet.";
  }

  const passwordError = getPasswordValidationError(input.password);
  if (passwordError) {
    errors.password = passwordError;
  }

  if (!input.confirmPassword) {
    errors.confirmPassword = "La confirmation du mot de passe est obligatoire.";
  } else if (input.password !== input.confirmPassword) {
    errors.confirmPassword = "Les mots de passe ne correspondent pas.";
  }

  return errors;
}

export async function confirmPasswordResetFlow(
  gateway: Pick<PasswordResetGateway, "confirmPasswordReset">,
  input: ResetPasswordInput
): Promise<ResetPasswordResult> {
  const errors = validateResetPasswordInput(input);
  if (hasResetValidationErrors(errors)) {
    return {
      success: false,
      errors
    };
  }

  try {
    await gateway.confirmPasswordReset(input.oobCode.trim(), input.password);
    return {
      success: true,
      message: "Mot de passe mis a jour avec succes. Vous pouvez vous connecter."
    };
  } catch (error) {
    return {
      success: false,
      errors: {
        general: mapResetLinkErrorToMessage(extractErrorCode(error))
      }
    };
  }
}

function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hasForgotPasswordValidationErrors(errors: ForgotPasswordValidationErrors): boolean {
  return Boolean(errors.email || errors.general);
}

function hasResetValidationErrors(errors: ResetPasswordValidationErrors): boolean {
  return Boolean(errors.password || errors.confirmPassword || errors.general);
}

function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function mapResetLinkErrorToMessage(code: string | undefined): string {
  switch (code) {
    case "auth/invalid-action-code":
    case "auth/expired-action-code":
      return "Ce lien de reinitialisation est invalide ou expire.";
    case "auth/weak-password":
      return "Mot de passe trop faible. Verifiez les criteres de securite.";
    case "auth/too-many-requests":
      return "Trop de tentatives. Reessayez dans quelques minutes.";
    default:
      return "Operation impossible pour le moment. Veuillez reessayer.";
  }
}

