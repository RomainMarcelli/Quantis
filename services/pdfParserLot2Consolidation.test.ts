import { describe, expect, it } from "vitest";
import { analyzeFinancialDocument, type DocumentAIResponse } from "@/services/pdfAnalysis";
import { mapParsedFinancialDataToMappedFinancialData } from "@/services/mapping/parsedFinancialDataBridge";
import { computeKpis } from "@/services/kpiEngine";

// ---------------------------------------------------------------------------
// Lot 2 consolidation tests
//
// Objectives:
//   - ca_n_minus_1 extracted from N-1 column → tcam unblocked
//   - Capitaux propres sub-fields extracted (capital, RAN, reserves, etc.)
//   - Income statement missing fields: productionStored, productionCapitalized,
//     operatingSubsidies, associatesCurrentAccounts
//
// Sample format mirrors a simplified 2033-SD with two amount columns (N, N-1).
// Line codes are embedded to help fieldResolver score candidates.
// ---------------------------------------------------------------------------

describe("pdf parser lot 2 consolidation — ca_n_minus_1 + capitaux propres", () => {
  it("extracts ca_n_minus_1 and unblocks tcam", () => {
    const sample: DocumentAIResponse = {
      rawText: [
        "COMPTE DE RESULTAT",
        // salesGoods sur une seule colonne pour éviter l'ambiguïté N / N-1
        "Ventes de marchandises 209 1 500 000",
        // Ligne CA nets avec deux colonnes : N (colonne gauche) et N-1 (colonne droite)
        // nMinus1 strategy → sélectionne la dernière valeur = 1 200 000
        "Chiffres d'affaires nets 210 1 500 000 1 200 000",
        "Achats de marchandises 234 900 000",
        "Autres charges externes 242 200 000",
        "Salaires et traitements 250 150 000",
        "Charges sociales 252 60 000",
        "Dotations aux amortissements 254 40 000",
        "Total des charges d'exploitation 264 1 350 000",
        "Resultat net 310 120 000"
      ].join("\n"),
      pages: [],
      tables: []
    };

    const analysis = analyzeFinancialDocument(sample);
    const parsed = analysis.parsedFinancialData;
    const mapped = mapParsedFinancialDataToMappedFinancialData(parsed);
    const kpis = computeKpis(mapped);

    // CA N extrait (colonne unique → pas d'ambiguïté)
    expect(parsed.incomeStatement.salesGoods).toBe(1_500_000);

    // CA N-1 extrait via stratégie nMinus1
    expect(parsed.incomeStatement.netTurnoverPreviousYear).toBe(1_200_000);
    expect(mapped.ca_n_minus_1).toBe(1_200_000);

    // tcam débloqué : (1_500_000 / 1_200_000 - 1) * 100 = 25
    expect(kpis.tcam).toBe(25);
  });

  it("extracts capitaux propres sub-fields (capital, ran, reserves)", () => {
    const sample: DocumentAIResponse = {
      rawText: [
        "BILAN PASSIF",
        "Capital social ou individuel 120 500 000",
        "Ecarts de reevaluation 124 10 000",
        "Reserve legale 126 50 000",
        "Reserves reglementees 130 20 000",
        "Autres reserves 132 80 000",
        "Report a nouveau 134 -15 000",
        "Subventions d'investissement 137 30 000",
        "Provisions reglementees 140 5 000",
        "Total I - Capitaux propres 142 680 000",
        "",
        "Emprunts et dettes assimilees 156 300 000",
        "Dettes fournisseurs et comptes rattaches 166 120 000",
        "Dettes fiscales et sociales 172 80 000",
        "Comptes courants d'associes 173 40 000",
        "Autres dettes 175 25 000",
        "Total dettes 176 565 000",
        "Total passif 180 1 245 000"
      ].join("\n"),
      pages: [],
      tables: []
    };

    const analysis = analyzeFinancialDocument(sample);
    const parsed = analysis.parsedFinancialData;
    const mapped = mapParsedFinancialDataToMappedFinancialData(parsed);

    // Capitaux propres détail
    expect(parsed.balanceSheet.shareCapital).toBe(500_000);
    expect(parsed.balanceSheet.revaluationDifferences).toBe(10_000);
    expect(parsed.balanceSheet.legalReserves).toBe(50_000);
    expect(parsed.balanceSheet.regulatoryReserves).toBe(20_000);
    expect(parsed.balanceSheet.otherReserves).toBe(80_000);
    expect(parsed.balanceSheet.retainedEarnings).toBe(-15_000);
    expect(parsed.balanceSheet.investmentSubsidies).toBe(30_000);
    expect(parsed.balanceSheet.regulatoryProvisions).toBe(5_000);
    expect(parsed.balanceSheet.equity).toBe(680_000);

    // Comptes courants d'associés (cca_passif)
    expect(parsed.balanceSheet.associatesCurrentAccounts).toBe(40_000);

    // Bridge MappedFinancialData
    expect(mapped.capital).toBe(500_000);
    expect(mapped.ecarts_reeval).toBe(10_000);
    expect(mapped.reserve_legale).toBe(50_000);
    expect(mapped.reserves_reglem).toBe(20_000);
    expect(mapped.autres_reserves).toBe(80_000);
    expect(mapped.ran).toBe(-15_000);
    expect(mapped.subv_invest).toBe(30_000);
    expect(mapped.prov_reglem).toBe(5_000);
    expect(mapped.total_cp).toBe(680_000);
    expect(mapped.cca_passif).toBe(40_000);
  });

  it("extracts missing income statement fields (productionStored, productionCapitalized, operatingSubsidies)", () => {
    const sample: DocumentAIResponse = {
      rawText: [
        "COMPTE DE RESULTAT",
        "Production vendue de biens 215 800 000",
        "Production vendue de services 217 200 000",
        "Production stockee 222 15 000",
        "Production immobilisee 224 25 000",
        "Subventions d'exploitation 226 10 000",
        "Total des produits d'exploitation 232 1 050 000",
        "Autres charges externes 242 150 000",
        "Salaires et traitements 250 200 000",
        "Charges sociales 252 80 000",
        "Dotations aux amortissements 254 50 000",
        "Total des charges d'exploitation 264 480 000",
        "Resultat net 310 570 000"
      ].join("\n"),
      pages: [],
      tables: []
    };

    const analysis = analyzeFinancialDocument(sample);
    const parsed = analysis.parsedFinancialData;
    const mapped = mapParsedFinancialDataToMappedFinancialData(parsed);

    // Nouveaux champs compte de résultat
    expect(parsed.incomeStatement.productionStored).toBe(15_000);
    expect(parsed.incomeStatement.productionCapitalized).toBe(25_000);
    expect(parsed.incomeStatement.operatingSubsidies).toBe(10_000);

    // Bridge
    expect(mapped.prod_stockee).toBe(15_000);
    expect(mapped.prod_immo).toBe(25_000);
    expect(mapped.subv_expl).toBe(10_000);
  });
});
