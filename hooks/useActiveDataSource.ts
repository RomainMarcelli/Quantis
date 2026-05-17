// File: hooks/useActiveDataSource.ts
// Role: hook React UNIQUE pour lire/écrire la source active de l'user.
// Tout consommateur côté client (SyntheseView, AnalysisDetailView,
// DocumentsView, badges, etc.) passe par ce hook plutôt que d'accéder
// directement à Firestore — garantit cohérence et exclusion mutuelle
// des sources comptables.
//
// Comportement :
//   - subscribe Firestore : `users/{uid}/settings/dataSources` (temps réel,
//     cross-tab / cross-device).
//   - Migration douce au premier mount : si Firestore vide ET
//     `localStorage.quantis.activeAnalysis` existe, on déduit la source
//     comptable de l'analyse référencée et on persiste en Firestore (puis
//     purge localStorage). Logue chaque migration en console pour le
//     monitoring du déploiement.
//   - `availableYears` : dérivé pur de la source active + de la liste
//     d'analyses fournie. Évite que chaque vue recalcule sa liste.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_ACTIVE_DATA_SOURCE,
  type AccountingSource,
  type ActiveDataSourceState,
  type BankingSource,
} from "@/types/dataSources";
import {
  subscribeActiveDataSource,
  writeActiveAccountingSource,
  writeActiveBankingSource,
} from "@/services/dataSourcesStore";
import { firebaseAuthGateway } from "@/services/auth";
import type { AnalysisRecord } from "@/types/analysis";

const LEGACY_ANALYSIS_LS_KEY = "quantis.activeAnalysis";
const LEGACY_FOLDER_LS_KEY = "quantis.activeFolderName";

type UseActiveDataSourceOptions = {
  /**
   * Liste complète des analyses connues de l'utilisateur. Optionnelle —
   * sert à dériver `availableYears` pour la source active. Si absente,
   * `availableYears` reste vide.
   */
  analyses?: AnalysisRecord[];
  /**
   * Scope par dossier cabinet — quand un firm_member ouvre une entreprise
   * précise, on lit/écrit `users/{uid}/settings/dataSources_{companyId}`
   * pour ne pas mélanger les sources actives de N dossiers.
   * Pour company_owner / non scopé, retombe sur le doc historique.
   */
  companyId?: string | null;
};

export type UseActiveDataSourceResult = {
  state: ActiveDataSourceState;
  /** Identique à `state.activeAccountingSource` (sucre syntaxique). */
  activeAccountingSource: AccountingSource | null;
  activeBankingSource: BankingSource | null;
  activeFecFolderName: string | null;
  /**
   * Active une source comptable. Si la valeur est égale à la source
   * courante → toggle off (passe à null). Mutuellement exclusive avec
   * les autres sources comptables (l'écriture remplace la valeur).
   *
   * @param fecFolderName Requis pour FEC ; ignoré pour les autres sources.
   */
  setActiveAccountingSource: (
    source: AccountingSource | null,
    fecFolderName?: string | null
  ) => Promise<void>;
  /** Active ou désactive Bridge. Indépendant de la source comptable. */
  setActiveBankingSource: (source: BankingSource | null) => Promise<void>;
  /** Liste des fiscalYear disponibles dans la source active. Triée desc. */
  availableYears: number[];
  isLoading: boolean;
  error: Error | null;
};

