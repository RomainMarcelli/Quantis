// File: components/sync/SyncTriggerButton.tsx
// Role: bouton "Synchroniser maintenant" — appelle /api/sync/trigger,
// gère l'état busy local, affiche un toast contextuel selon le résultat
// et notifie le parent du succès pour qu'il puisse refresh ses KPIs.
//
// Style : bouton secondaire bordé gold deep en mode clair (cohérent
// avec la hiérarchie des CTA Phase 5 du redesign light). Reste cliquable
// même en lastSyncStatus="failed" — c'est précisément le cas où l'user
// veut retenter.
"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { FeedbackToast } from "@/components/ui/FeedbackToast";

type SyncTriggerButtonProps = {
  connectionId: string;
  /** Disabled exterieur (ex. : tuile en cours d'édition). Pas un état
   *  bloquant pour l'utilisateur — un sync en erreur reste retentable. */
  disabled?: boolean;
  /** Notifié quand un sync vient de réussir (200) — le parent peut
   *  rafraîchir ses KPIs / refetch Firestore. */
  onSyncSucceeded?: () => void | Promise<void>;
  /** Permet d'overrider le label si on a besoin d'un wording différent
   *  (rare ; par défaut "Synchroniser maintenant"). */
  label?: string;
  className?: string;
};

type ToastState = {
  type: "success" | "error" | "info";
  message: string;
} | null;

export function SyncTriggerButton({
  connectionId,
  disabled = false,
  onSyncSucceeded,
  label = "Synchroniser maintenant",
  className,
}: SyncTriggerButtonProps) {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setToast(null);
    try {
      const response = await fetch("/api/sync/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      if (response.status === 429) {
        setToast({
          type: "info",
          message: "Synchronisation déjà effectuée récemment, réessayez dans quelques minutes.",
        });
        return;
      }
      if (!response.ok) {
        setToast({
          type: "error",
          message: "La synchronisation a échoué, contactez le support si le problème persiste.",
        });
        return;
      }
      setToast({ type: "success", message: "Données synchronisées." });
      if (onSyncSucceeded) {
        await onSyncSucceeded();
      }
    } catch {
      setToast({
        type: "error",
        message: "La synchronisation a échoué, contactez le support si le problème persiste.",
      });
    } finally {
      setBusy(false);
      // Auto-dismiss du toast après 4 s. Même approche que le pattern
      // `FeedbackToast` éphémère utilisé ailleurs.
      window.setTimeout(() => setToast(null), 4000);
    }
  }

  return (
    <div className={`inline-flex flex-col items-start gap-2 ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={disabled || busy}
        data-sync-trigger
        className="btn-vyzor-secondary inline-flex items-center gap-2 rounded-[10px] px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
        aria-busy={busy}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        {busy ? "Synchronisation…" : label}
      </button>
      {toast ? <FeedbackToast type={toast.type} message={toast.message} /> : null}
    </div>
  );
}
