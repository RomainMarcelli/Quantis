import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyMappedFinancialData } from "@/services/mapping/financialDataMapper";
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
        previewRows: [],
        rawData: {
          byVariableCode: {
            total_prod_expl: 100,
            total_charges_expl: 40
          },
          byLineCode: {
            "232": 100,
            "264": 40
          },
          byLabel: {
            total_prod_expl: 100
          }
        }
      })
      .mockResolvedValueOnce({
        fileName: "b.pdf",
        fileType: "pdf",
        extractedAt: "2026-03-19T10:00:01.000Z",
        fiscalYear: 2024,
        metrics: [{ key: "treasury", label: "Tresorerie", value: 20, confidence: "medium" }],
        previewRows: [],
        rawData: {
          byVariableCode: {
            dispo: 20
          },
          byLineCode: {
            "084": 20
          },
          byLabel: {
            disponibilites: 20
          }
        }
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
      tcam: null,
      va: null,
      ebitda: null,
      marge_ebitda: null,
      charges_var: null,
      mscv: null,
      tmscv: null,
      ca: 100,
      charges_fixes: null,
      point_mort: null,
      ratio_immo: null,
      bfr: null,
      rot_bfr: null,
      dso: null,
      dpo: null,
      rot_stocks: null,
      caf: null,
      fte: null,
      tn: null,
      solvabilite: null,
      gearing: null,
      liq_gen: null,
      liq_red: null,
      liq_imm: null,
      disponibilites: 20,
      roce: null,
      roe: null,
      effet_levier: null,
      ebe: 12,
      resultat_net: 60,
      grossMarginRate: 60,
      netProfit: 60,
      workingCapital: null,
      monthlyBurnRate: 0,
      cashRunwayMonths: null,
      capacite_remboursement_annees: 1.8,
      etat_materiel_indice: 45,
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
      folderName: "Dossier test",
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
    expect(computeKpis).toHaveBeenCalledWith(
      expect.objectContaining({
        total_prod_expl: 100,
        total_charges_expl: 40,
        dispo: 20
      })
    );

    expect(result.userId).toBe("uid-1");
    expect(result.folderName).toBe("Dossier test");
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
    expect(result.rawData.byLineCode["232"]).toBe(100);
    expect(result.mappedData.total_prod_expl).toBe(100);
    expect(result.mappedData.dispo).toBe(20);
    expect(result.kpis.ca).toBe(100);
    expect(result.kpis.disponibilites).toBe(20);
    expect(result.kpis.capacite_remboursement_annees).toBe(1.8);
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
      previewRows: [],
      rawData: {
        byVariableCode: {},
        byLineCode: {},
        byLabel: {}
      }
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
      tcam: null,
      va: null,
      ebitda: null,
      ebe: null,
      marge_ebitda: null,
      charges_var: null,
      mscv: null,
      tmscv: null,
      ca: null,
      charges_fixes: null,
      point_mort: null,
      ratio_immo: null,
      bfr: null,
      rot_bfr: null,
      dso: null,
      dpo: null,
      rot_stocks: null,
      caf: null,
      fte: null,
      tn: null,
      solvabilite: null,
      gearing: null,
      liq_gen: null,
      liq_red: null,
      liq_imm: null,
      disponibilites: null,
      roce: null,
      roe: null,
      effet_levier: null,
      resultat_net: null,
      grossMarginRate: null,
      netProfit: null,
      workingCapital: null,
      monthlyBurnRate: 0,
      cashRunwayMonths: null,
      capacite_remboursement_annees: null,
      etat_materiel_indice: null,
      healthScore: null
    });

    const result = await runAnalysisPipeline({
      userId: "uid-1",
      folderName: "Dossier test",
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
    expect(result.mappedData).toEqual({
      ...createEmptyMappedFinancialData(),
      n: 1
    });
  });
});
