import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisDraft } from "@/types/analysis";
import { createEmptyMappedFinancialData, createEmptyRawAnalysisData } from "@/services/mapping/financialDataMapper";

vi.mock("@/lib/firebase", () => ({
  firestoreDb: { app: "test-db" }
}));

vi.mock("firebase/firestore", () => ({
  Timestamp: class MockTimestamp {
    private readonly value: Date;

    constructor(value: Date) {
      this.value = value;
    }

    toDate() {
      return this.value;
    }
  },
  addDoc: vi.fn(),
  collection: vi.fn((_db: unknown, name: string) => ({ name })),
  doc: vi.fn((_db: unknown, name: string, id: string) => ({ name, id, path: `${name}/${id}` })),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((collectionRef: unknown, ...constraints: unknown[]) => ({
    collectionRef,
    constraints
  })),
  serverTimestamp: vi.fn(() => ({ __type: "serverTimestamp" })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value }))
}));

import * as firestore from "firebase/firestore";
import {
  deleteUserAnalysisById,
  deleteUserAnalyses,
  getUserAnalysisById,
  listUserAnalyses,
  saveAnalysisDraft
} from "@/services/analysisStore";

function buildDraft(): AnalysisDraft {
  return {
    userId: "uid-1",
    folderName: "Dossier test",
    createdAt: "2026-03-19T10:00:00.000Z",
    fiscalYear: 2024,
    sourceFiles: [
      {
        name: "balance.xlsx",
        mimeType: "application/vnd.ms-excel",
        size: 1200,
        type: "excel"
      }
    ],
    parsedData: [],
    rawData: createEmptyRawAnalysisData(),
    mappedData: {
      ...createEmptyMappedFinancialData(),
      total_prod_expl: 1000,
      total_charges_expl: 400
    },
    financialFacts: {
      revenue: 1000,
      expenses: 400,
      payroll: 200,
      treasury: 100,
      receivables: null,
      payables: null,
      inventory: null
    },
    kpis: {
      tcam: null,
      va: null,
      ebitda: null,
      ebe: null,
      marge_ebitda: null,
      charges_var: null,
      mscv: null,
      tmscv: null,
      ca: 1000,
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
      disponibilites: 100,
      roce: null,
      roe: null,
      effet_levier: null,
      resultat_net: 400,
      grossMarginRate: 60,
      netProfit: 400,
      workingCapital: null,
      monthlyBurnRate: 0,
      cashRunwayMonths: null,
      capacite_remboursement_annees: null,
      etat_materiel_indice: null,
      healthScore: 75
    },
    quantisScore: {
      vyzor_score: 72.5,
      piliers: {
        rentabilite: 70,
        solvabilite: 75,
        liquidite: 68,
        efficacite: 77
      },
      alerte_investissement: false
    },
    uploadContext: {
      companySize: "pme",
      sector: "SaaS & Edition de Logiciels",
      source: "dashboard"
    }
  };
}

