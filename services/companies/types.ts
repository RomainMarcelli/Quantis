// File: services/companies/types.ts
// Role: modèle métier "Company" — entité centrale du modèle multi-tenant
// introduite au Sprint A (cf. docs/audit-sprint-A.md).
//
// Une Company représente UNE entreprise dont les données comptables sont
// suivies dans Vyzor. Pendant Sprint A, chaque User a exactement une
// Company (mode dirigeant TPE/PME). Aux sprints B/C suivants :
//   - Sprint B : on découple Connection ↔ Company → un User pourra avoir
//     N Companies (ex: cabinet avec plusieurs dossiers clients).
//   - Sprint C : on introduit `firmId` qui rattache une Company à un
//     cabinet, et la notion de firm_members (plusieurs Users avec
//     accès au même firm).
//
// Aucune donnée comptable n'est stockée DANS la Company : les analyses,
// connections, écritures, etc. continuent dans leurs collections
// existantes mais portent désormais un champ `companyId` qui pointe vers
// CompanyRecord.id.

import type { Timestamp } from "firebase-admin/firestore";

/**
 * Source initiale d'une Company — déduite lors de la migration depuis
 * la connection active du user, ou définie à la création en Sprint B+.
 *
 * Note Sprint A : valeur figée à la création par le script de migration.
 * Le sprint B câblera la mise à jour automatique de ce champ lors d'une
 * (re)connexion.
 */
export type CompanySource =
  | "manual"             // FEC upload ou pas de source comptable connectée
  | "pennylane_manual"   // token API Pennylane copier-coller
  | "pennylane_oauth"    // OAuth Pennylane (Firm ou Company, Sprint B+)
  | "myu"                // MyUnisoft / MyU
  | "fec"                // import FEC
  | "bridge";            // Bridge (banking, peu probable comme source comptable principale)

export type CompanyStatus = "active" | "archived";

/**
 * Représentation persistée Firestore d'une Company. Tous les timestamps
 * sont des Firestore `Timestamp` (Admin SDK) — pas des ISO strings, pour
 * permettre `Timestamp.now()` et les queries `>=` natives.
 */
export interface CompanyRecord {
  id: string;
  ownerUserId: string;
  /**
   * Sprint C : si la Company appartient à un cabinet, ce champ référence
   * un firms/{firmId}. Null/undefined pour les Companies en accès direct
   * dirigeant (cas MVP Sprint A).
   */
  firmId?: string;
  name: string;
  siren?: string;
  /**
   * ID externe côté provider (Pennylane company_id, MyU société_id, etc.).
   * Sprint A : peuplé depuis Connection.externalCompanyId si non vide,
   * sinon laissé undefined.
   * Sprint B : devient la clé de dédoublonnage pour les Firm OAuth multi-
   * dossiers (1 Connection cabinet → N Companies, une par externalCompanyId).
   */
  externalCompanyId?: string;
  source: CompanySource;
  status: CompanyStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Forme "input" utilisée par `createCompany()` — l'id et les timestamps
 * sont gérés par le store.
 */
export type CreateCompanyInput = Omit<
  CompanyRecord,
  "id" | "createdAt" | "updatedAt"
> & {
  /** Optionnel : si fourni, le store réutilise ce timestamp comme
   *  `createdAt`. Sinon, `Timestamp.now()`. Utile pour la migration
   *  qui veut conserver `User.createdAt` historique. */
  createdAtOverride?: Timestamp;
};

/**
 * Forme "patch" pour `updateCompany()` — tous les champs optionnels sauf
 * l'id (qui est passé en arg séparé). `updatedAt` est géré par le store.
 */
export type UpdateCompanyPatch = Partial<
  Omit<CompanyRecord, "id" | "createdAt" | "updatedAt" | "ownerUserId">
>;
