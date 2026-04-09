import { describe, expect, it } from "vitest";
import {
  analyzeFinancialDocument,
  computeFinancialExtractionDiagnostics,
  detectFinancialSections,
  extractFinancialData,
  type DocumentAIResponse
} from "@/services/pdfAnalysis";

describe("pdfAnalysis", () => {
  it("extrait les champs critiques sur une liasse multi-colonnes", () => {
    const sample: DocumentAIResponse = {
      rawText: [
        "COMPTE DE RESULTAT",
        "CHIFFRES D'AFFAIRES NETS 209 10 307 405 3 370 595",
        "Production vendue de biens 215 250 000 200 000",
        "Production vendue de services 217 45 000 40 000",
        "Total des produits d'exploitation 232 10 602 405 3 620 595",
        "Total des charges d'exploitation (II) 264 11 304 983 7 736 512",
        "RESULTAT D'EXPLOITATION 270 (702 578) (4 115 917)",
        "RESULTAT NET 310 6 044 950 (2 657 615)",
        "",
        "BILAN ACTIF",
        "TOTAL I - ACTIF IMMOBILISE 044 12 345 678 6 100 000 6 245 678",
        "TOTAL II - ACTIF CIRCULANT 096 4 820 000 1 256 832 3 563 168",
        "TOTAL GENERAL ACTIF 110 18 483 957 8 675 111 9 808 846 9 124 004",
        "",
        "BILAN PASSIF",
        "TOTAL I - CAPITAUX PROPRES 142 9 057 265 4 002 315",
        "TOTAL III - EMPRUNTS ET DETTES 176 145 986 5 806 530",
        "TOTAL GENERAL PASSIF 180 9 808 845"
      ].join("\n"),
      pages: [],
      tables: []
    };

    const parsed = extractFinancialData(sample);

    expect(parsed.incomeStatement.netTurnover).toBe(3370595);
    expect(parsed.incomeStatement.totalOperatingCharges).toBe(7736512);
    expect(parsed.incomeStatement.netResult).toBe(-2657615);

    expect(parsed.balanceSheet.totalAssets).toBe(9808846);
    expect(parsed.balanceSheet.equity).toBe(4002315);
    expect(parsed.balanceSheet.debts).toBe(5806530);
  });

  it("detecte les sections correctement", () => {
    const sample: DocumentAIResponse = {
      rawText: ["COMPTE DE RESULTAT", "Produits", "Charges", "BILAN", "ACTIF", "PASSIF"].join("\n"),
      pages: [],
      tables: []
    };

    expect(detectFinancialSections(sample)).toEqual({
      incomeStatement: true,
      balanceSheet: true
    });
  });

  it("fournit traces + score + checks de coherence", () => {
    const sample: DocumentAIResponse = {
      rawText: [
        "COMPTE DE RESULTAT",
        "CHIFFRES D'AFFAIRES NETS 1 200 000",
        "TOTAL DES CHARGES D'EXPLOITATION 900 000",
        "TOTAL DES PRODUITS 1 250 000",
        "RESULTAT NET 350 000",
        "BILAN",
        "TOTAL ACTIF 2 000 000",
        "CAPITAUX PROPRES 900 000",
        "EMPRUNTS ET DETTES 1 100 000",
        "TOTAL PASSIF 2 000 000"
      ].join("\n"),
      pages: [],
      tables: []
    };

    const result = analyzeFinancialDocument(sample);

    expect(result.traces.length).toBeGreaterThan(10);
    expect(result.diagnostics.confidenceScore).toBeGreaterThan(0.2);
    expect(result.diagnostics.fieldScores.netTurnover).toBeGreaterThan(0);
    expect(result.diagnostics.consistencyChecks.some((check) => check.name === "assets_vs_liabilities")).toBe(true);
  });

  it("retourne des warnings si des champs critiques sont manquants", () => {
    const sample: DocumentAIResponse = {
      rawText: ["BILAN", "TOTAL ACTIF 1 500 000"].join("\n"),
      pages: [],
      tables: []
    };

    const parsed = extractFinancialData(sample);
    const sections = detectFinancialSections(sample);
    const diagnostics = computeFinancialExtractionDiagnostics(sample, parsed, sections);

    expect(diagnostics.confidenceScore).toBeLessThan(0.5);
    expect(diagnostics.warnings.some((warning) => warning.includes("Champ critique non trouve"))).toBe(true);
  });
});
