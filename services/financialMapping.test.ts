import { describe, expect, it } from "vitest";
import { mapToQuantisData } from "@/services/financialMapping";
import type { ParsedFinancialData } from "@/services/pdfAnalysis";

describe("mapToQuantisData", () => {
  it("mappe les donnees financieres vers le format Quantis", () => {
    const sampleFinancialData: ParsedFinancialData = {
      incomeStatement: {
        revenue: 700000,
        production: 500000,
        totalProducts: 1200000,
        totalCharges: 900000,
        netResult: 300000
      },
      balanceSheet: {
        totalAssets: 5000000,
        equity: 2000000,
        debts: 3000000
      }
    };

    expect(mapToQuantisData(sampleFinancialData)).toEqual({
      ca: 1200000,
      totalCharges: 900000,
      netResult: 300000,
      totalAssets: 5000000,
      equity: 2000000,
      debts: 3000000
    });
  });

  it("utilise la valeur disponible si revenue ou production est manquant", () => {
    const sampleFinancialData: ParsedFinancialData = {
      incomeStatement: {
        revenue: null,
        production: 450000,
        totalProducts: null,
        totalCharges: null,
        netResult: null
      },
      balanceSheet: {
        totalAssets: null,
        equity: null,
        debts: null
      }
    };

    expect(mapToQuantisData(sampleFinancialData).ca).toBe(450000);
  });

  it("retourne null sur les champs absents", () => {
    const sampleFinancialData: ParsedFinancialData = {
      incomeStatement: {
        revenue: null,
        production: null,
        totalProducts: null,
        totalCharges: null,
        netResult: null
      },
      balanceSheet: {
        totalAssets: null,
        equity: null,
        debts: null
      }
    };

    expect(mapToQuantisData(sampleFinancialData)).toEqual({
      ca: null,
      totalCharges: null,
      netResult: null,
      totalAssets: null,
      equity: null,
      debts: null
    });
  });
});
