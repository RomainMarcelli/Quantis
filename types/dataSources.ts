// File: types/dataSources.ts
// Role: types partagés du système de source active (comptable + bancaire).
// Une seule source comptable active à la fois (mutuellement exclusives) ;
// la source bancaire est indépendante et peut coexister.
//
// Lu côté client par `useActiveDataSource()` et côté serveur par
// `getActiveDataSourceServer()` (Admin SDK).

export type AccountingSource = "pennylane" | "myunisoft" | "odoo" | "fec";
export type BankingSource = "bridge";

/**
 * Liste exhaustive des sources comptables — utile pour l'UI (toggle binaire
 * sur chaque card) et pour l'écran de sélection. L'ordre reflète la
 * priorité d'affichage (les plus utilisées en haut).
 */
export const ACCOUNTING_SOURCES: readonly AccountingSource[] = [
  "pennylane",
  "myunisoft",
  "odoo",
  "fec",
] as const;

export const BANKING_SOURCES: readonly BankingSource[] = ["bridge"] as const;

export function isAccountingSource(value: unknown): value is AccountingSource {
  return (
    typeof value === "string" &&
    (ACCOUNTING_SOURCES as readonly string[]).includes(value)
  );
}

export function isBankingSource(value: unknown): value is BankingSource {
  return (
    typeof value === "string" &&
    (BANKING_SOURCES as readonly string[]).includes(value)
  );
}

/**
 * État persisté dans Firestore (`users/{uid}/settings/dataSources`).
 *
 * Sémantique :
 *   - `activeAccountingSource` est la SEULE source comptable utilisée par
 *     le pipeline de calcul. Mutuellement exclusive : activer "pennylane"
 *     écrit `activeAccountingSource = "pennylane"` et n'a aucun autre champ
 *     concurrent — l'exclusion est portée par le type, pas par un drapeau.
 *   - `activeFecFolderName` n'a de sens QUE si `activeAccountingSource ===
 *     "fec"`. Pour les autres sources il doit être `null`/absent.
 *     Permet de gérer les utilisateurs qui ont plusieurs dossiers Excel
 *     (ex. plusieurs clients dans un cabinet comptable).
 *   - `activeBankingSource` est indépendant. Bridge peut être actif ou
 *     non quelle que soit la source comptable.
 *
 * Les timestamps sont posés par le serveur Firestore (serverTimestamp()).
 */
export type ActiveDataSourceState = {
  activeAccountingSource: AccountingSource | null;
  activeBankingSource: BankingSource | null;
  /** Sous-sélection requise si `activeAccountingSource === "fec"`. Sinon null. */
  activeFecFolderName: string | null;
};

/**
 * Forme retournée par `getActiveDataSourceServer()` côté Admin SDK —
 * inclut les timestamps pour debug / cache invalidation.
 */
export type ActiveDataSourceRecord = ActiveDataSourceState & {
  /** ISO string. Posé par serverTimestamp() à la création du doc. */
  createdAt: string | null;
  /** ISO string. Mis à jour à chaque écriture. */
  updatedAt: string | null;
};

/** État initial (utilisateur sans aucun doc settings/dataSources en Firestore). */
export const EMPTY_ACTIVE_DATA_SOURCE: ActiveDataSourceState = {
  activeAccountingSource: null,
  activeBankingSource: null,
  activeFecFolderName: null,
};
