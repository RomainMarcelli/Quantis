// File: lib/source/resolveSourceAnalyses.ts
// Role: helper pur qui filtre une liste d'analyses pour ne garder que celles
// correspondant à la source comptable active. Utilisé par SyntheseView,
// AnalysisDetailView et FinancialStatementsView pour résoudre la liasse
// courante après que l'utilisateur a posé son toggle binaire.
//
// Distinct du hook `useActiveDataSource` (qui gère le state Firestore) :
// cette fonction prend la source en paramètre et n'a aucun effet de bord.
// Elle est testable unitairement et partagée pour rester cohérente entre
// les vues.

import type { AccountingSource } from "@/types/dataSources";
import type { AnalysisRecord } from "@/types/analysis";

/**
 * Garde uniquement les analyses dont le `sourceMetadata.provider` correspond
 * à la source active. Pour FEC, prend en compte la sous-sélection de folder
 * si fournie (cabinet comptable avec plusieurs clients).
 *
 * Retourne un nouveau tableau (jamais le même que l'entrée). Ne trie pas —
 * l'appelant fait son propre tri (par fiscalYear, createdAt, etc.).
 */
export function filterAnalysesBySource(
  analyses: AnalysisRecord[],
  source: AccountingSource | null,
  fecFolderName: string | null = null
): AnalysisRecord[] {
  if (!source) return [];
  return analyses.filter((a) => {
    const provider = a.sourceMetadata?.provider ?? null;
    if (source === "fec") {
      // FEC accepte les imports natifs (provider="fec") ET les uploads
      // statiques PDF/Excel (provider="upload") — historique du modèle où
      // les uploads remplissaient le même rôle qu'un FEC.
      if (provider !== "fec" && provider !== "upload") return false;
      if (fecFolderName) {
        return (
          (a.folderName ?? "").trim().toLowerCase() === fecFolderName.toLowerCase()
        );
      }
      return true;
    }
    return provider === source;
  });
}

/**
 * Résout l'analyse "courante" pour une source active : la plus récente par
 * createdAt (desc) parmi celles qui matchent. Retourne null si aucune ne
 * matche (état "rien à afficher" → l'utilisateur doit changer de source).
 */
export function resolveCurrentAnalysisForSource(
  analyses: AnalysisRecord[],
  source: AccountingSource | null,
  fecFolderName: string | null = null
): AnalysisRecord | null {
  const matching = filterAnalysesBySource(analyses, source, fecFolderName);
  if (!matching.length) return null;
  return [...matching].sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
  )[0]!;
}
