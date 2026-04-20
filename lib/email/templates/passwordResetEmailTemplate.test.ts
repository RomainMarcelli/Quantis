// lib/email/templates/passwordResetEmailTemplate.test.ts
// Vérifie le template de réinitialisation de mot de passe envoyé via Resend.
import { describe, expect, it } from "vitest";
import { buildPasswordResetEmailTemplate } from "@/lib/email/templates/passwordResetEmailTemplate";

describe("buildPasswordResetEmailTemplate", () => {
  it("builds subject, html and text including first name and reset link", () => {
    const result = buildPasswordResetEmailTemplate({
      firstName: "Romain",
      resetUrl: "https://quantis.app/reset-password?oobCode=abc"
    });

    expect(result.subject).toBe("Réinitialisez votre mot de passe Quantis");
    expect(result.html).toContain("Romain");
    expect(result.html).toContain("https://quantis.app/reset-password?oobCode=abc");
    expect(result.text).toContain("Romain");
    expect(result.text).toContain("https://quantis.app/reset-password?oobCode=abc");
  });

  it("falls back to Bonjour when first name is missing", () => {
    const result = buildPasswordResetEmailTemplate({
      resetUrl: "https://quantis.app/reset-password?oobCode=abc"
    });

    expect(result.html).toContain("Bonjour");
    expect(result.text).toContain("Bonjour");
  });
});
