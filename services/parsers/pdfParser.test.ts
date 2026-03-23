import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetText = vi.fn();
const mockDestroy = vi.fn();
const constructedOptions: unknown[] = [];

vi.mock("pdf-parse", () => ({
  PDFParse: class MockPDFParse {
    constructor(options: unknown) {
      constructedOptions.push(options);
    }

    getText = mockGetText;
    destroy = mockDestroy;
  }
}));

vi.mock("@/services/parsers/financialFactsExtractor", () => ({
  extractFinancialFactsFromText: vi.fn()
}));

import { extractFinancialFactsFromText } from "@/services/parsers/financialFactsExtractor";
import { parsePdfBuffer } from "@/services/parsers/pdfParser";

describe("parsePdfBuffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    constructedOptions.length = 0;
  });

  it("extracts text, computes metrics and always destroys the parser", async () => {
    mockGetText.mockResolvedValue({
      text: "Exercice 2025\nChiffre d'affaires 1000",
      pages: [{}, {}]
    });
    vi.mocked(extractFinancialFactsFromText).mockReturnValue({
      facts: {
        revenue: 1000,
        expenses: null,
        payroll: null,
        treasury: 200,
        receivables: null,
        payables: null,
        inventory: null
      },
      metrics: [{ key: "revenue", label: "CA", value: 1000, confidence: "high" }]
    });

    const result = await parsePdfBuffer(Buffer.from("pdf"), "report.pdf");

    expect(constructedOptions).toHaveLength(1);
    expect(extractFinancialFactsFromText).toHaveBeenCalledWith(
      "Exercice 2025\nChiffre d'affaires 1000"
    );
    expect(result.fileName).toBe("report.pdf");
    expect(result.fileType).toBe("pdf");
    expect(result.fiscalYear).toBe(2025);
    expect(result.metrics).toHaveLength(1);
    expect(result.previewRows[0]).toMatchObject({
      pages: 2,
      revenue: 1000,
      treasury: 200
    });
    expect(result.rawData.byVariableCode.total_prod_expl).toBe(1000);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it("destroys parser even when extraction fails", async () => {
    mockGetText.mockRejectedValue(new Error("pdf parse failed"));

    await expect(parsePdfBuffer(Buffer.from("pdf"), "report.pdf")).rejects.toThrow(
      "pdf parse failed"
    );
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});
