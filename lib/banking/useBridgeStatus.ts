// File: lib/banking/useBridgeStatus.ts
// Role: hook React qui interroge `/api/integrations/bridge/status` au mount
// pour savoir si l'utilisateur a une connexion Bridge active. Utilisé pour
// afficher conditionnellement l'onglet Trésorerie + le badge "Live" sur le
// tile Disponibilités du cockpit Synthèse.
//
// Pas de React Query / SWR — pour rester sans dépendance et coller au reste
// de la base. Polling à la demande seulement (au mount + sur trigger
// explicite via `refresh`).
"use client";

import { useCallback, useEffect, useState } from "react";

export type BridgeStatus = {
  connected: boolean;
  connectionId?: string;
  accountsCount?: number;
  totalBalance?: number | null;
  lastSyncAt?: string | null;
  lastSyncStatus?: string;
};

export type UseBridgeStatusResult = {
  status: BridgeStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useBridgeStatus(): UseBridgeStatusResult {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Import dynamique pour ne pas tirer Firebase Auth dans les composants
      // qui ne consomment pas ce hook (cf. pattern AiChatPanel).
      const { firebaseAuthGateway } = await import("@/services/auth");
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) {
        // Pas authentifié → on considère "non connecté" sans erreur
        setStatus({ connected: false });
        return;
      }
      const res = await fetch("/api/integrations/bridge/status", {
        headers: { authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const json = (await res.json()) as BridgeStatus;
      setStatus(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, error, refresh };
}
