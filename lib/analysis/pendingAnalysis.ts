// File: lib/analysis/pendingAnalysis.ts
// Role: persiste localement une analyse "invité" pour éviter toute perte entre upload et inscription.
import type { AnalysisDraft } from "@/types/analysis";

const PENDING_ANALYSIS_STORAGE_KEY = "quantis.pendingAnalysisDraft.v1";
const PENDING_ANALYSIS_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h

type PendingAnalysisPayload = {
  version: 1;
  savedAt: number;
  analysisDraft: AnalysisDraft;
};

export function savePendingAnalysisDraft(analysisDraft: AnalysisDraft): void {
  if (!isBrowserEnvironment()) {
    return;
  }

  const payload: PendingAnalysisPayload = {
    version: 1,
    savedAt: Date.now(),
    analysisDraft
  };

  try {
    window.localStorage.setItem(PENDING_ANALYSIS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // fail-open: on ne bloque pas l'UX si localStorage est indisponible.
  }
}

export function getPendingAnalysisDraft(): AnalysisDraft | null {
  if (!isBrowserEnvironment()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PENDING_ANALYSIS_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PendingAnalysisPayload>;
    if (!isValidPendingPayload(parsed)) {
      clearPendingAnalysisDraft();
      return null;
    }

    if (Date.now() - parsed.savedAt > PENDING_ANALYSIS_MAX_AGE_MS) {
      clearPendingAnalysisDraft();
      return null;
    }

    return parsed.analysisDraft;
  } catch {
    clearPendingAnalysisDraft();
    return null;
  }
}

export function consumePendingAnalysisDraft(): AnalysisDraft | null {
  const pending = getPendingAnalysisDraft();
  if (!pending) {
    return null;
  }
  clearPendingAnalysisDraft();
  return pending;
}

export function clearPendingAnalysisDraft(): void {
  if (!isBrowserEnvironment()) {
    return;
  }

  try {
    window.localStorage.removeItem(PENDING_ANALYSIS_STORAGE_KEY);
  } catch {
    // fail-open
  }
}

function isBrowserEnvironment(): boolean {
  return typeof window !== "undefined";
}

function isValidPendingPayload(payload: Partial<PendingAnalysisPayload>): payload is PendingAnalysisPayload {
  return (
    payload.version === 1 &&
    typeof payload.savedAt === "number" &&
    Boolean(payload.analysisDraft) &&
    typeof payload.analysisDraft === "object"
  );
}

