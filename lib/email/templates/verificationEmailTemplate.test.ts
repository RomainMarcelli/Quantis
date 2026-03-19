import { describe, expect, it } from "vitest";
import { buildVerificationEmailTemplate } from "@/lib/email/templates/verificationEmailTemplate";

describe("buildVerificationEmailTemplate", () => {
  it("builds subject, html and text including first name and verification link", () => {
    const result = buildVerificationEmailTemplate({
      firstName: "Marie",
      verificationUrl: "https://quantis.app/verify?token=abc"
    });

    expect(result.subject).toBe("Activez votre compte Quantis");
    expect(result.html).toContain("Marie");
    expect(result.html).toContain("https://quantis.app/verify?token=abc");
    expect(result.text).toContain("Marie");
    expect(result.text).toContain("https://quantis.app/verify?token=abc");
  });

  it("falls back to Bonjour when first name is empty", () => {
    const result = buildVerificationEmailTemplate({
      firstName: "   ",
      verificationUrl: "https://quantis.app/verify?token=abc"
    });

    expect(result.html).toContain("Bonjour");
    expect(result.text).toContain("Bonjour");
  });
});
