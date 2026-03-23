// File: services/pendingAnalysisSync.ts
// Role: rattache une analyse temporaire (stockée en local) à l'utilisateur connecté.
import { setLocalAnalysisHint } from "@/lib/analysis/analysisAvailability";
import { clearPendingAnalysisDraft, getPendingAnalysisDraft } from "@/lib/analysis/pendingAnalysis";
import { setActiveFolderName } from "@/lib/folders/activeFolder";
import { saveAnalysisDraft } from "@/services/analysisStore";
import type { AnalysisRecord } from "@/types/analysis";

export async function persistPendingAnalysisForUser(userId: string): Promise<AnalysisRecord | null> {
  const pendingDraft = getPendingAnalysisDraft();
  if (!pendingDraft) {
    return null;
  }

  // On remplace systématiquement le userId temporaire par le vrai user connecté.
  const normalizedDraft = {
    ...pendingDraft,
    userId,
    createdAt: new Date().toISOString()
  };

  const saved = await saveAnalysisDraft(normalizedDraft);
  clearPendingAnalysisDraft();
  setLocalAnalysisHint(true);

  if (saved.folderName?.trim()) {
    setActiveFolderName(saved.folderName.trim());
  }

  return saved;
}

