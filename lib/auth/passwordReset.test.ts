import { describe, expect, it, vi } from "vitest";
import {
  confirmPasswordResetFlow,
  requestPasswordReset,
  type PasswordResetGateway,
  validateForgotPasswordInput,
  validateResetPasswordInput,
  verifyPasswordResetLink
} from "@/lib/auth/passwordReset";

describe("validateForgotPasswordInput", () => {
  it("returns an error when email is empty", () => {
    const errors = validateForgotPasswordInput({
      email: ""
    });

    expect(errors).toEqual({
      email: "L'email est obligatoire."
    });
  });

  it("returns an error when email format is invalid", () => {
    const errors = validateForgotPasswordInput({
      email: "invalid-email"
    });

    expect(errors).toEqual({
      email: "Format d'email invalide."
    });
  });

  it("returns no errors for a valid email", () => {
    const errors = validateForgotPasswordInput({
      email: "user@quantis.io"
    });

    expect(errors).toEqual({});
  });
});

describe("requestPasswordReset", () => {
  it("does not call gateway when email is invalid", async () => {
    const sendPasswordReset = vi.fn();
    const gateway: Pick<PasswordResetGateway, "sendPasswordReset"> = { sendPasswordReset };

    const result = await requestPasswordReset(gateway, { email: "bad-email" });

    expect(result.success).toBe(false);
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });

  it("returns a generic success message on success", async () => {
    const sendPasswordReset = vi.fn().mockResolvedValue(undefined);
    const gateway: Pick<PasswordResetGateway, "sendPasswordReset"> = { sendPasswordReset };

    const result = await requestPasswordReset(gateway, { email: "user@quantis.io" });

    expect(result).toEqual({
      success: true,
      message: "Si un compte existe pour cet email, un lien de reinitialisation a ete envoye."
    });
  });

  it("returns the same generic success message when user is not found", async () => {
    const sendPasswordReset = vi.fn().mockRejectedValue({
      code: "auth/user-not-found"
    });
    const gateway: Pick<PasswordResetGateway, "sendPasswordReset"> = { sendPasswordReset };

    const result = await requestPasswordReset(gateway, { email: "unknown@quantis.io" });

    expect(result).toEqual({
      success: true,
      message: "Si un compte existe pour cet email, un lien de reinitialisation a ete envoye."
    });
  });
});

describe("validateResetPasswordInput", () => {
  it("returns errors when password is weak and confirmation mismatch", () => {
    const errors = validateResetPasswordInput({
      oobCode: "token",
      password: "abc",
      confirmPassword: "abcd"
    });

    expect(errors.password).toBeDefined();
    expect(errors.confirmPassword).toBe("Les mots de passe ne correspondent pas.");
  });

  it("returns no errors with valid input", () => {
    const errors = validateResetPasswordInput({
      oobCode: "token",
      password: "Abcdef1!",
      confirmPassword: "Abcdef1!"
    });

    expect(errors).toEqual({});
  });
});

describe("reset password flow", () => {
  it("fails verification when reset code is missing", async () => {
    const gateway: Pick<PasswordResetGateway, "verifyPasswordResetCode"> = {
      verifyPasswordResetCode: vi.fn()
    };

    const result = await verifyPasswordResetLink(gateway, "");
    expect(result).toEqual({
      success: false,
      message: "Lien de reinitialisation invalide ou incomplet."
    });
    expect(gateway.verifyPasswordResetCode).not.toHaveBeenCalled();
  });

  it("maps expired action code during confirmation", async () => {
    const confirmPasswordReset = vi.fn().mockRejectedValue({
      code: "auth/expired-action-code"
    });
    const gateway: Pick<PasswordResetGateway, "confirmPasswordReset"> = {
      confirmPasswordReset
    };

    const result = await confirmPasswordResetFlow(gateway, {
      oobCode: "token",
      password: "Abcdef1!",
      confirmPassword: "Abcdef1!"
    });

    expect(result).toEqual({
      success: false,
      errors: {
        general: "Ce lien de reinitialisation est invalide ou expire."
      }
    });
  });

  it("updates password when reset code and password are valid", async () => {
    const confirmPasswordReset = vi.fn().mockResolvedValue(undefined);
    const gateway: Pick<PasswordResetGateway, "confirmPasswordReset"> = {
      confirmPasswordReset
    };

    const result = await confirmPasswordResetFlow(gateway, {
      oobCode: "token",
      password: "Abcdef1!",
      confirmPassword: "Abcdef1!"
    });

    expect(result).toEqual({
      success: true,
      message: "Mot de passe mis a jour avec succes. Vous pouvez vous connecter."
    });
    expect(confirmPasswordReset).toHaveBeenCalledWith("token", "Abcdef1!");
  });
});

