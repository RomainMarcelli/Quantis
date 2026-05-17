// File: services/companies/companyMatching.ts
// Role: helper de matching Connection → Company (Sprint B).
//
// Quand un callback OAuth Firm Pennylane retourne 3 dossiers clients,
// pour chacun on appelle `findOrCreateCompanyForConnection` qui :
//   - cherche un mapping existant via (connectionId, externalCompanyId)
//   - si trouvé : récupère la Company existante (réutilisation)
//   - sinon : crée une nouvelle Company + le caller s'occupe de créer
//     le mapping correspondant via connectionCompanyStore.createMapping
//
// Brief 17/05/2026 (audit-sprint-B Q1) : matching strict par
// (provider, externalCompanyId) — pas de matching cross-provider par
// SIREN en Sprint B. Si l'user reconnecte un dossier Pennylane déjà
// présent côté MyU avec le même SIREN, ce seront 2 Companies distinctes.

import { createCompany, getCompany } from "@/services/companies/companyStore";
import { findMappingByExternalRef } from "@/services/companies/connectionCompanyStore";
import type {
  CompanyRecord,
  CompanySource,
} from "@/services/companies/types";

export interface FindOrCreateCompanyParams {
  userId: string;
  connectionId: string;
  source: CompanySource;
  /**
   * ID externe côté provider (ex: Pennylane company_id). Clé de matching.
   */
  externalCompanyId: string;
  /**
   * Métadonnées du dossier — utilisées UNIQUEMENT lors de la création.
   * Si la Company existe déjà, les champs ne sont PAS écrasés (Sprint B
   * — pas de sync de métadonnées en automatique pour éviter d'écraser
   * une saisie utilisateur).
   */
  companyMetadata: {
    name?: string;
    siren?: string;
  };
}

export interface FindOrCreateCompanyResult {
  company: CompanyRecord;
  /**
   * `true` si une nouvelle Company a été créée, `false` si on a réutilisé
   * une Company existante via mapping. Utile pour le caller qui veut
   * logger / compter / dispatcher.
   */
  isNew: boolean;
}

/**
 * Trouve ou crée une Company correspondant à un dossier provider.
 *
 * Algorithme :
 *   1. Cherche un mapping existant `(connectionId, externalCompanyId)`.
 *   2. Si trouvé → récupère la Company + retourne `{ company, isNew: false }`.
 *      Cas Sprint B : reconnexion / re-sync — on réutilise.
 *   3. Si pas trouvé → crée une nouvelle Company via companyStore et
 *      retourne `{ company, isNew: true }`. Le caller doit ensuite créer
 *      le mapping `connection_companies` correspondant.
 *
 * NB : ce helper NE crée PAS le mapping lui-même. C'est le caller qui
 * gère cette étape (typiquement le callback OAuth Firm) — permet de
 * batcher proprement la création des mappings après plusieurs appels.
 */
export async function findOrCreateCompanyForConnection(
  params: FindOrCreateCompanyParams
): Promise<FindOrCreateCompanyResult> {
  const externalCompanyId = params.externalCompanyId.trim();
  if (!externalCompanyId) {
    throw new Error(
      "[companyMatching] externalCompanyId requis pour identifier le dossier provider."
    );
  }

  // 1. Cherche un mapping existant pour cette Connection + ce dossier.
  const existingMapping = await findMappingByExternalRef(
    params.connectionId,
    externalCompanyId
  );

  if (existingMapping) {
    const existingCompany = await getCompany(existingMapping.companyId);
    if (existingCompany) {
      console.info(
        `[companyMatching] reuse company=${existingCompany.id} ` +
          `for connection=${params.connectionId} externalCompanyId=${externalCompanyId}`
      );
      return { company: existingCompany, isNew: false };
    }
    // Cas dégénéré : le mapping existe mais la Company a été supprimée
    // (hors-script, manuel console). On log + on retombe sur la création.
    console.warn(
      `[companyMatching] mapping ${existingMapping.id} orphelin ` +
        `(company ${existingMapping.companyId} introuvable) — création d'une nouvelle Company`
    );
  }

  // 2. Crée une nouvelle Company.
  const name = params.companyMetadata.name?.trim() || `Dossier ${externalCompanyId}`;
  const siren = params.companyMetadata.siren?.trim() || undefined;

  const company = await createCompany({
    ownerUserId: params.userId,
    name,
    siren,
    source: params.source,
    status: "active",
    externalCompanyId,
  });

  console.info(
    `[companyMatching] create company=${company.id} name="${name}" ` +
      `source=${params.source} externalCompanyId=${externalCompanyId} for user=${params.userId}`
  );
  return { company, isNew: true };
}
