import { describe, expect, it } from "vitest";
import { isAcceptedFileName, validateUploadInput } from "@/lib/upload/uploadValidation";

function makeFile(name: string, size = 1024): File {
  return { name, size } as File;
}

describe("isAcceptedFileName", () => {
  it("accepte les extensions supportées", () => {
    expect(isAcceptedFileName("balance.xlsx")).toBe(true);
    expect(isAcceptedFileName("balance.xls")).toBe(true);
    expect(isAcceptedFileName("balance.csv")).toBe(true);
    expect(isAcceptedFileName("liasse.pdf")).toBe(true);
  });

  it("refuse les extensions non supportées", () => {
    expect(isAcceptedFileName("image.png")).toBe(false);
    expect(isAcceptedFileName("document.docx")).toBe(false);
  });
});

describe("validateUploadInput", () => {
  it("retourne des erreurs si contexte obligatoire manquant", () => {
    const result = validateUploadInput([makeFile("balance.xlsx")], {
      companySize: "",
      sector: ""
    });

    expect(result.valid).toBe(false);
    expect(result.errors.companySize).toBeDefined();
    expect(result.errors.sector).toBeDefined();
  });

  it("retourne une erreur si un format non supporté est transmis", () => {
    const result = validateUploadInput([makeFile("image.png")], {
      companySize: "pme",
      sector: "SaaS & Edition de Logiciels"
    });

    expect(result.valid).toBe(false);
    expect(result.errors.files).toContain("Formats acceptés");
  });

  it("accepte un PDF", () => {
    const result = validateUploadInput(
      [makeFile("liasse.pdf")],
      { companySize: "pme", sector: "SaaS & Edition de Logiciels" }
    );

    expect(result.valid).toBe(true);
  });

  it("refuse un fichier trop volumineux", () => {
    const result = validateUploadInput(
      [makeFile("gros.pdf", 25 * 1024 * 1024)],
      { companySize: "pme", sector: "SaaS & Edition de Logiciels" }
    );

    expect(result.valid).toBe(false);
    expect(result.errors.files).toContain("20 Mo");
  });

  it("valide une demande complète", () => {
    const result = validateUploadInput([makeFile("balance.xlsx"), makeFile("compte.csv")], {
      companySize: "pme",
      sector: "SaaS & Edition de Logiciels"
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("valide sans contexte quand l'utilisateur est déjà connecté", () => {
    const result = validateUploadInput(
      [makeFile("balance.xlsx")],
      {
        companySize: "",
        sector: ""
      },
      { requireContext: false }
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });
});
