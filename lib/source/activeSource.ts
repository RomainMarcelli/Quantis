// Source active de l'utilisateur — analyse choisie pour alimenter le dashboard
// (synthese, analysis…). Stockée dans localStorage sous la clé
// `quantis.activeAnalysis`. Une seule analyse active à la fois — pas de merge
// entre sources.
//
// Logique de fallback si rien n'est sélectionné explicitement :
//   1. Connexion dynamique (Pennylane > MyUnisoft > Odoo)
//   2. Import FEC (sourceMetadata.provider === "fec")
//   3. Upload statique (PDF/Excel)
// À niveau de priorité égal, la plus récente (createdAt desc) gagne.

import type { AnalysisRecord } from "@/types/analysis";
import { clearActiveFolderName } from "@/lib/folders/activeFolder";

const STORAGE_KEY = "quantis.activeAnalysis";

export function readActiveAnalysisId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw && typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function writeActiveAnalysisId(analysisId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, analysisId);
    // Quand on bascule explicitement sur une analyse précise (typiquement une
    // sync Pennylane / MyUnisoft / Odoo), on efface en miroir le pointeur
    // « dossier actif » (sources statiques). Sinon, en cas de changement de
    // year selector côté Synthèse / Tableau de bord, la priorité 2 (folder)
    // peut se ré-imposer et l'utilisateur reste coincé sur Excel alors
    // qu'il a explicitement choisi Pennylane (bug remonté le 06/05/2026).
    clearActiveFolderName();
    // Notifie les autres composants montés dans le même onglet (le storage event
    // natif ne se déclenche pas pour la même fenêtre).
    window.dispatchEvent(new CustomEvent("quantis:activeAnalysisChanged", { detail: { analysisId } }));
  } catch {
    /* swallow */
  }
}

export function clearActiveAnalysisId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("quantis:activeAnalysisChanged", { detail: { analysisId: null } }));
  } catch {
    /* swallow */
  }
}

// ─── Résolveur ──────────────────────────────────────────────────────────────

export type AnalysisSourceKind = "pennylane" | "myunisoft" | "odoo" | "fec" | "pdf" | "excel" | "unknown";

const PRIORITY: Record<AnalysisSourceKind, number> = {
  pennylane: 100,
  myunisoft: 99,
  odoo: 98,
  fec: 50,
  pdf: 10,
  excel: 10,
  unknown: 0,
};

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

/**
 * Résout l'analyse active. Si `explicitId` correspond à une analyse de la liste,
 * elle gagne. Sinon, on retombe sur la priorité (dynamique > FEC > upload),
 * la plus récente à priorité égale.
 */
export function resolveActiveAnalysis(
  analyses: AnalysisRecord[],
  explicitId: string | null
): AnalysisRecord | null {
  if (!analyses.length) return null;

  if (explicitId) {
    const explicit = analyses.find((a) => a.id === explicitId);
    if (explicit) return explicit;
  }

  // Tri : priorité de source desc, puis createdAt desc.
  return [...analyses].sort((a, b) => {
    const pa = PRIORITY[getAnalysisSourceKind(a)] ?? 0;
    const pb = PRIORITY[getAnalysisSourceKind(b)] ?? 0;
    if (pa !== pb) return pb - pa;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  })[0]!;
}

// ─── Description humaine pour le header ─────────────────────────────────────

export type AnalysisSourceDescription = {
  kind: AnalysisSourceKind;
  label: string;        // ex. "Pennylane", "PDF SORETOLE.pdf"
  detail: string;       // ex. "sync il y a 2h", "uploadé le 28/04"
  syncedAt: string | null; // ISO
};

export function describeAnalysisSource(analysis: AnalysisRecord): AnalysisSourceDescription {
  const kind = getAnalysisSourceKind(analysis);
  const meta = analysis.sourceMetadata;
  const firstFile = analysis.sourceFiles?.[0];
  const syncedAt =
    (meta?.type === "dynamic" ? meta.syncedAt : null) ??
    analysis.createdAt ??
    null;

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
    // Sources statiques : le badge du header reflète le DOSSIER actif (concept
    // utilisateur : "j'ai sélectionné mon Dossier principal"), pas la liasse
    // individuelle. C'est cohérent avec le sélecteur de période qui permet de
    // basculer entre les exercices d'un même dossier.
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

/**
 * Formate un instant ISO en "il y a Xh", "il y a Xj", ou "le DD/MM/YYYY" si > 30 jours.
 * Pure côté serveur ET client : utilisé pendant SSR.
 */
function formatRelativeFrench(iso: string | null): string {
  if (!iso) return "(date inconnue)";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "(date inconnue)";
  const diffMs = Date.now() - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `il y a ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `il y a ${diffDays} j`;
  return `le ${new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
}
