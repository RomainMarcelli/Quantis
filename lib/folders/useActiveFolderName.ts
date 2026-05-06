// File: lib/folders/useActiveFolderName.ts
// Role: hook React qui suit la valeur de localStorage `quantis.activeFolderName`
// et la met à jour quand un autre composant la modifie via setActiveFolderName.
// Pendant pour useActiveAnalysisId — sépare le state activable en 2 axes :
//   - dossier actif (sources statiques multi-exercices)
//   - analyse active (override ponctuel — connexion dynamique typiquement)
"use client";

import { useEffect, useState } from "react";
import { getActiveFolderName } from "@/lib/folders/activeFolder";

export function useActiveFolderName(): string | null {
  const [folder, setFolder] = useState<string | null>(null);

  useEffect(() => {
    setFolder(getActiveFolderName());

    function onStorage(e: StorageEvent) {
      if (e.key === "quantis.activeFolderName") {
        setFolder(e.newValue && e.newValue.length > 0 ? e.newValue : null);
      }
    }
    function onCustom(e: Event) {
      const detail = (e as CustomEvent<{ folderName: string | null }>).detail;
      setFolder(detail?.folderName ?? null);
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener("quantis:activeFolderChanged", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("quantis:activeFolderChanged", onCustom);
    };
  }, []);

  return folder;
}