export function useActiveDataSource(
  options: UseActiveDataSourceOptions = {}
): UseActiveDataSourceResult {
  const { analyses, companyId } = options;
  const [userId, setUserId] = useState<string | null>(null);
  const [state, setState] = useState<ActiveDataSourceState>(EMPTY_ACTIVE_DATA_SOURCE);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Empêche la migration de tirer plusieurs fois en cas de re-mount rapide.
  const migrationDoneRef = useRef(false);

  // Track auth → userId. La souscription Firestore se relance quand
  // l'utilisateur change.
  useEffect(() => {
    return firebaseAuthGateway.subscribe((user) => {
      setUserId(user?.uid ?? null);
      if (!user) {
        setState(EMPTY_ACTIVE_DATA_SOURCE);
        setIsLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    setIsLoading(true);
    // Reset state quand le scope change (companyId switche) pour éviter
    // d'afficher la source de l'ancien dossier le temps que Firestore
    // résolve la nouvelle.
    setState(EMPTY_ACTIVE_DATA_SOURCE);
    const unsubscribe = subscribeActiveDataSource(
      userId,
      (next) => {
        setState(next);
        setIsLoading(false);
        setError(null);
        // Migration douce — on tente une seule fois après la première
        // résolution Firestore. Si Firestore est vide ET on a un legacy
        // localStorage, on déduit la source et on persiste.
        // Skip si on est scopé à un companyId (jamais de legacy localStorage
        // pour les sous-dossiers — la migration n'a de sens qu'au niveau user).
        if (!migrationDoneRef.current && !companyId) {
          migrationDoneRef.current = true;
          void runLegacyMigration(userId, next, analyses);
        }
      },
      (err) => {
        setError(err);
        setIsLoading(false);
      },
      companyId
    );
    return () => {
      unsubscribe();
    };
  }, [userId, analyses, companyId]);

  const setActiveAccountingSource = useCallback(
    async (source: AccountingSource | null, fecFolderName: string | null = null) => {
      if (!userId) return;
      await writeActiveAccountingSource(userId, source, fecFolderName, companyId);
    },
    [userId, companyId]
  );

  const setActiveBankingSource = useCallback(
    async (source: BankingSource | null) => {
      if (!userId) return;
      await writeActiveBankingSource(userId, source, companyId);
    },
    [userId, companyId]
  );

  // Années disponibles dans la source active. Pour Pennylane / MyUnisoft /
  // Odoo : agrégation des fiscalYear des analyses ayant le bon provider.
  // Pour FEC : limité au folder actif si défini (sinon toutes les FEC).
  const availableYears = useMemo<number[]>(() => {
    if (!state.activeAccountingSource || !analyses?.length) return [];
    const filtered = analyses.filter((a) => {
      const provider = a.sourceMetadata?.provider ?? null;
      if (state.activeAccountingSource === "fec") {
        if (provider !== "fec" && provider !== "upload") return false;
        if (state.activeFecFolderName) {
          return (
            (a.folderName ?? "").trim().toLowerCase() ===
            state.activeFecFolderName.toLowerCase()
          );
        }
        return true;
      }
      return provider === state.activeAccountingSource;
    });
    const years = new Set<number>();
    for (const a of filtered) {
      if (typeof a.fiscalYear === "number") years.add(a.fiscalYear);
    }
    return [...years].sort((a, b) => b - a);
  }, [state.activeAccountingSource, state.activeFecFolderName, analyses]);

  return {
    state,
    activeAccountingSource: state.activeAccountingSource,
    activeBankingSource: state.activeBankingSource,
    activeFecFolderName: state.activeFecFolderName,
    setActiveAccountingSource,
    setActiveBankingSource,
    availableYears,
    isLoading,
    error,
  };
}

// ─── Migration douce de l'ancien système ─────────────────────────────────

/**
 * Si Firestore est vide ET qu'on a un `localStorage.quantis.activeAnalysis`
 * legacy, on remonte l'analyse, on déduit sa source kind, on persiste en
 * Firestore et on purge le localStorage.
 *
 * Aucune erreur ne doit faire crasher le hook — toute exception est
 * loguée puis avalée. La migration est best-effort, pas critique.
 *
 * IMPORTANT : on ne tire la migration que si `analyses` est non-vide
 * (sinon on ne peut pas résoudre l'analysisId stocké). Si `analyses`
 * arrive plus tard (asynchronously), un re-run du hook prendra le relais.
 */
async function runLegacyMigration(
  userId: string,
  current: ActiveDataSourceState,
  analyses?: AnalysisRecord[]
): Promise<void> {
  if (typeof window === "undefined") return;
  // Déjà migré (un des champs est non-null).
  if (
    current.activeAccountingSource !== null ||
    current.activeBankingSource !== null
  ) {
    return;
  }

  let legacyAnalysisId: string | null = null;
  let legacyFolderName: string | null = null;
  try {
    legacyAnalysisId = window.localStorage.getItem(LEGACY_ANALYSIS_LS_KEY);
    legacyFolderName = window.localStorage.getItem(LEGACY_FOLDER_LS_KEY);
  } catch {
    return;
  }

  if (!legacyAnalysisId && !legacyFolderName) return;
  if (!analyses?.length) return;

  let inferredSource: AccountingSource | null = null;
  let inferredFolder: string | null = null;

  if (legacyAnalysisId) {
    const target = analyses.find((a) => a.id === legacyAnalysisId);
    if (target) {
      const provider = target.sourceMetadata?.provider ?? null;
      if (provider === "pennylane" || provider === "myunisoft" || provider === "odoo") {
        inferredSource = provider;
      } else if (provider === "fec" || provider === "upload") {
        inferredSource = "fec";
        inferredFolder = target.folderName?.trim() ?? null;
      }
    }
  } else if (legacyFolderName) {
    // Folder seul → assume FEC.
    inferredSource = "fec";
    inferredFolder = legacyFolderName.trim();
  }

  if (!inferredSource) return;

  try {
    await writeActiveAccountingSource(userId, inferredSource, inferredFolder);
    // Purge localStorage uniquement après écriture Firestore réussie.
    window.localStorage.removeItem(LEGACY_ANALYSIS_LS_KEY);
    window.localStorage.removeItem(LEGACY_FOLDER_LS_KEY);
    // eslint-disable-next-line no-console -- monitoring temporaire post-déploiement
    console.info(
      `[dataSources/migration] migrated user ${userId} → accountingSource=${inferredSource}${
        inferredFolder ? ` folder=${inferredFolder}` : ""
      }`
    );
  } catch (err) {
    // eslint-disable-next-line no-console -- monitoring temporaire post-déploiement
    console.warn("[dataSources/migration] failed", err);
  }
}
