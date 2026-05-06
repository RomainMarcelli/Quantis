// File: lib/source/setActiveSource.ts
// Role: API unifiée pour basculer entre les différentes sources de données
// (analyse Pennylane / MyUnisoft / Odoo, dossier Excel/PDF, ou auto-resolve).
//
// Pourquoi un wrapper ? Avant, la bascule de source était dispersée :
//   - DocumentsView appelait `setActiveFolderName + clearActiveAnalysisId`
//   - ConnectionsPanel appelait `writeActiveAnalysisId` (et oubliait le folder)
//   - AccountingConnectionWizard idem
// Résultat : asymétries entre les 2 directions, l'utilisateur restait
// coincé sur l'autre source quand un seul des 2 pointeurs n'était pas
// nettoyé. Tout passe désormais par `setActiveSource()` qui assure la
// cohérence atomique.
//
// 3 modes :
//   - { kind: "analysis", analysisId } : épingle une analyse précise (sync
//     dynamique). Efface en miroir le dossier statique.
//   - { kind: "folder", folderName }   : épingle un dossier statique
//     (Excel/PDF). Efface en miroir l'analyse dynamique.
//   - { kind: "auto" }                  : efface les 2 ; le résolveur
//     applique la priorité métier (dynamique > FEC > upload).

import { writeActiveAnalysisId, clearActiveAnalysisId } from "@/lib/source/activeSource";
import { setActiveFolderName, clearActiveFolderSelection } from "@/lib/folders/activeFolder";

export type ActiveSourcePayload =
  | { kind: "analysis"; analysisId: string }
  | { kind: "folder"; folderName: string }
  | { kind: "auto" };

export function setActiveSource(payload: ActiveSourcePayload): void {
  if (typeof window === "undefined") return;

  switch (payload.kind) {
    case "analysis":
      // writeActiveAnalysisId nettoie déjà le folder en interne (cf.
      // lib/source/activeSource.ts) — on n'a rien à ajouter ici.
      writeActiveAnalysisId(payload.analysisId);
      break;
    case "folder":
      // Symétrie : on efface l'analyse explicite avant de poser le folder,
      // pour que le résolveur côté views (SyntheseView, AnalysisDetailView)
      // ne reste pas accroché à la source précédente.
      clearActiveAnalysisId();
      setActiveFolderName(payload.folderName);
      break;
    case "auto":
      clearActiveAnalysisId();
      clearActiveFolderSelection();
      break;
  }
}
