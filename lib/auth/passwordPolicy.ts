export type PasswordRuleKey =
  | "minLength"
  | "hasUppercase"
  | "hasLowercase"
  | "hasDigit"
  | "hasSpecialChar";

export type PasswordRuleCheck = {
  key: PasswordRuleKey;
  label: string;
  isValid: boolean;
};

export function getPasswordRuleChecks(password: string): PasswordRuleCheck[] {
  return [
    {
      key: "minLength",
      label: "8 caracteres minimum",
      isValid: password.length >= 8
    },
    {
      key: "hasUppercase",
      label: "Au moins 1 majuscule",
      isValid: /[A-Z]/.test(password)
    },
    {
      key: "hasLowercase",
      label: "Au moins 1 minuscule",
      isValid: /[a-z]/.test(password)
    },
    {
      key: "hasDigit",
      label: "Au moins 1 chiffre",
      isValid: /\d/.test(password)
    },
    {
      key: "hasSpecialChar",
      label: "Au moins 1 caractere special",
      isValid: /[^A-Za-z0-9]/.test(password)
    }
  ];
}

export function getPasswordValidationError(password: string): string | undefined {
  if (!password) {
    return "Le mot de passe est obligatoire.";
  }

  const firstInvalid = getPasswordRuleChecks(password).find((rule) => !rule.isValid);
  if (!firstInvalid) {
    return undefined;
  }

  switch (firstInvalid.key) {
    case "minLength":
      return "Le mot de passe doit contenir au moins 8 caracteres.";
    case "hasUppercase":
      return "Le mot de passe doit contenir au moins une majuscule.";
    case "hasLowercase":
      return "Le mot de passe doit contenir au moins une minuscule.";
    case "hasDigit":
      return "Le mot de passe doit contenir au moins un chiffre.";
    case "hasSpecialChar":
      return "Le mot de passe doit contenir au moins un caractere special.";
    default:
      return "Mot de passe invalide.";
  }
}

export function isPasswordCompliant(password: string): boolean {
  return getPasswordRuleChecks(password).every((rule) => rule.isValid);
}

