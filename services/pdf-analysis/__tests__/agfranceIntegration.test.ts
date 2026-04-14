import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeFinancialDocument, type DocumentAIResponse } from "@/services/pdfAnalysis";
import { mapParsedFinancialDataToMappedFinancialData } from "@/services/mapping/parsedFinancialDataBridge";
import { computeKpis } from "@/services/kpiEngine";
import { detectDocumentFormat } from "@/services/pdf-analysis/formatDetector";

// Test d'intégration AG FRANCE — formulaire DGFiP 2050/2051/2052/2053 scanné.
//
// État après Lot 6D (pipeline 2050 complet) :
//   - Détection format dgfip-2050 → routing vers analyzeDocument2050()
//   - CDR : codes F*/G*/H* résolus par proximité séquentielle
//   - Bilan passif : codes D*/E* résolus par proximité séquentielle
//   - Bilan actif : codes Brut/Amort résolus par triplet Net = dernière valeur
//     de la row (Net imprimé sans code dans le formulaire 2050)
//   - Score cible : 22/22 sur AG FRANCE + bilan équilibré (actif = passif)
//
// Valeurs réelles du PDF AG FRANCE (inspection manuelle par l'utilisateur) :
//   total_actif      = 8 117 151   total_actif_immo = 2 002 966
//   total_actif_circ = 6 114 185   stocks_march     = 1 081 271
//   clients          = 1 592       autres_creances  = 116 818
//   dispo            = 4 460 709   total_cp         = 2 834 819
//   fournisseurs     = 4 399 190   dettes_fisc_soc  = 782 062
//   total_dettes     = 5 274 832   ventes_march     = 16 047 882
//   prod_serv        = 16 652      ca               = 16 064 535
//   ace              = 2 676 202   salaires         = 1 693 936
//   charges_soc      = 321 501     dap              = 184 107
//   total_charges_expl = 14 462 819  netResult      = 1 173 877
//   prod_excep       = 2 603       charges_excep    = 57 906

function loadAgFranceFixture(): DocumentAIResponse {
  const fixturePath = join(process.cwd(), "services/pdf-analysis/fixtures/agfrance-docai.json");
  const raw = readFileSync(fixturePath, "utf8");
  return JSON.parse(raw) as DocumentAIResponse;
}

