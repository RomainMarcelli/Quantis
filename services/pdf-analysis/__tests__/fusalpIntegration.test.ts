import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeFinancialDocument, type DocumentAIResponse } from "@/services/pdfAnalysis";

// Test d'intégration CRÉATIONS FUSALP — format CDR tri-colonne (Fiducial Audit).
//
// Source : fixture JSON générée depuis la réponse Document AI réelle sur
// "CREATIONS FUSALP - Comptes sociaux 2025.pdf" (60 pages scannées).
//
// Particularités du format :
//   - PDF scanné Docusign : pdfPageExtractor tombe en fallback "1-30 pages"
//   - Pas de signature © Regnology / © Sage / DGFiP → routing 2033-sd par défaut
//   - CDR à 4 colonnes : France | Export | Total N | Total N-1
//   - Pas d'ancre "Exercice précédent" (les headers sont "Exercice 2024")
//     → detectCdrLayout retourne "tri-column"
//   - Sélection colonne fieldResolver :
//     * 3+ candidats → ordered[2] = Total N
//     * 2 candidats avec ratio dans [0.05, 0.95] → somme (France + Export)
//     * 2 candidats avec ratio > 0.95 → ordered[0] (probable [N, N-1])
//     * 1 candidat → ordered[0]
//
// Valeurs cibles extraites manuellement du PDF (source de vérité utilisateur) :
//
//   -- CDR --
//   ca (netTurnover)           = 52 945 837   (CHIFFRES D'AFFAIRES NETS Total)
//   salesGoods                 = 51 919 939   (Ventes de marchandises Total)
//   wages                      =  9 009 477   (Salaires et traitements)
//   socialCharges              =  3 769 044   (Charges sociales)
//   depreciationAllocations    =  4 351 533   (Dotations sur immobilisations)
//   netResult                  =    177 197   (BENEFICE OU PERTE)
//
//   -- Bilan actif --
//   inventoriesGoods           = 10 974 422   (Marchandises Net N)
//   tradeReceivables           =  2 392 897   (Créances clients Net N)
//   cashAndCashEquivalents     =  1 501 392   (Disponibilités Net N)
//   totalAssets                = 68 396 331   (TOTAL GENERAL Net N)
//
//   -- Bilan passif --
//   equity                     = 43 287 190   (CAPITAUX PROPRES Exercice 2025)
//   tradePayables              =  3 541 330   (Dettes fournisseurs)
//   taxSocialPayables          =  3 205 299   (Dettes fiscales et sociales)
//   totalLiabilities (debts)   = 24 903 549   (DETTES total)

function loadFusalpFixture(): DocumentAIResponse {
  const fixturePath = join(process.cwd(), "services/pdf-analysis/fixtures/fusalp-docai.json");
  const raw = readFileSync(fixturePath, "utf8");
  return JSON.parse(raw) as DocumentAIResponse;
}

describe("CRÉATIONS FUSALP — fixture replay (CDR tri-column)", () => {
  const document = loadFusalpFixture();
  const analysis = analyzeFinancialDocument(document);
  const { incomeStatement, balanceSheet } = analysis.parsedFinancialData;

  // ---- CDR ----

  it("ca (netTurnover) = 52 945 837", () => {
    expect(incomeStatement.netTurnover).toBe(52945837);
  });

  it("salesGoods = 51 919 939", () => {
    expect(incomeStatement.salesGoods).toBe(51919939);
  });

  it("wages = 9 009 477", () => {
    expect(incomeStatement.wages).toBe(9009477);
  });

  it("socialCharges = 3 769 044", () => {
    expect(incomeStatement.socialCharges).toBe(3769044);
  });

  it("depreciationAllocations = 4 351 533", () => {
    expect(incomeStatement.depreciationAllocations).toBe(4351533);
  });

  it("netResult = 177 197", () => {
    expect(incomeStatement.netResult).toBe(177197);
  });

  // ---- Bilan actif ----

  it("inventoriesGoods = 10 974 422", () => {
    expect(balanceSheet.inventoriesGoods).toBe(10974422);
  });

  it("tradeReceivables = 2 392 897", () => {
    expect(balanceSheet.tradeReceivables).toBe(2392897);
  });

  it("cashAndCashEquivalents = 1 501 392", () => {
    expect(balanceSheet.cashAndCashEquivalents).toBe(1501392);
  });

  it("totalAssets = 68 396 331", () => {
    expect(balanceSheet.totalAssets).toBe(68396331);
  });

  // ---- Bilan passif ----

  it("equity = 43 287 190", () => {
    expect(balanceSheet.equity).toBe(43287190);
  });

  it("tradePayables = 3 541 330", () => {
    expect(balanceSheet.tradePayables).toBe(3541330);
  });

  it("taxSocialPayables = 3 205 299", () => {
    expect(balanceSheet.taxSocialPayables).toBe(3205299);
  });

  it("debts (totalLiabilities) = 24 903 549", () => {
    expect(balanceSheet.debts).toBe(24903549);
  });
});
