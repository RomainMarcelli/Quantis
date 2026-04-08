import { describe, expect, it } from "vitest";
import { detectFinancialSections, extractFinancialData, type DocumentAIResponse } from "@/services/pdfAnalysis";

describe("extractFinancialData", () => {
  it("extrait les champs financiers depuis un rawText comptable", () => {
    const sampleDocument: DocumentAIResponse = {
      rawText: [
        "COMPTE DE RESULTAT",
        "Ventes de marchandises 1 234 567",
        "Production vendue 2 345 678",
        "Total produits 3 580 245",
        "Total charges 4 123 456",
        "Resultat net (543 211)",
        "",
        "BILAN",
        "ACTIF",
        "TOTAL ACTIF 9 876 543",
        "PASSIF",
        "Capitaux propres 1 111 222",
        "Dettes 8 765 321"
      ].join("\n"),
      pages: [],
      tables: []
    };

    const sections = detectFinancialSections(sampleDocument);
    const parsed = extractFinancialData(sampleDocument);

    expect(sections).toEqual({
      incomeStatement: true,
      balanceSheet: true
    });
    expect(parsed).toEqual({
      incomeStatement: {
        revenue: 1234567,
        production: 2345678,
        totalProducts: 3580245,
        totalCharges: 4123456,
        netResult: -543211
      },
      balanceSheet: {
        totalAssets: 9876543,
        equity: 1111222,
        debts: 8765321
      }
    });
  });

  it("utilise le fallback pages si rawText est vide", () => {
    const sampleDocument: DocumentAIResponse = {
      rawText: "",
      pages: [
        {
          text: "BILAN\nTOTAL ACTIF 1 200 000\nCapitaux propres 700 000\nDettes 500 000"
        }
      ],
      tables: []
    };

    const parsed = extractFinancialData(sampleDocument);

    expect(parsed.balanceSheet.totalAssets).toBe(1200000);
    expect(parsed.balanceSheet.equity).toBe(700000);
    expect(parsed.balanceSheet.debts).toBe(500000);
  });

  it("retourne null si aucun champ n'est detecte et ne crash pas", () => {
    const sampleDocument: DocumentAIResponse = {
      rawText: "Document sans donnees financieres exploitables.",
      pages: [],
      tables: []
    };

    const parsed = extractFinancialData(sampleDocument);

    expect(parsed).toEqual({
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
    });
  });

  it("extrait une valeur quand le montant est sur la ligne suivante", () => {
    const sampleDocument: DocumentAIResponse = {
      rawText: [
        "COMPTE DE RESULTAT",
        "Resultat net",
        "(2 657 615)",
        "BILAN",
        "Capitaux propres",
        "1 234 000"
      ].join("\n"),
      pages: [],
      tables: []
    };

    const parsed = extractFinancialData(sampleDocument);

    expect(parsed.incomeStatement.netResult).toBe(-2657615);
    expect(parsed.balanceSheet.equity).toBe(1234000);
  });
});
