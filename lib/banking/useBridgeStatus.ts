// File: lib/banking/useBridgeStatus.ts
// Role: hook React qui interroge `/api/integrations/bridge/status` et expose
// le statut de la connexion Bridge. Pilote l'affichage conditionnel de
// l'onglet Trésorerie + le badge "Live" dans le cockpit Synthèse + le
// libellé de la card BridgeConnectCard sur Documents.
//
// Architecture : module-level store (single source of truth) au lieu d'un
// state local par hook. Avant ce passage en store, chaque composant qui
// montait `useBridgeStatus` avait son PROPRE état React → une mise à jour
// déclenchée par BridgeConnectCard ne se propageait pas à AnalysisDetailView
// ni à TreasuryEmptyState. Résultat : on synchronisait via un bouton mais
// l'UI à côté restait sur l'ancien état.
//
// Pas de React Query / SWR pour rester sans dépendance. Pub/sub léger via
// `useSyncExternalStore` (API React stable).
"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { BankingSummary } from "@/types/banking";

export type BridgeStatus = {
  connected: boolean;
  connectionId?: string;
  accountsCount?: number;
  totalBalance?: number | null;
  /** Noms de banques distinctes (providerName Bridge). Vide tant qu'aucun
   *  sync n'a pas matérialisé de comptes. */
  providerNames?: string[];
  lastSyncAt?: string | null;
  lastSyncStatus?: string;
  /** Summary complet — disponible quand un /sync standalone a été effectué
   *  (banking_summaries/{userId}). Permet aux pages dashboard d'afficher
   *  l'onglet Trésorerie sans que le summary soit attaché à une analyse
   *  spécifique. */
  summary?: BankingSummary | null;
};

type Snapshot = {
  status: BridgeStatus | null;
  loading: boolean;
  error: string | null;
};

// ─── Module-level store (singleton partagé) ─────────────────────────────

let snapshot: Snapshot = { status: null, loading: true, error: null };
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;
let initialized = false;

function emit() {
  listeners.forEach((l) => l());
}

function setSnapshot(next: Partial<Snapshot>) {
  // Object identity change pour que useSyncExternalStore détecte le diff.
  snapshot = { ...snapshot, ...next };
  emit();
}

async function fetchStatusOnce(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      // Import dynamique pour éviter de tirer Firebase Auth dans les modules
      // qui ne consomment pas ce hook (cf. pattern AiChatPanel).
      const { firebaseAuthGateway } = await import("@/services/auth");
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) {
        setSnapshot({ status: { connected: false }, loading: false, error: null });
        return;
      }
      const res = await fetch("/api/integrations/bridge/status", {
        headers: { authorization: `Bearer ${idToken}` },
        // Évite le cache navigateur — sinon après un /sync on récupère
        // l'ancien snapshot et l'UI ne reflète pas la nouvelle donnée.
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = (await res.json()) as BridgeStatus;
      setSnapshot({ status: json, loading: false, error: null });
    } catch (err) {
      setSnapshot({
        status: { connected: false },
        loading: false,
        error: err instanceof Error ? err.message : "Erreur inconnue",
      });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// ─── Hook React ─────────────────────────────────────────────────────────

export type UseBridgeStatusResult = {
  status: BridgeStatus | null;
  loading: boolean;
  error: string | null;
  /** Force un re-fetch + notifie toutes les instances montées du hook. */
  refresh: () => Promise<void>;
};

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Snapshot {
  return snapshot;
}

function getServerSnapshot(): Snapshot {
  // SSR : on retourne un état "loading" stable. Le 1er fetch se fera côté client.
  return { status: null, loading: true, error: null };
}

export function useBridgeStatus(): UseBridgeStatusResult {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Fetch initial une seule fois au premier mount (n'importe quel composant
  // qui monte le hook déclenche le fetch — les suivants reçoivent juste le
  // snapshot via le store).
  useEffect(() => {
    if (!initialized) {
      initialized = true;
      void fetchStatusOnce();
    }
  }, []);

  const refresh = useCallback(async () => {
    setSnapshot({ loading: true });
    await fetchStatusOnce();
  }, []);

  return {
    status: current.status,
    loading: current.loading,
    error: current.error,
    refresh,
  };
}
