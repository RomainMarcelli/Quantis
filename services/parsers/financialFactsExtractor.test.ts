import { describe, expect, it } from "vitest";
import {
  extractFinancialFactsFromRows,
  extractFinancialFactsFromText,
  mergeFinancialFacts
} from "@/services/parsers/financialFactsExtractor";

describe("extractFinancialFactsFromRows", () => {
  it("extracts financial facts from structured rows", () => {
    const { facts } = extractFinancialFactsFromRows([
      { poste: "Chiffre d'affaires", montant: "3 500 000" },
      { poste: "Charges", montant: "2 100 000" },
      { poste: "Tresorerie", montant: "145 000" },
      { poste: "Stocks", montant: "142 000" }
    ]);

    expect(facts.revenue).toBe(3500000);
    expect(facts.expenses).toBe(2100000);
    expect(facts.treasury).toBe(145000);
    expect(facts.inventory).toBe(142000);
  });
});

describe("extractFinancialFactsFromText", () => {
  it("extracts numeric values from PDF text snippets", () => {
    const text = `
      Chiffre d'affaires: 3 500 000 EUR
      Charges: 2 100 000 EUR
      Tresorerie: 145 000 EUR
    `;

    const { facts } = extractFinancialFactsFromText(text);
    expect(facts.revenue).toBe(3500000);
    expect(facts.expenses).toBe(2100000);
    expect(facts.treasury).toBe(145000);
  });
});

describe("mergeFinancialFacts", () => {
  it("merges multiple fact objects by summing existing values", () => {
    const merged = mergeFinancialFacts([
      {
        revenue: 100,
        expenses: 40,
        payroll: null,
        treasury: 10,
        receivables: null,
        payables: null,
        inventory: null
      },
      {
        revenue: 200,
        expenses: 60,
        payroll: 20,
        treasury: 5,
        receivables: 15,
        payables: 4,
        inventory: 7
      }
    ]);

    expect(merged).toEqual({
      revenue: 300,
      expenses: 100,
      payroll: 20,
      treasury: 15,
      receivables: 15,
      payables: 4,
      inventory: 7
    });
  });
});

