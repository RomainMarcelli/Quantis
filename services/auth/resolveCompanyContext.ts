// File: services/auth/resolveCompanyContext.ts
// Role: helper rétrocompat Sprint A — résout un `companyId` à partir
// d'un `userId` authentifié + un éventuel `companyId` fourni en input.
//
// Stratégie :
//   1. Si `companyId` fourni explicitement → on appelle requireCompanyAccess
//      pour valider que l'uid a le droit d'y accéder. Pattern "Sprint B+".
//   2. Si `companyId` absent → fallback rétrocompat : on prend la
//      PREMIÈRE Company active du user via listCompaniesForUser (sera
//      unique en Sprint A car 1 user = 1 Company). Pattern "legacy".
//   3. Si aucune Company trouvée → throw CompanyAccessError 404.
//
// Le helper LOG le mode utilisé (explicit | fallback | bootstrap) pour
// permettre de mesurer la migration du front au fil des sprints
// (combien de calls utilisent encore le fallback ?).

import { listCompaniesForUser } from "@/services/companies/companyStore";
import {
  CompanyAccessError,
  requireCompanyAccess,
} from "@/services/auth/requireCompanyAccess";
import type { CompanyRecord } from "@/services/companies/types";

export type CompanyContextMode = "explicit" | "fallback" | "bootstrap";

export interface ResolvedCompanyContext {
  company: CompanyRecord;
  /**
   * Mode de résolution : utile pour les logs/observabilité.
   *   - "explicit"  : un companyId a été passé en input par le front
   *                   (nouveau pattern, Sprint B+)
   *   - "fallback"  : aucun companyId passé, on a pris la 1re Company
   *                   du user (rétrocompat Sprint A)
   *   - "bootstrap" : user juste créé, encore aucune Company (cas rare
   *                   où la route est appelée avant la migration ou
   *                   pour un nouveau signup post-migration sans
   *                   onboarding terminé). Throw 404 dans ce cas
   *                   pour forcer le caller à gérer.
   */
  mode: CompanyContextMode;
}

/**
 * Résout le contexte Company pour la requête courante.
 *
 * @param userId        uid Firebase authentifié (déjà validé en amont).
 * @param companyIdHint companyId reçu via body/query (optionnel).
 */
export async function resolveCompanyContext(
  userId: string,
  companyIdHint?: string | null
): Promise<ResolvedCompanyContext> {
  // Cas 1 : companyId explicite → validation stricte.
  if (companyIdHint && companyIdHint.trim()) {
    const { company } = await requireCompanyAccess(userId, companyIdHint.trim());
    console.info(
      `[resolveCompanyContext] explicit companyId=${company.id} for user=${userId}`
    );
    return { company, mode: "explicit" };
  }

  // Cas 2 : pas de companyId → fallback sur la première Company.
  const companies = await listCompaniesForUser(userId);
  if (companies.length === 0) {
    throw new CompanyAccessError(
      `Aucune Company active pour user ${userId}. Migration incomplète ou onboarding non terminé.`,
      404,
      "(none)",
      userId
    );
  }
  const first = companies[0]!;
  console.info(
    `[resolveCompanyContext] fallback companyId=${first.id} for user=${userId} ` +
    `(${companies.length} company/ies au total — à migrer vers companyId explicite)`
  );
  return { company: first, mode: "fallback" };
}
