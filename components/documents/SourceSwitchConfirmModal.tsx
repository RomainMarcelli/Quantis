// File: components/documents/SourceSwitchConfirmModal.tsx
// Role: confirmation courte avant de basculer hors de "Documents" (FEC) vers
// une source dynamique (Pennylane, MyUnisoft, Odoo). On affiche cette
// confirmation UNIQUEMENT dans ce sens : Documents → autre. Le sens inverse
// (autre → Documents) ne nécessite pas de confirmation parce que les
// connexions persistent et peuvent être réactivées sans perte.
//
// Pourquoi cette confirmation : un cabinet comptable qui a uploadé manuellement
// des Excel client par client peut être surpris de voir ses chiffres changer
// brutalement quand il active Pennylane (les uploads ne sont plus utilisés
// par les calculs, seulement Pennylane). On le rend explicite.
"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

type SourceSwitchConfirmModalProps = {
  open: boolean;
  /** Nom du nouveau provider à activer (ex. "Pennylane"). */
  targetName: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function SourceSwitchConfirmModal({
  open,
  targetName,
  onConfirm,
  onCancel,
}: SourceSwitchConfirmModalProps) {
  // ESC ferme la modal — réflexe utilisateur classique.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="source-switch-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
    >
      {/* Backdrop — clic en dehors annule. */}
      <button
        type="button"
        aria-label="Annuler"
        onClick={onCancel}
        className="absolute inset-0 cursor-default"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />

      {/* Card */}
      <div
        className="relative w-full max-w-md rounded-2xl p-6"
        style={{
          backgroundColor: "var(--app-card-glass-bg)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              color: "#FBBF24",
            }}
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="source-switch-modal-title"
              style={{ color: "var(--app-text-primary)", fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}
            >
              Activer {targetName} comme source ?
            </h2>
            <p
              className="mt-2"
              style={{ color: "var(--app-text-primary)", fontSize: 14, lineHeight: 1.5 }}
            >
              Vos fichiers Excel/FEC uploadés ne seront plus utilisés pour les
              calculs (mais restent stockés). Vous pourrez réactiver
              <strong className="text-white"> Documents </strong> à tout moment
              pour revenir dessus.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{
              color: "var(--app-text-primary)",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
            style={{
              color: "var(--app-text-on-gold)",
              backgroundColor: "#C5A059",
            }}
          >
            Activer {targetName}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
