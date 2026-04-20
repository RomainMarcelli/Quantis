import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisDraft, AnalysisRecord } from "@/types/analysis";

vi.mock("@/lib/analysis/pendingAnalysis", () => ({
  getPendingAnalysisDraft: vi.fn(),
  clearPendingAnalysisDraft: vi.fn()
}));

vi.mock("@/services/analysisStore", () => ({
  saveAnalysisDraft: vi.fn()
}));

vi.mock("@/lib/analysis/analysisAvailability", () => ({
  setLocalAnalysisHint: vi.fn()
}));

vi.mock("@/lib/folders/activeFolder", () => ({
  setActiveFolderName: vi.fn()
}));

import { getPendingAnalysisDraft, clearPendingAnalysisDraft } from "@/lib/analysis/pendingAnalysis";
import { setLocalAnalysisHint } from "@/lib/analysis/analysisAvailability";
import { setActiveFolderName } from "@/lib/folders/activeFolder";
import { saveAnalysisDraft } from "@/services/analysisStore";
import { persistPendingAnalysisForUser } from "@/services/pendingAnalysisSync";

function buildPendingDraft(userId = "guest-42"): AnalysisDraft {
  return {
    userId,
    folderName: "Dossier principal",
    createdAt: "2026-03-23T12:00:00.000Z",
    fiscalYear: 2026,
    sourceFiles: [],
    parsedData: [],
    rawData: {
      byVariableCode: {},
      byLineCode: {},
      byLabel: {}
    },
    mappedData: {} as AnalysisDraft["mappedData"],
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
      companySize: null,
      sector: null,
      source: "upload"
    }
  };
}

describe("persistPendingAnalysisForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when there is no pending analysis", async () => {
    vi.mocked(getPendingAnalysisDraft).mockReturnValue(null);

    const result = await persistPendingAnalysisForUser("uid-1");

    expect(result).toBeNull();
    expect(saveAnalysisDraft).not.toHaveBeenCalled();
    expect(clearPendingAnalysisDraft).not.toHaveBeenCalled();
  });

  it("saves pending analysis with the authenticated userId and clears local payload", async () => {
    const pendingDraft = buildPendingDraft();
    const savedRecord = {
      ...pendingDraft,
      userId: "uid-1",
      id: "analysis-123"
    } as AnalysisRecord;

    vi.mocked(getPendingAnalysisDraft).mockReturnValue(pendingDraft);
    vi.mocked(saveAnalysisDraft).mockResolvedValue(savedRecord);

    const result = await persistPendingAnalysisForUser("uid-1");

    expect(saveAnalysisDraft).toHaveBeenCalledTimes(1);
    expect(saveAnalysisDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "uid-1",
        folderName: "Dossier principal"
      })
    );
    expect(clearPendingAnalysisDraft).toHaveBeenCalledTimes(1);
    expect(setLocalAnalysisHint).toHaveBeenCalledWith(true);
    expect(setActiveFolderName).toHaveBeenCalledWith("Dossier principal");
    expect(result?.id).toBe("analysis-123");
  });

  it("does not clear local payload when persistence fails", async () => {
    vi.mocked(getPendingAnalysisDraft).mockReturnValue(buildPendingDraft("guest-error"));
    vi.mocked(saveAnalysisDraft).mockRejectedValue(new Error("firestore error"));

    await expect(persistPendingAnalysisForUser("uid-1")).rejects.toThrow("firestore error");
    expect(clearPendingAnalysisDraft).not.toHaveBeenCalled();
  });
});

