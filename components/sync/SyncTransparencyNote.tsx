// File: components/sync/SyncTransparencyNote.tsx
// Role: micro-copy explicatif sous le badge + bouton sync. Transforme la
// sync manuelle en feature de transparence : "Vyzor synchronise vos
// données quand vous le demandez". Affiché uniquement sur les pages où
// la sync est pertinente (Dashboard / Documents / Connecteurs) — pas
// sur Profil ni Paramètres globaux.
import type { ReactNode } from "react";

type SyncTransparencyNoteProps = {
  className?: string;
  /** Surcharge optionnelle si on veut un wording adapté à la page
   *  (ex. : sur /documents on peut être plus explicite sur "écritures"). */
  children?: ReactNode;
};

export function SyncTransparencyNote({ className, children }: SyncTransparencyNoteProps) {
  return (
    <p
      className={`text-xs ${className ?? ""}`}
      style={{ color: "var(--app-text-tertiary)" }}
      data-sync-transparency-note
    >
      {children ??
        "Vyzor synchronise vos données quand vous le demandez. Cliquez sur Synchroniser pour récupérer les dernières écritures de votre comptabilité."}
    </p>
  );
}
