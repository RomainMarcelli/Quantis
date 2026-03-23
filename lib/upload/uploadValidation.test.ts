import { describe, expect, it } from "vitest";
import { isExcelFileName, validateUploadInput } from "@/lib/upload/uploadValidation";

function makeFile(name: string): File {
  return { name } as File;
}

describe("isExcelFileName", () => {
  it("accepte les extensions Excel", () => {
    expect(isExcelFileName("balance.xlsx")).toBe(true);
    expect(isExcelFileName("balance.xls")).toBe(true);
    expect(isExcelFileName("balance.csv")).toBe(true);
  });

  it("refuse les extensions non Excel", () => {
    expect(isExcelFileName("rapport.pdf")).toBe(false);
    expect(isExcelFileName("image.png")).toBe(false);
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

  it("retourne une erreur si un format non Excel est transmis", () => {
    const result = validateUploadInput([makeFile("rapport.pdf")], {
      companySize: "pme",
      sector: "SaaS & Edition de Logiciels"
    });

    expect(result.valid).toBe(false);
    expect(result.errors.files).toContain("Seuls les formats Excel");
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
