// File: components/documents/ConnectSourceModal.tsx
// Role: modal qui héberge le wizard de connexion d'une source comptable.
// Ouvert quand l'utilisateur clique sur une tuile non connectée dans la
// grille de /documents.
//
// Le wizard interne (`AccountingConnectionWizard`) gère son propre flow
// (choix provider → token → recap). On lui passe `initialProvider` pour
// court-circuiter l'écran de choix puisque l'utilisateur a déjà cliqué
// sur la tuile cible.
"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AccountingConnectionWizard } from "@/components/integrations/AccountingConnectionWizard";
import type { ProviderId } from "@/components/integrations/AccountingConnectionWizard";

type ConnectSourceModalProps = {
  open: boolean;
  /** Provider à pré-sélectionner dans le wizard. */
  provider: ProviderId | null;
  onClose: () => void;
  /** Appelé à la fin d'une sync réussie pour rafraîchir le parent. */
  onConnected?: () => void | Promise<void>;
};

export function ConnectSourceModal({
  open,
  provider,
  onClose,
  onConnected,
}: ConnectSourceModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-4 py-10"
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />

      <div
        className="relative w-full max-w-2xl rounded-2xl"
        style={{
          backgroundColor: "var(--app-card-glass-bg)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.5)",
        }}
      >
        {/* Bouton fermer */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          style={{
            color: "var(--app-text-secondary)",
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6">
          <AccountingConnectionWizard
            initialProvider={provider}
            onSyncCompleted={async () => {
              if (onConnected) await onConnected();
            }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
