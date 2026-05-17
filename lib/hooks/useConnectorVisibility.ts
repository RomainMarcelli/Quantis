// File: lib/hooks/useConnectorVisibility.ts
// Role: hook client qui fetch /api/integrations/connectors/visibility et
// expose les flags de visibilité de chaque connecteur. Brief 14/05/2026.
//
// Stratégie défensive : tant que le fetch n'a pas répondu, on retourne
// `undefined` pour chaque connecteur — les composants consommateurs
// doivent traiter ce cas pour éviter un flash de tuile masquée puis
// réaffichée (ou inversement).
"use client";

import { useEffect, useState } from "react";
import type {
  ConnectorId,
  ConnectorVisibilityMap,
} from "@/services/integrations/connectorVisibility";

/**
 * Snapshot de la visibilité côté client.
 * `undefined` = en cours de chargement, le caller doit décider de
 * l'affichage par défaut (typiquement : masquer pendant le loading
 * pour ne pas exposer un connecteur qui sera ensuite caché).
 */
export type ConnectorVisibilityState = ConnectorVisibilityMap | undefined;

const DEFAULT_VISIBILITY: ConnectorVisibilityMap = {
  pennylane_manual: { visible: true },
  myu_manual: { visible: true },
  fec_upload: { visible: true },
  pennylane_firm: { visible: false },
  pennylane_company: { visible: false },
  bridge: { visible: false },
  odoo: { visible: false },
  tiime: { visible: false },
};

export function useConnectorVisibility(): {
  visibility: ConnectorVisibilityState;
  /** Helper de lecture défensive — retourne false tant que rien n'est chargé. */
  isVisible: (id: ConnectorId) => boolean;
} {
  const [visibility, setVisibility] = useState<ConnectorVisibilityState>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/integrations/connectors/visibility");
        if (!res.ok) {
          if (!cancelled) setVisibility(DEFAULT_VISIBILITY);
          return;
        }
        const data = (await res.json()) as ConnectorVisibilityMap;
        if (!cancelled) setVisibility(data);
      } catch {
        if (!cancelled) setVisibility(DEFAULT_VISIBILITY);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function isVisible(id: ConnectorId): boolean {
    if (!visibility) {
      // Pendant le loading on retombe sur le défaut MVP — les 3 connecteurs
      // toujours visibles (pennylane_manual, myu_manual, fec_upload)
      // restent visibles immédiatement, les autres sont masqués jusqu'au
      // fetch. Évite un flash de Bridge/Odoo/Tiime.
      return DEFAULT_VISIBILITY[id].visible;
    }
    return visibility[id]?.visible ?? false;
  }

  return { visibility, isVisible };
}
