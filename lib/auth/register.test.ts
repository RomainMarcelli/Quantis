import { describe, expect, it, vi } from "vitest";
import {
  registerWithEmailPassword,
  type RegisterGateway,
  validateRegisterCredentials
} from "@/lib/auth/register";

describe("validateRegisterCredentials", () => {
  it("returns validation errors for invalid values", () => {
    const errors = validateRegisterCredentials({
      lastName: "A",
      firstName: "",
      email: "invalid-email",
      password: "short",
      companyName: "",
      siren: "1234",
      companySize: "",
      sector: "",
      usageObjectives: []
    });

    expect(errors.lastName).toBeDefined();
    expect(errors.firstName).toBeDefined();
    expect(errors.email).toBe("Format d'email invalide.");
    expect(errors.password).toBe("Le mot de passe doit contenir au moins 8 caracteres.");
    expect(errors.companyName).toBeDefined();
    expect(errors.siren).toBe("Le SIREN doit contenir exactement 9 chiffres.");
    expect(errors.companySize).toBeDefined();
    expect(errors.sector).toBeDefined();
    expect(errors.usageObjectives).toBeDefined();
  });

  it("accepts strong and complete credentials", () => {
    const errors = validateRegisterCredentials({
      lastName: "Dupont",
      firstName: "Marie",
      email: "marie@quantis.fr",
      password: "Quantis#2026",
      companyName: "Quantis SAS",
      siren: "123456789",
      companySize: "pme",
      sector: "SaaS & Edition de Logiciels",
      usageObjectives: ["analyser_comptes"]
    });

    expect(errors).toEqual({});
  });
});

describe("registerWithEmailPassword", () => {
  function makeGateway(overrides?: Partial<RegisterGateway>): RegisterGateway {
    return {
      register: vi.fn().mockResolvedValue({
        uid: "uid-456",
        email: "marie@quantis.fr",
        displayName: "Marie Dupont",
        emailVerified: false
      }),
      saveProfile: vi.fn().mockResolvedValue(undefined),
      ...overrides
    };
  }

  it("does not call gateway when validation fails", async () => {
    const gateway = makeGateway();

    const result = await registerWithEmailPassword(gateway, {
      lastName: "",
      firstName: "",
      email: "",
      password: "",
      companyName: "",
      siren: "",
      companySize: "",
      sector: "",
      usageObjectives: []
    });

    expect(result.success).toBe(false);
    expect(gateway.register).not.toHaveBeenCalled();
    expect(gateway.saveProfile).not.toHaveBeenCalled();
  });

  it("creates user and stores profile when registration succeeds", async () => {
    const gateway = makeGateway();

    const result = await registerWithEmailPassword(gateway, {
      lastName: "Dupont",
      firstName: "Marie",
      email: "marie@quantis.fr",
      password: "Quantis#2026",
      companyName: "Quantis SAS",
      siren: "123456789",
      companySize: "pme",
      sector: "SaaS & Edition de Logiciels",
      usageObjectives: ["analyser_comptes"]
    });

    expect(result).toEqual({
      success: true,
      user: {
        uid: "uid-456",
        email: "marie@quantis.fr",
        displayName: "Marie Dupont",
        emailVerified: false
      }
    });

    expect(gateway.register).toHaveBeenCalledTimes(1);
    expect(gateway.saveProfile).toHaveBeenCalledWith("uid-456", {
      firstName: "Marie",
      lastName: "Dupont",
      email: "marie@quantis.fr",
      companyName: "Quantis SAS",
      siren: "123456789",
      companySize: "pme",
      sector: "SaaS & Edition de Logiciels",
      usageObjectives: ["analyser_comptes"]
    });
  });

  it("maps email already in use firebase error", async () => {
    const gateway = makeGateway({
      register: vi.fn().mockRejectedValue({ code: "auth/email-already-in-use" })
    });

    const result = await registerWithEmailPassword(gateway, {
      lastName: "Dupont",
      firstName: "Marie",
      email: "marie@quantis.fr",
      password: "Quantis#2026",
      companyName: "Quantis SAS",
      siren: "123456789",
      companySize: "pme",
      sector: "SaaS & Edition de Logiciels",
      usageObjectives: ["analyser_comptes"]
    });

    expect(result).toEqual({
      success: false,
      errors: {
        general: "Cet email est deja utilise."
      }
    });
  });
});
