import { describe, expect, it } from "vitest";
import { aggregateTrialBalanceToParsedFinancialData } from "@/services/integrations/aggregations/trialBalanceAggregator";
import { fixtureEdgeCases } from "@/services/integrations/aggregations/__tests__/fixtures";
import type { NormalizedTrialBalanceEntry } from "@/types/connectors";

function tb(
  accountNumber: string,
  debit: number,
  credit: number,
  label = ""
): NormalizedTrialBalanceEntry {
  return {
    accountNumber,
    accountLabel: label,
    formattedNumber: null,
    debit,
    credit,
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
  };
}

describe("trialBalanceAggregator", () => {
  it("agrège un trial balance simple en P&L + bilan corrects", () => {
    const trialBalance: NormalizedTrialBalanceEntry[] = [
      tb("701", 0, 10000, "Ventes"),
      tb("607", 4000, 0, "Achats"),
      tb("411", 12000, 0, "Clients"),
      tb("401", 0, 4800, "Fournisseurs"),
      tb("44571", 0, 2000, "TVA collectée"),
      tb("44566", 800, 0, "TVA déductible"),
      tb("101", 0, 50000, "Capital"),
      tb("164", 0, 20000, "Emprunt"),
      tb("512", 60000, 0, "Banque"),
    ];
    const result = aggregateTrialBalanceToParsedFinancialData(trialBalance);

    // P&L
    expect(result.incomeStatement.productionSoldGoods).toBe(10000);
    expect(result.incomeStatement.purchasesGoods).toBe(4000);
    expect(result.incomeStatement.netTurnover).toBe(10000);
    expect(result.incomeStatement.netResult).toBe(6000); // 10000 - 4000

    // Bilan
    expect(result.balanceSheet.tradeReceivables).toBe(12000);
    expect(result.balanceSheet.tradePayables).toBe(4800);
    expect(result.balanceSheet.shareCapital).toBe(50000);
    expect(result.balanceSheet.borrowings).toBe(20000);
    expect(result.balanceSheet.cashAndCashEquivalents).toBe(60000);
  });

  it("skip les comptes vides et les montants non finis sans crasher", () => {
    const { trialBalance } = fixtureEdgeCases();
    expect(() => aggregateTrialBalanceToParsedFinancialData(trialBalance)).not.toThrow();
    const result = aggregateTrialBalanceToParsedFinancialData(trialBalance);
    // Le compte 707 (500 crédit) doit être pris.
    expect(result.incomeStatement.salesGoods).toBe(500);
  });

  it("agrège les classes 4 par sous-préfixes (4456 vs 4457 vs 411 vs 401)", () => {
    const trialBalance: NormalizedTrialBalanceEntry[] = [
      tb("411100", 5000, 0),       // créance client
      tb("401000", 0, 3000),       // dette fournisseur
      tb("445660", 200, 0),        // TVA déductible (mappé liability dans notre PCG)
      tb("445710", 0, 400),        // TVA collectée
      tb("455100", 0, 1500),       // compte courant associés
    ];
    const result = aggregateTrialBalanceToParsedFinancialData(trialBalance);
    expect(result.balanceSheet.tradeReceivables).toBe(5000);
    expect(result.balanceSheet.tradePayables).toBe(3000);
    expect(result.balanceSheet.associatesCurrentAccounts).toBe(1500);
    // 44 prefix → taxSocialPayables (collectée 400 - déductible 200 net = 200)
    expect(result.balanceSheet.taxSocialPayables).toBe(200);
  });

  it("comptes hors mapping PCG sont silencieusement ignorés (pas de crash)", () => {
    const trialBalance: NormalizedTrialBalanceEntry[] = [
      tb("999000", 1000, 0, "Compte exotique"),
      tb("ABC123", 500, 0, "Numéro non standard"),
      tb("707", 0, 1000),
    ];
    const result = aggregateTrialBalanceToParsedFinancialData(trialBalance);
    expect(result.incomeStatement.salesGoods).toBe(1000);
    // Comptes non reconnus n'apparaissent pas dans le bilan : totalAssets reste à null
    // (aucun champ d'actif n'a été touché par les comptes 999/ABC).
    expect(result.balanceSheet.totalAssets).toBeNull();
  });

  it("préserve la cohérence equity = capital + résultat sur un cas équilibré", () => {
    const trialBalance: NormalizedTrialBalanceEntry[] = [
      tb("101", 0, 100000),     // capital
      tb("701", 0, 50000),      // ventes
      tb("607", 30000, 0),      // achats
      tb("411", 60000, 0),      // créances
      tb("401", 0, 36000),      // dettes
      tb("44571", 0, 10000),    // TVA collectée
      tb("44566", 6000, 0),     // TVA déductible
      tb("512", 80000, 0),      // banque
    ];
    const result = aggregateTrialBalanceToParsedFinancialData(trialBalance);
    // résultat = ventes - achats = 50000 - 30000 = 20000
    expect(result.incomeStatement.netResult).toBe(20000);
    // equity = capital (100000) + résultat (20000) = 120000
    expect(result.balanceSheet.equity).toBe(120000);
  });
});
