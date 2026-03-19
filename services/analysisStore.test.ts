import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisDraft } from "@/types/analysis";

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
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((collectionRef: unknown, ...constraints: unknown[]) => ({
    collectionRef,
    constraints
  })),
  serverTimestamp: vi.fn(() => ({ __type: "serverTimestamp" })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value }))
}));

import * as firestore from "firebase/firestore";
import { deleteUserAnalyses, listUserAnalyses, saveAnalysisDraft } from "@/services/analysisStore";

function buildDraft(): AnalysisDraft {
  return {
    userId: "uid-1",
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
      grossMarginRate: 60,
      netProfit: 400,
      workingCapital: null,
      monthlyBurnRate: 0,
      cashRunwayMonths: null,
      healthScore: 75
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
});
