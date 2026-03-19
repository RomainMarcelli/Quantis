import { describe, expect, it } from "vitest";
import {
  getPasswordRuleChecks,
  getPasswordValidationError,
  isPasswordCompliant
} from "@/lib/auth/passwordPolicy";

describe("password policy", () => {
  it("marks every rule invalid for an empty password", () => {
    const checks = getPasswordRuleChecks("");

    expect(checks.every((rule) => !rule.isValid)).toBe(true);
  });

  it("marks all rules valid for a compliant password", () => {
    const checks = getPasswordRuleChecks("Quantis#2026");

    expect(checks.every((rule) => rule.isValid)).toBe(true);
    expect(isPasswordCompliant("Quantis#2026")).toBe(true);
    expect(getPasswordValidationError("Quantis#2026")).toBeUndefined();
  });

  it("returns the first validation error message", () => {
    expect(getPasswordValidationError("short")).toBe(
      "Le mot de passe doit contenir au moins 8 caracteres."
    );
  });
});

