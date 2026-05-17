// File: services/companies/firmCallbackMapping.ts
// Role: helper pour le callback OAuth Firm Pennylane (Sprint B Tâche 6).
//
// Quand un cabinet termine son flow OAuth Firm, Pennylane retourne via
// /companies la liste des dossiers clients accessibles. Pour chacun :
//   - on cherche / crée la Company correspondante (findOrCreateCompanyForConnection)
//   - on crée le mapping connection_companies (ou on le réactive si déjà
//     présent, cas reconnexion)
//
// Idempotent : relancer le helper sur la même Connection + même liste de
// dossiers ne crée pas de doublons. Utile en cas de retry callback ou
// re-sync forcé.
//
// Découplage volontaire : le helper N'EXÉCUTE PAS le sync. Le caller
// (callback OAuth Firm) décide s'il déclenche `runSyncForFirmConnection`
// immédiatement ou en différé via une route /sync séparée.
//
// Note Sprint B : ce helper sert le futur câblage du callback OAuth Firm
// (qui vit sur la branche feature/maj-connecteurs, pas encore mergée).
// Une fois Firm OAuth réintroduit en prod, il suffira d'appeler ce
// helper post-fetchFirmCompaniesWithToken. Le pattern multi-dossiers
// est ainsi disponible côté serveur dès maintenant.

import {
  createMapping,
  findMappingByExternalRef,
  reactivateMapping,
  type ConnectionCompanyMapping,
} from "@/services/companies/connectionCompanyStore";
import { findOrCreateCompanyForConnection } from "@/services/companies/companyMatching";
import type { CompanyRecord, CompanySource } from "@/services/companies/types";

/**
 * Métadonnées d'un dossier provider retournées par l'OAuth Firm.
 * Forme minimale — chaque adapter peut enrichir (siret, adresse, etc.)
 * sans casser l'interface.
 */
export interface ProviderCompanyDescriptor {
  externalCompanyId: string;
  name?: string;
  siren?: string;
}

export interface FirmCallbackMappingResult {
  /** Mapping créé ou réactivé (1 par dossier). */
  mapping: ConnectionCompanyMapping;
  /** Company associée (créée ou réutilisée). */
  company: CompanyRecord;
  /** `created` = nouvelle entrée, `reactivated` = mapping existant
   *  passé de isActive=false à true, `reused` = mapping déjà actif. */
  outcome: "created" | "reactivated" | "reused";
}

/**
 * Crée / réactive les mappings connection_companies pour une liste de
 * dossiers provider.
 *
 * @param userId         uid Firebase du propriétaire de la Connection.
 * @param connectionId   ID de la Connection qui rapatrie les dossiers.
 * @param source         Source des Companies (ex: "pennylane_oauth").
 * @param companies      Liste de dossiers à matcher (typiquement le
 *                       résultat de fetchFirmCompaniesWithToken).
 *
 * @returns Un tableau de résultats (un par dossier). Idempotent.
 *
 * Loggue chaque outcome pour permettre l'observabilité (combien de
 * dossiers ajoutés vs réutilisés au fil du temps).
 */
export async function createMappingsForFirmCallback(
  userId: string,
  connectionId: string,
  source: CompanySource,
  companies: ProviderCompanyDescriptor[]
): Promise<FirmCallbackMappingResult[]> {
  const results: FirmCallbackMappingResult[] = [];

  for (const desc of companies) {
    const externalCompanyId = desc.externalCompanyId.trim();
    if (!externalCompanyId) {
      console.warn(
        `[firmCallbackMapping] dossier provider sans externalCompanyId ignoré ` +
          `(connection=${connectionId})`
      );
      continue;
    }

    // 1. Find or create the Company.
    const { company, isNew } = await findOrCreateCompanyForConnection({
      userId,
      connectionId,
      source,
      externalCompanyId,
      companyMetadata: { name: desc.name, siren: desc.siren },
    });

    // 2. Cherche un mapping existant (cas reconnexion / retry).
    const existingMapping = await findMappingByExternalRef(
      connectionId,
      externalCompanyId
    );

    if (existingMapping) {
      if (existingMapping.isActive) {
        // Mapping déjà actif → on ne touche pas. Cas typique :
        // re-sync sans déconnexion préalable.
        results.push({
          mapping: existingMapping,
          company,
          outcome: "reused",
        });
        console.info(
          `[firmCallbackMapping] reused mapping=${existingMapping.id} ` +
            `company=${company.id} externalCompanyId=${externalCompanyId}`
        );
      } else {
        // Mapping existait mais avait été désactivé (cas reconnexion
        // après disconnect Sprint B). On réactive.
        await reactivateMapping(existingMapping.id);
        results.push({
          mapping: { ...existingMapping, isActive: true },
          company,
          outcome: "reactivated",
        });
        console.info(
          `[firmCallbackMapping] reactivated mapping=${existingMapping.id} ` +
            `company=${company.id} externalCompanyId=${externalCompanyId}`
        );
      }
      continue;
    }

    // 3. Pas de mapping existant → on en crée un.
    const mapping = await createMapping({
      userId,
      connectionId,
      companyId: company.id,
      externalCompanyId,
      externalCompanyName: desc.name?.trim() || undefined,
      isActive: true,
    });
    results.push({
      mapping,
      company,
      outcome: "created",
    });
    console.info(
      `[firmCallbackMapping] created mapping=${mapping.id} ` +
        `company=${company.id} ${isNew ? "(new company)" : "(existing company)"} ` +
        `externalCompanyId=${externalCompanyId}`
    );
  }

  return results;
}
