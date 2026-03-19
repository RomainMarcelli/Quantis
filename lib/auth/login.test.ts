import { describe, expect, it, vi } from "vitest";
import { loginWithEmailPassword, type LoginGateway, validateLoginCredentials } from "@/lib/auth/login";

describe("validateLoginCredentials", () => {
  it("returns errors when email is empty and password is empty", () => {
    const errors = validateLoginCredentials({
      email: "",
      password: ""
    });

    expect(errors).toEqual({
      email: "L'email est obligatoire.",
      password: "Le mot de passe est obligatoire."
    });
  });

  it("returns an email format error when email is invalid", () => {
    const errors = validateLoginCredentials({
      email: "invalid-email",
      password: "strong-password"
    });

    expect(errors).toEqual({
      email: "Format d'email invalide."
    });
  });

  it("returns no errors for valid credentials", () => {
    const errors = validateLoginCredentials({
      email: "user@quantis.io",
      password: "strong-password"
    });

    expect(errors).toEqual({});
  });
});

describe("loginWithEmailPassword", () => {
  it("does not call gateway when credentials are invalid", async () => {
    const signIn = vi.fn();
    const gateway: LoginGateway = { signIn };

    const result = await loginWithEmailPassword(gateway, {
      email: "invalid",
      password: ""
    });

    expect(result.success).toBe(false);
    expect(signIn).not.toHaveBeenCalled();
  });

  it("returns authenticated user when gateway succeeds", async () => {
    const signIn = vi.fn().mockResolvedValue({
      uid: "uid-123",
      email: "user@quantis.io"
    });
    const gateway: LoginGateway = { signIn };

    const result = await loginWithEmailPassword(gateway, {
      email: "user@quantis.io",
      password: "secure-pass"
    });

    expect(result).toEqual({
      success: true,
      user: {
        uid: "uid-123",
        email: "user@quantis.io"
      }
    });
    expect(signIn).toHaveBeenCalledWith({
      email: "user@quantis.io",
      password: "secure-pass"
    });
  });

  it("maps firebase invalid credential error to readable message", async () => {
    const signIn = vi.fn().mockRejectedValue({
      code: "auth/invalid-credential"
    });
    const gateway: LoginGateway = { signIn };

    const result = await loginWithEmailPassword(gateway, {
      email: "user@quantis.io",
      password: "wrong-pass"
    });

    expect(result).toEqual({
      success: false,
      errors: {
        general: "Email ou mot de passe invalide."
      }
    });
  });
});

