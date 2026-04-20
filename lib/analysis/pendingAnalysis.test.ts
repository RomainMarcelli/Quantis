import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisDraft } from "@/types/analysis";
import { createEmptyMappedFinancialData, createEmptyRawAnalysisData } from "@/services/mapping/financialDataMapper";
import {
  clearPendingAnalysisDraft,
  consumePendingAnalysisDraft,
  getPendingAnalysisDraft,
  savePendingAnalysisDraft
} from "@/lib/analysis/pendingAnalysis";

type LocalStorageMock = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function createLocalStorageMock(): LocalStorageMock {
  const storage = new Map<string, string>();
  return {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      storage.set(key, value);
    },
    removeItem: (key) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    }
  };
}

function buildDraft(userId: string = "guest-1"): AnalysisDraft {
  return {
    userId,
    folderName: "Dossier principal",
    createdAt: "2026-03-23T12:00:00.000Z",
    fiscalYear: 2026,
    sourceFiles: [],
    parsedData: [],
    rawData: createEmptyRawAnalysisData(),
    mappedData: createEmptyMappedFinancialData(),
    financialFacts: {
      revenue: null,
      expenses: null,
      payroll: null,
      treasury: null,
      receivables: null,
      payables: null,
      inventory: null
    },
    kpis: {} as AnalysisDraft["kpis"],
    quantisScore: null,
    uploadContext: {
      companySize: "PME - 11 - 50 employés",
      sector: "SaaS & Édition de Logiciels",
      source: "upload"
    }
  };
}

describe("pendingAnalysis storage", () => {
  beforeEach(() => {
    const localStorage = createLocalStorageMock();
    Object.defineProperty(globalThis, "window", {
      value: { localStorage },
      configurable: true
    });
  });

  afterEach(() => {
    clearPendingAnalysisDraft();
    Reflect.deleteProperty(globalThis, "window");
  });

  it("saves and reads a pending analysis draft", () => {
    const draft = buildDraft();

    savePendingAnalysisDraft(draft);
    const pending = getPendingAnalysisDraft();

    expect(pending).not.toBeNull();
    expect(pending?.userId).toBe("guest-1");
    expect(pending?.folderName).toBe("Dossier principal");
  });

  it("consumes pending draft and clears storage", () => {
    const draft = buildDraft("guest-2");
    savePendingAnalysisDraft(draft);

    const consumed = consumePendingAnalysisDraft();
    const afterConsume = getPendingAnalysisDraft();

    expect(consumed?.userId).toBe("guest-2");
    expect(afterConsume).toBeNull();
  });

  it("drops expired payloads", () => {
    const expiredPayload = {
      version: 1,
      savedAt: Date.now() - 1000 * 60 * 60 * 25,
      analysisDraft: buildDraft("guest-expired")
    };
    window.localStorage.setItem("quantis.pendingAnalysisDraft.v1", JSON.stringify(expiredPayload));

    const pending = getPendingAnalysisDraft();

    expect(pending).toBeNull();
    expect(window.localStorage.getItem("quantis.pendingAnalysisDraft.v1")).toBeNull();
  });
});

