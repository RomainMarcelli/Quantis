// File: services/pendingAnalysisSync.ts
// Role: rattache une analyse temporaire (stockée en local) à l'utilisateur connecté.
import { setLocalAnalysisHint } from "@/lib/analysis/analysisAvailability";
import { clearPendingAnalysisDraft, getPendingAnalysisDraft } from "@/lib/analysis/pendingAnalysis";
import { registerKnownFolderName } from "@/lib/folders/folderRegistry";
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

  // On enregistre juste le folder dans le registre local (pour qu'il apparaisse
  // dans les menus). L'activation comme source active reste MANUELLE via le
  // toggle binaire de /documents — on ne force plus la bascule automatique
  // lors d'un upload pour respecter le choix de l'utilisateur.
  if (saved.folderName?.trim()) {
    registerKnownFolderName(saved.folderName.trim());
  }

  return saved;
}

