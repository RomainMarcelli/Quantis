import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeFinancialDocument, type DocumentAIResponse } from "@/services/pdfAnalysis";
import { mapParsedFinancialDataToMappedFinancialData } from "@/services/mapping/parsedFinancialDataBridge";
import { computeKpis } from "@/services/kpiEngine";
import { detectDocumentFormat } from "@/services/pdf-analysis/formatDetector";

// Test d'intégration TROIS V SARL — format Sage (logiciel comptable).
//
// État après Lot 7D (pipeline Sage complet) :
//   - Détection format "sage" → routing vers analyzeDocumentSage()
//   - Extraction CDR via labelDictionarySage + rowReconstructionSage
//   - Extraction bilan actif via SAGE_BILAN_ACTIF_LABELS + terminators
//   - Extraction bilan passif via SAGE_BILAN_PASSIF_LABELS + handler
//     spécialisé pour la section capitaux propres (Capital/Rés. légale/RAN)
//
// Valeurs réelles du PDF TROIS V (inspection manuelle par l'utilisateur,
// source : images du PDF + analyse rawText) :
//
//   -- BILAN ACTIF Net (N) 28/02/2025 --
//   immob_incorp     = 89 587    (TOTAL immobilisations incorporelles)
//   immob_corp       = 2 122     (TOTAL immobilisations corporelles)
//   immob_fin        = 0         (TOTAL immobilisations financières)
//   total_actif_immo = 91 708    (ACTIF IMMOBILISÉ)
//   stocks_march     = 69 725
//   clients          = 196
//   autres_creances  = 2 117
//   dispo            = 6 664
//   cca              = 4 125
//   total_actif_circ = 82 827    (ACTIF CIRCULANT)
//   total_actif      = 174 535   (TOTAL GÉNÉRAL)
//
//   -- BILAN PASSIF Net (N) 28/02/2025 --
//   capital          = 21 600
//   reserve_legale   = 800
//   ran              = -225 190
//   resultat_exercice = -8 700
//   total_cp         = -211 490
//   emprunts         = 38 303 + 5 597 = 43 900 (total dettes financières)
//   fournisseurs     = 324 052
//   dettes_fisc_soc  = 18 072
//   total_dettes     = 386 025   (DETTES)
//   total_passif     = 174 535   (TOTAL GÉNÉRAL — équilibre avec actif)
//
//   -- CDR Net (N) 28/02/2025 --
//   ventes_march       = 255 475
//   prod_serv          = 7 643
//   ca (netTurnover)   = 263 118
//   autres_prod_expl   = 99      (Autres produits)
//   total_prod_expl    = 263 218 (PRODUITS D'EXPLOITATION)
//   achats_march       = 124 850
//   var_stock_march    = -5 126
//   ace                = 74 788  (Autres achats et charges externes)
//   impots_taxes       = 2 626
//   salaires           = 54 719
//   charges_soc        = 18 726
//   dap                = 591
//   autres_charges_expl = 101
//   total_charges_expl = 271 274 (CHARGES D'EXPLOITATION)
//   resultat_expl      = -8 057  (RÉSULTAT D'EXPLOITATION)
//   charges_fin        = 899
//   resultat_financier = -899
//   prod_excep         = 12 756
//   charges_excep      = 12 500
//   resultat_excep     = 256
//   total_produits     = 275 974
//   total_charges      = 284 673
//   netResult          = -8 700

function loadTroisVFixture(): DocumentAIResponse {
  const fixturePath = join(process.cwd(), "services/pdf-analysis/fixtures/troisv-docai.json");
  const raw = readFileSync(fixturePath, "utf8");
  return JSON.parse(raw) as DocumentAIResponse;
}

