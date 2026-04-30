// Hook React qui suit la valeur de localStorage `quantis.activeAnalysis` et
// la met à jour quand un autre composant la modifie via `writeActiveAnalysisId`.
"use client";

import { useEffect, useState } from "react";
import { readActiveAnalysisId } from "@/lib/source/activeSource";

export function useActiveAnalysisId(): string | null {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    setId(readActiveAnalysisId());

    function onStorage(e: StorageEvent) {
      if (e.key === "quantis.activeAnalysis") {
        setId(e.newValue && e.newValue.length > 0 ? e.newValue : null);
      }
    }
    function onCustom(e: Event) {
      const detail = (e as CustomEvent<{ analysisId: string | null }>).detail;
      setId(detail?.analysisId ?? null);
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener("quantis:activeAnalysisChanged", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("quantis:activeAnalysisChanged", onCustom);
    };
  }, []);

  return id;
}
