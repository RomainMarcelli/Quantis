const ANALYSIS_AVAILABLE_STORAGE_KEY = "quantis.hasAnalyses";

export function hasLocalAnalysisHint(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  // Hint purement UX: permet d'afficher rapidement l'acces dashboard
  // meme avant la fin d'une lecture Firestore.
  return window.localStorage.getItem(ANALYSIS_AVAILABLE_STORAGE_KEY) === "1";
}

export function setLocalAnalysisHint(hasAnalyses: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  if (hasAnalyses) {
    window.localStorage.setItem(ANALYSIS_AVAILABLE_STORAGE_KEY, "1");
    return;
  }

  window.localStorage.removeItem(ANALYSIS_AVAILABLE_STORAGE_KEY);
}

export function clearLocalAnalysisHint(): void {
  // Helper explicite pour les flows de purge compte/donnees.
  setLocalAnalysisHint(false);
}