describe("TROIS V integration — BEFORE_SAGE_SUPPORT baseline", () => {
  const document = loadTroisVFixture();
  const analysis = analyzeFinancialDocument(document);
  const mapped = mapParsedFinancialDataToMappedFinancialData(analysis.parsedFinancialData);
  const kpis = computeKpis(mapped);

  it("la fixture TROIS V est bien détectée comme format 'sage'", () => {
    expect(detectDocumentFormat(document.rawText)).toBe("sage");
  });

  // ---- LOT 7B — CDR Sage ----

  it("[Lot 7B] extrait les produits d'exploitation", () => {
    expect(mapped.ventes_march).toBe(255475);
    expect(mapped.prod_serv).toBe(7643);
    expect(mapped.prod_vendue).toBe(7643); // somme via bridge (prod_biens=null, prod_serv=7643)
    expect(mapped.autres_prod_expl).toBe(99);
    expect(mapped.total_prod_expl).toBe(263218);
  });

  it("[Lot 7B] netTurnover extrait directement (Chiffres d'affaires nets)", () => {
    expect(analysis.parsedFinancialData.incomeStatement.netTurnover).toBe(263118);
  });

  it("[Lot 7B] extrait les charges d'exploitation", () => {
    expect(mapped.achats_march).toBe(124850); // Achats de marchandises
    expect(mapped.var_stock_march).toBe(-5126); // Variation de stock marchandises
    expect(mapped.ace).toBe(74788); // externalCharges — Autres achats et charges externes
    expect(mapped.impots_taxes).toBe(2626);
    expect(mapped.salaires).toBe(54719); // pas 50963 (N-1) — bug layout résolu
    expect(mapped.charges_soc).toBe(18726); // pas 14504 (N-1) — bug layout résolu
    expect(mapped.dap).toBe(591);
    expect(mapped.autres_charges_expl).toBe(101);
    expect(mapped.total_charges_expl).toBe(271274);
  });

  it("[Lot 7B] extrait les résultats (exploitation, financier, courant, exceptionnel)", () => {
    const is = analysis.parsedFinancialData.incomeStatement;
    expect(is.operatingResult).toBe(-8057); // RÉSULTAT D'EXPLOITATION
    expect(is.financialResult).toBe(-899); // RÉSULTAT FINANCIER
    expect(is.ordinaryResultBeforeTax).toBe(-8956); // RÉSULTAT COURANT AVANT IMPOTS
    expect(is.exceptionalResult).toBe(256); // RÉSULTAT EXCEPTIONNEL
  });

  it("[Lot 7B] extrait les totaux et le résultat net", () => {
    expect(analysis.parsedFinancialData.incomeStatement.totalProducts).toBe(275974);
    expect(mapped.resultat_exercice).toBe(-8700); // BÉNÉFICE OU PERTE (négatif = perte)
  });

  it("[Lot 7B] KPI ca correctement calculé", () => {
    expect(kpis.ca).toBe(263118); // ventes_march + prod_vendue = 255475 + 7643
  });

  // ---- LOT 7C — Bilan actif Sage ----
  //
  // Les valeurs cibles sont celles réellement imprimées dans le PDF TROIS V
  // page 4 (Bilan Actif) colonne Net (N) au 28/02/2025. NB : certains targets
  // initiaux dans le brief Lot 7C étaient erronés (confusion avec Net (N-1)
  // ou mauvais row). Les valeurs ci-dessous sont les vraies du PDF.

  it("[Lot 7C] extrait l'actif immobilisé (ACTIF IMMOBILISÉ total)", () => {
    // ACTIF IMMOBILISÉ row agrège incorp (89 587) + corp (2 122) + fin (0)
    expect(mapped.total_actif_immo).toBe(91708);
  });

  it("[Lot 7C] extrait l'actif circulant détail (Stocks/Créances/Disponibilités)", () => {
    expect(mapped.stocks_march).toBe(69725); // Stocks de marchandises
    expect(mapped.clients).toBe(196); // Créances clients et comptes rattachés
    expect(mapped.autres_creances).toBe(2117); // Autres créances
    expect(mapped.dispo).toBe(6664); // Disponibilités
    expect(mapped.cca).toBe(4125); // Charges constatées d'avance
  });

  it("[Lot 7C] extrait le total actif circulant (ACTIF CIRCULANT)", () => {
    expect(mapped.total_actif_circ).toBe(82827);
  });

  it("[Lot 7C] extrait le total général actif (TOTAL GÉNÉRAL)", () => {
    expect(mapped.total_actif).toBe(174535);
  });

  it("[Lot 7C] bilan actif équilibré : total_actif_immo + total_actif_circ = total_actif", () => {
    const sum = (mapped.total_actif_immo ?? 0) + (mapped.total_actif_circ ?? 0);
    expect(sum).toBe(mapped.total_actif);
    expect(sum).toBe(174535);
  });

  // ---- LOT 7D — Bilan passif Sage ----

  it("[Lot 7D] extrait les capitaux propres détail (handler spécialisé)", () => {
    expect(mapped.capital).toBe(21600); // Capital social via "dont versé" anchor
    expect(mapped.reserve_legale).toBe(800); // Réserve légale via 2e pair positive block
    expect(mapped.ran).toBe(-225190); // Report à nouveau via 1re valeur négative block
  });

  it("[Lot 7D] extrait le total capitaux propres (CAPITAUX PROPRES linéaire)", () => {
    expect(mapped.total_cp).toBe(-211490);
  });

  it("[Lot 7D] extrait les dettes (emprunts/fournisseurs/fiscales)", () => {
    expect(mapped.emprunts).toBe(43900); // TOTAL dettes financières (linéaire)
    expect(mapped.fournisseurs).toBe(324052); // Dettes fournisseurs (row-major V=2*L)
    expect(mapped.dettes_fisc_soc).toBe(18072); // Dettes fiscales et sociales (row-major)
  });

  it("[Lot 7D] extrait le grand total dettes et le total général passif", () => {
    expect(mapped.total_dettes).toBe(386025); // DETTES label (grand total)
    expect(mapped.total_passif).toBe(174535); // TOTAL GÉNÉRAL scopé passif
  });

  it("[Lot 7D] bilan équilibré : actif = passif = equity + provisions + debts", () => {
    const equity = mapped.total_cp ?? 0;
    const provisions = mapped.total_prov ?? 0;
    const debts = mapped.total_dettes ?? 0;
    expect(equity + provisions + debts).toBe(mapped.total_passif);
    expect(mapped.total_actif).toBe(mapped.total_passif);
    expect(mapped.total_actif).toBe(174535);
  });

});
