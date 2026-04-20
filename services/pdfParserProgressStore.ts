export type PdfParserProgressStatus = "running" | "completed" | "failed";

export type PdfParserProgressRecord = {
  requestId: string;
  userId: string;
  progress: number;
  currentStep: string;
  status: PdfParserProgressStatus;
  updatedAtMs: number;
  error: string | null;
};

const PROGRESS_RECORD_TTL_MS = 15 * 60_000;
const progressStore = new Map<string, PdfParserProgressRecord>();

export function startPdfParserProgress(requestId: string, userId: string) {
  upsertProgressRecord(requestId, {
    requestId,
    userId,
    progress: 0,
    currentStep: "Upload du document...",
    status: "running",
    updatedAtMs: Date.now(),
    error: null
  });
  cleanupExpiredProgress();
}

export function updatePdfParserProgress(
  requestId: string,
  input: {
    progress: number;
    currentStep: string;
  }
) {
  const existing = progressStore.get(requestId);
  if (!existing) {
    return;
  }

  upsertProgressRecord(requestId, {
    ...existing,
    progress: clampProgress(input.progress),
    currentStep: input.currentStep,
    status: "running",
    updatedAtMs: Date.now(),
    error: null
  });
}

export function completePdfParserProgress(
  requestId: string,
  input: {
    currentStep: string;
  }
) {
  const existing = progressStore.get(requestId);
  if (!existing) {
    return;
  }

  upsertProgressRecord(requestId, {
    ...existing,
    progress: 100,
    currentStep: input.currentStep,
    status: "completed",
    updatedAtMs: Date.now(),
    error: null
  });
}

export function failPdfParserProgress(
  requestId: string,
  input: {
    currentStep: string;
    error: string;
  }
) {
  const existing = progressStore.get(requestId);
  if (!existing) {
    return;
  }

  upsertProgressRecord(requestId, {
    ...existing,
    progress: existing.progress,
    currentStep: input.currentStep,
    status: "failed",
    updatedAtMs: Date.now(),
    error: input.error
  });
}

export function getPdfParserProgress(requestId: string): PdfParserProgressRecord | null {
  cleanupExpiredProgress();
  return progressStore.get(requestId) ?? null;
}

function upsertProgressRecord(requestId: string, record: PdfParserProgressRecord) {
  progressStore.set(requestId, record);
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0;
  }
  if (progress < 0) {
    return 0;
  }
  if (progress > 100) {
    return 100;
  }
  return Math.round(progress);
}

function cleanupExpiredProgress() {
  const now = Date.now();
  for (const [requestId, record] of progressStore.entries()) {
    if (now - record.updatedAtMs > PROGRESS_RECORD_TTL_MS) {
      progressStore.delete(requestId);
    }
  }
}
