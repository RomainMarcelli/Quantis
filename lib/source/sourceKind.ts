// File: lib/source/sourceKind.ts
// Role: utilitaires PURS de classification d'une AnalysisRecord par sa
// nature de source (pennylane / myunisoft / odoo / fec / pdf / excel).
//
// Anciennement dans `lib/source/activeSource.ts` (supprimé). Volontairement
// isolé du nouveau système "source active" — ces helpers ne lisent ni
// localStorage ni Firestore, ils décrivent juste l'analyse fournie.
//
// Utilisé pour :
//   - le badge `<ActiveSourceBadge />` (couleur + label)
//   - l'icône / coloration de `<AnalysisCard />` dans /documents
//   - la migration douce du hook `useActiveDataSource` (déduit la source
//     comptable à partir d'une analysisId legacy)

import type { AnalysisRecord } from "@/types/analysis";

export type AnalysisSourceKind =
  | "pennylane"
  | "myunisoft"
  | "odoo"
  | "fec"
  | "pdf"
  | "excel"
  | "unknown";

export function getAnalysisSourceKind(analysis: AnalysisRecord): AnalysisSourceKind {
  const meta = analysis.sourceMetadata;
  if (meta?.type === "dynamic") {
    if (meta.provider === "pennylane") return "pennylane";
    if (meta.provider === "myunisoft") return "myunisoft";
    if (meta.provider === "odoo") return "odoo";
    if (meta.provider === "fec") return "fec";
  }
  // Source statique : on devine via le 1er fichier source.
  const firstFile = analysis.sourceFiles?.[0];
  if (firstFile?.type === "pdf") return "pdf";
  if (firstFile?.type === "excel") return "excel";
  if (firstFile?.type === "fec") return "fec";
  return "unknown";
}

// ─── Description humaine pour le header ─────────────────────────────────────

export type AnalysisSourceDescription = {
  kind: AnalysisSourceKind;
  label: string; // ex. "Pennylane", "PDF SORETOLE.pdf"
  detail: string; // ex. "sync il y a 2h", "uploadé le 28/04"
  syncedAt: string | null; // ISO
};

export function describeAnalysisSource(analysis: AnalysisRecord): AnalysisSourceDescription {
  const kind = getAnalysisSourceKind(analysis);
  const meta = analysis.sourceMetadata;
  const firstFile = analysis.sourceFiles?.[0];
  const syncedAt =
    (meta?.type === "dynamic" ? meta.syncedAt : null) ?? analysis.createdAt ?? null;

  let label: string;
  let detail: string;
  switch (kind) {
    case "pennylane":
      label = "Pennylane";
      detail = `sync ${formatRelativeFrench(syncedAt)}`;
      break;
    case "myunisoft":
      label = "MyUnisoft";
      detail = `sync ${formatRelativeFrench(syncedAt)}`;
      break;
    case "odoo":
      label = "Odoo";
      detail = `sync ${formatRelativeFrench(syncedAt)}`;
      break;
    case "fec":
      label = analysis.folderName || `FEC ${firstFile?.name ?? ""}`.trim();
      detail = `FEC · importé ${formatRelativeFrench(syncedAt)}`;
      break;
    case "pdf":
      label = analysis.folderName || `PDF ${firstFile?.name ?? ""}`.trim();
      detail = `PDF · uploadé ${formatRelativeFrench(syncedAt)}`;
      break;
    case "excel":
      label = analysis.folderName || `Excel ${firstFile?.name ?? ""}`.trim();
      detail = `Excel · uploadé ${formatRelativeFrench(syncedAt)}`;
      break;
    default:
      label = analysis.folderName || firstFile?.name || "Source inconnue";
      detail = formatRelativeFrench(syncedAt);
  }

  return { kind, label, detail, syncedAt };
}

function formatRelativeFrench(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `il y a ${diffD} j`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