describe("AG FRANCE integration — BEFORE_2050_SUPPORT baseline", () => {
  const document = loadAgFranceFixture();
  const analysis = analyzeFinancialDocument(document);
  const mapped = mapParsedFinancialDataToMappedFinancialData(analysis.parsedFinancialData);
  const kpis = computeKpis(mapped);

  it("la fixture AG FRANCE est bien détectée comme format 'dgfip-2050'", () => {
    expect(detectDocumentFormat(document.rawText)).toBe("dgfip-2050");
  });

  // ---- LOT 6B — CDR 2050 (tous les champs critiques du compte de résultat) ----

  it("[Lot 6B] extrait les produits d'exploitation (codes F*)", () => {
    expect(mapped.ventes_march).toBe(16047882); // FA/FC
    expect(mapped.prod_serv).toBe(16652); // FG/FI
    expect(mapped.prod_vendue).toBe(16652); // somme via bridge
    expect(mapped.subv_expl).toBe(31000); // FO
    expect(mapped.autres_prod_expl).toBe(8559); // FQ
    expect(mapped.total_prod_expl).toBe(16107315); // FR
  });

  it("[Lot 6B] netTurnover (FJ/FL) directement extrait", () => {
    const parsed = analysis.parsedFinancialData;
    expect(parsed.incomeStatement.netTurnover).toBe(16064535);
  });

  it("[Lot 6B] extrait les charges d'exploitation (codes F*/G*)", () => {
    expect(mapped.achats_march).toBe(9924835); // FS
    expect(mapped.ace).toBe(2676202); // FW
    expect(mapped.impots_taxes).toBe(97661); // FX
    expect(mapped.salaires).toBe(1693936); // FY
    expect(mapped.charges_soc).toBe(321501); // FZ
    expect(mapped.dap).toBe(184107); // GA
    expect(mapped.autres_charges_expl).toBe(54114); // GE
    expect(mapped.total_charges_expl).toBe(14462819); // GF
  });

  it("[Lot 6B] extrait le résultat exceptionnel (codes H*)", () => {
    expect(mapped.prod_excep).toBe(2603); // HD
    expect(mapped.charges_excep).toBe(57906); // HH
  });

  it("[Lot 6B] extrait le résultat net (HN)", () => {
    expect(mapped.resultat_exercice).toBe(1173877);
  });

  it("[Lot 6B] KPI CA calculé via ventes_march + prod_vendue", () => {
    // Écart de 1€ avec FJ/FL (16064535) : intrinsèque au PDF (arrondi interne
    // entre la somme des colonnes FA+FG et le total déclaré FJ). Le champ
    // netTurnover lui-même est bien extrait à 16064535.
    expect(kpis.ca).toBe(16064534);
  });

  // ---- LOT 6C — bilan passif 2050 ----

  it("[Lot 6C] extrait les capitaux propres (codes D*)", () => {
    expect(mapped.capital).toBe(25000); // DA
    expect(mapped.reserve_legale).toBe(2500); // DD
    expect(mapped.ran).toBe(1633441); // DH
    expect(mapped.total_cp).toBe(2834819); // DL — TOTAL (I)
  });

  it("[Lot 6C] extrait les provisions (DP / DR)", () => {
    expect(mapped.total_prov).toBe(7500); // DR TOTAL (III), préféré sur DP via "total"
  });

  it("[Lot 6C] extrait les dettes (codes D*/E*)", () => {
    expect(mapped.emprunts).toBe(49304); // DU
    expect(mapped.fournisseurs).toBe(4399190); // DX
    expect(mapped.dettes_fisc_soc).toBe(782062); // DY
    expect(mapped.autres_dettes).toBe(38); // EA
    expect(mapped.pca).toBe(44236); // EB
    expect(mapped.total_dettes).toBe(5274832); // EC — TOTAL (IV)
  });

  it("[Lot 6C] extrait le total général passif (EE)", () => {
    expect(mapped.total_passif).toBe(8117151); // EE — TOTAL GÉNÉRAL (I à V)
  });

  it("[Lot 6C] cohérence : equity + provisions + debts = totalLiabilities", () => {
    const sum = (mapped.total_cp ?? 0) + (mapped.total_prov ?? 0) + (mapped.total_dettes ?? 0);
    expect(sum).toBe(mapped.total_passif);
  });

  // ---- LOT 6D — bilan actif 2050 ----

  it("[Lot 6D] extrait l'actif immobilisé (AH/AT/BH/BJ)", () => {
    expect(mapped.immob_incorp).toBe(25000); // AH — Fonds commercial
    expect(mapped.immob_corp).toBe(1576866); // AT/AU — triplet 3 valeurs
    expect(mapped.immob_fin).toBe(401099); // BH/BI — triplet 2 valeurs
    expect(mapped.total_actif_immo_brut).toBe(2687750); // BJ — Brut
    expect(mapped.total_actif_immo).toBe(2002966); // BJ/BK — Net
  });

  it("[Lot 6D] extrait l'actif circulant (BT..CJ)", () => {
    expect(mapped.stocks_march).toBe(1081271); // BT
    expect(mapped.clients).toBe(1592); // BX
    expect(mapped.autres_creances).toBe(116818); // BZ
    expect(mapped.dispo).toBe(4460709); // CF
    expect(mapped.cca).toBe(453793); // CH
    expect(mapped.total_actif_circ).toBe(6114185); // CJ
  });

  it("[Lot 6D] extrait le total général actif (CO/1A)", () => {
    expect(mapped.total_actif).toBe(8117151); // CO/1A — triplet 3 valeurs
  });

  it("[Lot 6D] bilan équilibré : total_actif = total_passif", () => {
    expect(mapped.total_actif).toBe(mapped.total_passif);
    expect(mapped.total_actif).toBe(8117151);
  });
});