describe("analysisStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves analysis draft and returns generated id", async () => {
    vi.mocked(firestore.addDoc).mockResolvedValue({ id: "analysis-1" } as never);
    const draft = buildDraft();

    const result = await saveAnalysisDraft(draft);

    expect(firestore.addDoc).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ...draft,
      id: "analysis-1"
    });
  });

  it("lists user analyses sorted by createdAt descending", async () => {
    const TimestampCtor = firestore.Timestamp as unknown as new (value: Date) => { toDate: () => Date };
    const createdAtA = new TimestampCtor(new Date("2026-03-10T10:00:00.000Z"));
    const createdAtB = new TimestampCtor(new Date("2026-03-12T10:00:00.000Z"));

    vi.mocked(firestore.getDocs).mockResolvedValue({
      docs: [
        {
          id: "a",
          ref: { id: "a" },
          data: () => ({
            userId: "uid-1",
            createdAt: createdAtA,
            fiscalYear: 2023,
            sourceFiles: [],
            parsedData: [],
            rawData: createEmptyRawAnalysisData(),
            mappedData: createEmptyMappedFinancialData(),
            financialFacts: {},
            kpis: {}
          })
        },
        {
          id: "b",
          ref: { id: "b" },
          data: () => ({
            userId: "uid-1",
            createdAt: createdAtB,
            fiscalYear: 2024,
            sourceFiles: [],
            parsedData: [],
            rawData: createEmptyRawAnalysisData(),
            mappedData: createEmptyMappedFinancialData(),
            financialFacts: {},
            kpis: {}
          })
        }
      ]
    } as never);

    const result = await listUserAnalyses("uid-1");

    expect(firestore.where).toHaveBeenCalledWith("userId", "==", "uid-1");
    expect(result.map((item) => item.id)).toEqual(["b", "a"]);
    expect(result[0].createdAt).toBe("2026-03-12T10:00:00.000Z");
  });

  it("adds fiscal year query constraint when fiscalYear is provided", async () => {
    vi.mocked(firestore.getDocs).mockResolvedValue({ docs: [] } as never);

    await listUserAnalyses("uid-1", 2024);

    expect(firestore.where).toHaveBeenNthCalledWith(1, "userId", "==", "uid-1");
    expect(firestore.where).toHaveBeenNthCalledWith(2, "fiscalYear", "==", 2024);
  });

  it("deletes all analyses for a user and returns deleted count", async () => {
    vi.mocked(firestore.getDocs).mockResolvedValue({
      docs: [
        { ref: { id: "doc-1" } },
        { ref: { id: "doc-2" } },
        { ref: { id: "doc-3" } }
      ]
    } as never);

    const result = await deleteUserAnalyses("uid-1");

    expect(result).toBe(3);
    expect(firestore.deleteDoc).toHaveBeenCalledTimes(3);
    expect(firestore.where).toHaveBeenCalledWith("userId", "==", "uid-1");
  });

  it("applies historical KPI corrections when listing analyses", async () => {
    const TimestampCtor = firestore.Timestamp as unknown as new (value: Date) => { toDate: () => Date };
    const createdAt2024 = new TimestampCtor(new Date("2025-01-10T10:00:00.000Z"));
    const createdAt2025 = new TimestampCtor(new Date("2026-01-10T10:00:00.000Z"));

    vi.mocked(firestore.getDocs).mockResolvedValue({
      docs: [
        {
          id: "analysis-2025",
          ref: { id: "analysis-2025" },
          data: () => ({
            userId: "uid-1",
            folderName: "Dossier principal",
            createdAt: createdAt2025,
            fiscalYear: 2025,
            sourceFiles: [],
            parsedData: [],
            rawData: createEmptyRawAnalysisData(),
            mappedData: {
              ...createEmptyMappedFinancialData(),
              total_prod_expl: 150000
            },
            financialFacts: {},
            kpis: {
              ca: 150000,
              bfr: 15000,
              caf: 30000
            }
          })
        },
        {
          id: "analysis-2024",
          ref: { id: "analysis-2024" },
          data: () => ({
            userId: "uid-1",
            folderName: "Dossier principal",
            createdAt: createdAt2024,
            fiscalYear: 2024,
            sourceFiles: [],
            parsedData: [],
            rawData: createEmptyRawAnalysisData(),
            mappedData: {
              ...createEmptyMappedFinancialData(),
              total_prod_expl: 100000
            },
            financialFacts: {},
            kpis: {
              ca: 100000,
              bfr: 10000,
              caf: 20000
            }
          })
        }
      ]
    } as never);

    const result = await listUserAnalyses("uid-1");
    const analysis2025 = result.find((item) => item.id === "analysis-2025");
    const analysis2024 = result.find((item) => item.id === "analysis-2024");

    expect(analysis2025?.kpis.tcam).toBe(50);
    expect(analysis2025?.mappedData.delta_bfr).toBe(5000);
    expect(analysis2025?.kpis.fte).toBe(25000);
    expect(analysis2024?.mappedData.delta_bfr).toBe(0);
    expect(analysis2024?.kpis.fte).toBe(20000);
  });

  it("deletes one analysis by id when it belongs to the user", async () => {
    const TimestampCtor = firestore.Timestamp as unknown as new (value: Date) => { toDate: () => Date };
    vi.mocked(firestore.getDoc).mockResolvedValue({
      exists: () => true,
      id: "analysis-1",
      data: () => ({
        userId: "uid-1",
        createdAt: new TimestampCtor(new Date("2026-03-12T10:00:00.000Z"))
      })
    } as never);

    const result = await deleteUserAnalysisById("uid-1", "analysis-1");

    expect(result).toBe(true);
    expect(firestore.deleteDoc).toHaveBeenCalledTimes(1);
    expect(firestore.doc).toHaveBeenCalledWith(expect.anything(), "analyses", "analysis-1");
  });

  it("returns an analysis by id when it belongs to the user", async () => {
    const TimestampCtor = firestore.Timestamp as unknown as new (value: Date) => { toDate: () => Date };
    vi.mocked(firestore.getDoc).mockResolvedValue({
      exists: () => true,
      id: "analysis-1",
      data: () => ({
        userId: "uid-1",
        createdAt: new TimestampCtor(new Date("2026-03-12T10:00:00.000Z")),
        fiscalYear: 2024,
        sourceFiles: [],
        parsedData: [],
        rawData: createEmptyRawAnalysisData(),
        mappedData: createEmptyMappedFinancialData(),
        financialFacts: {
          revenue: 100,
          expenses: 40,
          payroll: null,
          treasury: 20,
          receivables: null,
          payables: null,
          inventory: null
        },
        kpis: {
          ebe: null,
          ca: null,
          disponibilites: null,
          resultat_net: null,
          capacite_remboursement_annees: null,
          etat_materiel_indice: null,
          grossMarginRate: 60,
          netProfit: 60,
          workingCapital: null,
          monthlyBurnRate: 0,
          cashRunwayMonths: null,
          healthScore: 80
        }
      })
    } as never);

    const result = await getUserAnalysisById("uid-1", "analysis-1");

    expect(firestore.doc).toHaveBeenCalledWith(expect.anything(), "analyses", "analysis-1");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("analysis-1");
    expect(result?.userId).toBe("uid-1");
  });

  it("returns null when the analysis does not exist", async () => {
    vi.mocked(firestore.getDoc).mockResolvedValue({
      exists: () => false
    } as never);

    const result = await getUserAnalysisById("uid-1", "missing");

    expect(result).toBeNull();
  });

  it("returns null when the analysis belongs to another user", async () => {
    vi.mocked(firestore.getDoc).mockResolvedValue({
      exists: () => true,
      id: "analysis-1",
      data: () => ({
        userId: "uid-2",
        createdAt: "2026-03-12T10:00:00.000Z"
      })
    } as never);

    const result = await getUserAnalysisById("uid-1", "analysis-1");

    expect(result).toBeNull();
  });
});
