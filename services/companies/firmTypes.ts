// File: services/companies/firmTypes.ts
// Role: modèle Firm (cabinet) introduit au Sprint C.
//
// Une Firm représente un cabinet d'expertise comptable qui gère N
// Companies (dossiers clients). Les `firm_members` sont les Users qui
// ont accès à toutes les Companies dont `firmId` pointe vers ce cabinet.
//
// Différence avec Sprint A/B :
//   - Sprint A : 1 User = 1 Company (mode dirigeant)
//   - Sprint B : 1 User peut être owner de N Companies (cas Firm OAuth
//                multi-dossiers, mais sans concept Firm)
//   - Sprint C : on introduit Firm explicitement. Les Companies créées
//                via une Connection OAuth Firm portent un `firmId` qui
//                référence le cabinet. Les firm_members peuvent toutes
//                les lire via le firmId.

import type { Timestamp } from "firebase-admin/firestore";

/**
 * Type de compte utilisateur — détermine le parcours UX.
 * Si absent (users pré-Sprint C), traiter comme "company_owner" (fallback).
 */
export type AccountType = "company_owner" | "firm_member";

/**
 * Représentation Firestore d'un cabinet.
 *
 * `memberUserIds` est un array dénormalisé qui inclut l'`ownerUserId`.
 * Permet aux Firestore rules de valider l'accès via `request.auth.uid in resource.data.memberUserIds`
 * sans avoir besoin d'une sous-collection `members`.
 */
export interface FirmRecord {
  firmId: string;
  name: string;
  ownerUserId: string;
  memberUserIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CreateFirmInput = {
  ownerUserId: string;
  name: string;
};
