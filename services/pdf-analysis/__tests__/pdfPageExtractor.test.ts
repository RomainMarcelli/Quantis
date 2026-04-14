import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  extractFinancialPages,
  isFinanciallyUsefulPage
} from "@/services/pdf-analysis/pdfPageExtractor";

async function makePdfWithTextPages(pageTexts: readonly string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pageTexts) {
    const page = doc.addPage([595, 842]);
    page.drawText(text, { x: 50, y: 750, size: 12, font });
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

describe("pdfPageExtractor — isFinanciallyUsefulPage", () => {
  it("garde une page avec BILAN ACTIF", () => {
    expect(isFinanciallyUsefulPage("BILAN ACTIF ventes de marchandises 100")).toBe(true);
  });

  it("garde une page avec compte de résultat", () => {
    expect(isFinanciallyUsefulPage("Compte de resultat total des produits 500")).toBe(true);
  });

  it("exclut une page avec rapport du commissaire aux comptes", () => {
    expect(
      isFinanciallyUsefulPage("Rapport du commissaire aux comptes Opinion sur l audit")
    ).toBe(false);
  });

  it("exclut une page avec opinion + audit", () => {
    expect(
      isFinanciallyUsefulPage("Notre opinion sur la mission d audit legal annuel")
    ).toBe(false);
  });

  it("exclut une page répartition des effectifs", () => {
    expect(isFinanciallyUsefulPage("Repartition des effectifs par categorie")).toBe(false);
  });

  it("exclut une page sans marqueur positif", () => {
    expect(isFinanciallyUsefulPage("Page blanche sans contenu financier")).toBe(false);
  });

  it("garde une page avec 3 codes 2033-SD", () => {
    expect(isFinanciallyUsefulPage("ligne 209 ligne 232 ligne 264 total")).toBe(true);
  });

  it("ne garde pas une page avec seulement 2 codes 2033-SD", () => {
    expect(isFinanciallyUsefulPage("ligne 209 ligne 232 rapport annuel")).toBe(false);
  });
});

describe("pdfPageExtractor — extractFinancialPages", () => {
  it("garde uniquement les pages financières dans un PDF 3 pages", async () => {
    const pdf = await makePdfWithTextPages([
      "Rapport du commissaire aux comptes Opinion sur l audit",
      "BILAN ACTIF ventes de marchandises 100",
      "Repartition des effectifs par categorie"
    ]);

    const result = await extractFinancialPages(pdf);

    expect(result.originalPages).toBe(3);
    expect(result.extractedPages).toBe(1);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("fallback sur PDF original si aucune page financière détectée", async () => {
    const pdf = await makePdfWithTextPages([
      "Rapport du commissaire aux comptes Opinion sur l audit",
      "Repartition des effectifs"
    ]);

    const result = await extractFinancialPages(pdf);

    expect(result.originalPages).toBe(2);
    expect(result.extractedPages).toBe(2);
    expect(result.buffer).toBe(pdf);
  });

  it("garde toutes les pages si toutes sont financières", async () => {
    const pdf = await makePdfWithTextPages([
      "BILAN ACTIF ventes de marchandises",
      "BILAN PASSIF capitaux propres",
      "Compte de resultat total des produits"
    ]);

    const result = await extractFinancialPages(pdf);

    expect(result.originalPages).toBe(3);
    expect(result.extractedPages).toBe(3);
  });
});
