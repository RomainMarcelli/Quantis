import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeFinancialDocument, type DocumentAIResponse } from "@/services/pdfAnalysis";
import { detectDocumentFormat } from "@/services/pdf-analysis/formatDetector";

// Test d'intégration RIP CURL EUROPE SAS — format Regnology (logiciel comptable).
//
// Layout Regnology :
//   - Bilan actif  : 4 colonnes (Brut | Amort | Net N | Net N-1) → index 2
//   - Bilan passif : 2 colonnes (N | N-1) → index 0
//   - CDR          : 2 colonnes (N | N-1) → index 0
//
// Valeurs de référence extraites du PDF (source de vérité user) :
//
//   -- BILAN ACTIF Net (N) --
//   total_actif        = 66 101 267
//   total_actif_immo   = 19 622 456
//   total_actif_circ   = 45 882 383
//   stocks_march       = 10 814 279
//   clients            = 13 319 261
//   autres_creances    = 16 913 062
//   dispo              =  3 681 968
//
//   -- BILAN PASSIF N --
//   total_cp           = 42 638 397
//   total_dettes       = 21 726 778
//   fournisseurs       = 13 411 386
//   dettes_fisc_soc    =  2 638 994
//
//   -- CDR N --
//   ventes_march       = 49 919 067
//   prod_vendue        =    156 076
//   ca (netTurnover)   = 50 075 143
//   ace                = 14 763 074
//   salaires           =  6 599 527
//   charges_soc        =  2 696 790
//   dap                =  1 006 042
//   total_charges_expl = 53 876 562
//   prod_excep         =    176 034
//   charges_excep      =     19 763
//   netResult          =  1 201 318

function loadRipCurlFixture(): DocumentAIResponse {
  const fixturePath = join(process.cwd(), "services/pdf-analysis/fixtures/ripcurl-docai.json");
  const raw = readFileSync(fixturePath, "utf8");
  return JSON.parse(raw) as DocumentAIResponse;
}

describe("RIP CURL EUROPE — Format Regnology", () => {
  const document = loadRipCurlFixture();
  const analysis = analyzeFinancialDocument(document);
  const { incomeStatement, balanceSheet } = analysis.parsedFinancialData;

  it("la fixture RIP CURL est bien détectée comme format 'regnology'", () => {
    expect(detectDocumentFormat(document.rawText)).toBe("regnology");
  });

  // ---- Bilan actif ----

  it("total_actif = 66 101 267 (TOTAL GENERAL DE L'ACTIF)", () => {
    expect(balanceSheet.totalAssets).toBe(66101267);
  });

  it("total_actif_immo = 19 622 456 (TOTAL ACTIF IMMOBILISE colonne Net N)", () => {
    expect(balanceSheet.totalFixedAssets).toBe(19622456);
  });

  it("stocks_march = 10 814 279 (Marchandises colonne Net N)", () => {
    expect(balanceSheet.inventoriesGoods).toBe(10814279);
  });

  it("clients = 13 319 261 (Créances clients colonne Net N)", () => {
    expect(balanceSheet.tradeReceivables).toBe(13319261);
  });

  // ---- CDR ----

  it("ca = 50 075 143 (Montant net du chiffre d'affaires)", () => {
    expect(incomeStatement.netTurnover).toBe(50075143);
  });

  it("netResult = 1 201 318 (BENEFICE OU PERTE)", () => {
    expect(incomeStatement.netResult).toBe(1201318);
  });

  // ---- Bilan passif ----

  it("fournisseurs = 13 411 386 (Dettes fournisseurs colonne N)", () => {
    expect(balanceSheet.tradePayables).toBe(13411386);
  });

  it("dettes_fisc_soc = 2 638 994 (Dettes fiscales et sociales colonne N)", () => {
    expect(balanceSheet.taxSocialPayables).toBe(2638994);
  });
});
