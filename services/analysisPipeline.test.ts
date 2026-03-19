import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UploadedBinaryFile } from "@/services/parsers/fileParser";

vi.mock("@/services/parsers/fileParser", () => ({
  parseUploadedFile: vi.fn()
}));

vi.mock("@/services/parsers/financialFactsExtractor", () => ({
  mergeFinancialFacts: vi.fn()
}));

vi.mock("@/services/kpiEngine", () => ({
  computeKpis: vi.fn()
}));

import { runAnalysisPipeline } from "@/services/analysisPipeline";
import { computeKpis } from "@/services/kpiEngine";
import { mergeFinancialFacts } from "@/services/parsers/financialFactsExtractor";
import { parseUploadedFile } from "@/services/parsers/fileParser";

describe("runAnalysisPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses files, merges facts, computes KPIs and returns a complete draft", async () => {
    vi.mocked(parseUploadedFile)
      .mockResolvedValueOnce({
        fileName: "a.xlsx",
        fileType: "excel",
        extractedAt: "2026-03-19T10:00:00.000Z",
        fiscalYear: null,
        metrics: [
          { key: "revenue", label: "CA", value: 100, confidence: "high" },
          { key: "expenses", label: "Charges", value: 40, confidence: "high" }
        ],
        previewRows: []
      })
      .mockResolvedValueOnce({
        fileName: "b.pdf",
        fileType: "pdf",
        extractedAt: "2026-03-19T10:00:01.000Z",
        fiscalYear: 2024,
        metrics: [{ key: "treasury", label: "Tresorerie", value: 20, confidence: "medium" }],
        previewRows: []
      });

    vi.mocked(mergeFinancialFacts).mockReturnValue({
      revenue: 100,
      expenses: 40,
      payroll: null,
      treasury: 20,
      receivables: null,
      payables: null,
      inventory: null
    });

    vi.mocked(computeKpis).mockReturnValue({
      grossMarginRate: 60,
      netProfit: 60,
      workingCapital: null,
      monthlyBurnRate: 0,
      cashRunwayMonths: null,
      healthScore: 82
    });

    const files: UploadedBinaryFile[] = [
      {
        name: "a.xlsx",
        mimeType: "application/vnd.ms-excel",
        size: 1024,
        type: "excel",
        buffer: Buffer.from("a")
      },
      {
        name: "b.pdf",
        mimeType: "application/pdf",
        size: 2048,
        type: "pdf",
        buffer: Buffer.from("b")
      }
    ];

    const result = await runAnalysisPipeline({
      userId: "uid-1",
      files
    });

    expect(parseUploadedFile).toHaveBeenCalledTimes(2);
    expect(mergeFinancialFacts).toHaveBeenCalledWith([
      {
        revenue: 100,
        expenses: 40,
        payroll: null,
        treasury: null,
        receivables: null,
        payables: null,
        inventory: null
      },
      {
        revenue: null,
        expenses: null,
        payroll: null,
        treasury: 20,
        receivables: null,
        payables: null,
        inventory: null
      }
    ]);
    expect(computeKpis).toHaveBeenCalledWith({
      revenue: 100,
      expenses: 40,
      payroll: null,
      treasury: 20,
      receivables: null,
      payables: null,
      inventory: null
    });

    expect(result.userId).toBe("uid-1");
    expect(result.fiscalYear).toBe(2024);
    expect(result.sourceFiles).toEqual([
      {
        name: "a.xlsx",
        mimeType: "application/vnd.ms-excel",
        size: 1024,
        type: "excel"
      },
      {
        name: "b.pdf",
        mimeType: "application/pdf",
        size: 2048,
        type: "pdf"
      }
    ]);
    expect(result.parsedData).toHaveLength(2);
    expect(result.kpis.healthScore).toBe(82);
    expect(Number.isNaN(Date.parse(result.createdAt))).toBe(false);
  });

  it("keeps fiscalYear null when all parsed files have no fiscal year", async () => {
    vi.mocked(parseUploadedFile).mockResolvedValue({
      fileName: "a.xlsx",
      fileType: "excel",
      extractedAt: "2026-03-19T10:00:00.000Z",
      fiscalYear: null,
      metrics: [],
      previewRows: []
    });
    vi.mocked(mergeFinancialFacts).mockReturnValue({
      revenue: null,
      expenses: null,
      payroll: null,
      treasury: null,
      receivables: null,
      payables: null,
      inventory: null
    });
    vi.mocked(computeKpis).mockReturnValue({
      grossMarginRate: null,
      netProfit: null,
      workingCapital: null,
      monthlyBurnRate: 0,
      cashRunwayMonths: null,
      healthScore: null
    });

    const result = await runAnalysisPipeline({
      userId: "uid-1",
      files: [
        {
          name: "a.xlsx",
          mimeType: "application/vnd.ms-excel",
          size: 1024,
          type: "excel",
          buffer: Buffer.from("a")
        }
      ]
    });

    expect(result.fiscalYear).toBeNull();
  });
});
