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

    // DEC-009 : fallback rightmost → col2 = N-1 pour les champs nCurrent sans preferFirst.
    // netTurnover et totalOperatingCharges restent nCurrent → col2 = N-1 dans une liasse 2 colonnes.
    expect(parsed.incomeStatement.netTurnover).toBe(3370595);
    expect(parsed.incomeStatement.totalOperatingCharges).toBe(7736512);
    // netResult utilise signedRightmost (non affecté par le fix nCurrent) → retourne le rightmost signé.
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
    expect(result.diagnostics.confidenceScore).toBeGreaterThanOrEqual(0.15);
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

  it("selectionne les totaux actif via contexte quand les labels sont generiques", () => {
    const sample: DocumentAIResponse = {
      rawText: [
        "BILAN ACTIF",
        "Actif immobilise",
        "TOTAL (1) 13 208 608 6 220 898 6 987 710",
        "Actif circulant",
        "TOTAL (II) 5 275 349 2 454 213 2 821 136",
        "COMPTE DE RESULTAT",
        "Autres achats et charges externes 2 021 227 2 475 744"
      ].join("\n"),
      pages: [],
      tables: []
    };

    const parsed = extractFinancialData(sample);
    expect(parsed.balanceSheet.totalFixedAssets).toBe(6_987_710);
    expect(parsed.balanceSheet.totalFixedAssetsGross).toBe(13_208_608);
    expect(parsed.balanceSheet.totalCurrentAssets).toBe(2_821_136);
    expect(parsed.incomeStatement.externalCharges).not.toBeNull();
  });

  it("extrait les champs prioritaires lot 1", () => {
    const sample: DocumentAIResponse = {
      rawText: [
        "COMPTE DE RESULTAT (2033-SD)",
        "Achat de marchandises 234 1 250 300",
        "Variation de stocks (marchandises) 236 (18 450)",
        "Achats de matieres premieres et autres approvisionnements 238 520 000",
        "Variation de stock 240 6 200",
        "Autres charges externes 242 980 000",
        "Impots, taxes et versements assimiles 244 120 500",
        "Remunerations du personnel 250 1 450 000",
        "Charges sociales 252 560 000",
        "Dotations aux amortissements 254 205 000",
        "RESULTAT NET 310 (2 657 615)",
        "",
        "BILAN ACTIF",
        "Matieres premieres, approvisionnements, en cours de production 050 320 000",
        "",
        "BILAN PASSIF",
        "Emprunts et dettes assimilees 156 4 980 000"
      ].join("\n"),
      pages: [],
      tables: []
    };

    const parsed = extractFinancialData(sample);

    expect(parsed.incomeStatement.purchasesGoods).toBe(1250300);
    expect(parsed.incomeStatement.stockVariationGoods).toBe(-18450);
    expect(parsed.incomeStatement.rawMaterialPurchases).toBe(520000);
    expect(parsed.incomeStatement.stockVariationRawMaterials).toBe(6200);
    expect(parsed.incomeStatement.externalCharges).toBe(980000);
    expect(parsed.incomeStatement.taxesAndLevies).toBe(120500);
    expect(parsed.incomeStatement.wages).toBe(1450000);
    expect(parsed.incomeStatement.socialCharges).toBe(560000);
    expect(parsed.incomeStatement.depreciationAllocations).toBe(205000);
    expect(parsed.balanceSheet.rawMaterialInventories).toBe(320000);
    expect(parsed.balanceSheet.borrowings).toBe(4980000);
    expect(parsed.incomeStatement.netResult).toBe(-2657615);
  });

  it("extrait le sous-lot extension metier (produits/charges + actif/passif)", () => {
    const sample: DocumentAIResponse = {
      rawText: [
        "COMPTE DE RESULTAT",
        "Autres produits d'exploitation 230 120 000",
        "Dotations aux provisions 256 45 000",
        "Autres charges d'exploitation 262 33 000",
        "Total des produits financiers (V) 280 855 122",
        "Total des charges financieres (VI) 294 52 348",
        "Total des produits exceptionnels (VII) 290 271 780",
        "Total des charges exceptionnelles (VIII) 300 1 126 450",
        "Impots sur les benefices 306 14 500",
        "",
        "BILAN ACTIF",
        "Avances et acomptes verses sur commandes 064 41 000",
        "Valeurs mobilieres de placement 080 12 500",
        "",
        "BILAN PASSIF",
        "Avances et acomptes recus sur commandes en cours 164 422 085"
      ].join("\n"),
      pages: [],
      tables: []
    };

    const parsed = extractFinancialData(sample);

    expect(parsed.incomeStatement.otherOperatingIncome).toBe(120000);
    expect(parsed.incomeStatement.provisionsAllocations).toBe(45000);
    expect(parsed.incomeStatement.otherOperatingCharges).toBe(33000);
    expect(parsed.incomeStatement.financialProducts).toBe(855122);
    expect(parsed.incomeStatement.financialCharges).toBe(52348);
    expect(parsed.incomeStatement.exceptionalProducts).toBe(271780);
    expect(parsed.incomeStatement.exceptionalCharges).toBe(1126450);
    expect(parsed.incomeStatement.incomeTax).toBe(14500);

    expect(parsed.balanceSheet.advancesAndPrepaymentsAssets).toBe(41000);
    expect(parsed.balanceSheet.marketableSecurities).toBe(12500);
    expect(parsed.balanceSheet.advancesAndPrepaymentsLiabilities).toBe(422085);
  });
});
