// File: services/auth/requireCompanyAccess.ts
// Role: middleware d'autorisation pour les routes API qui consomment une
// Company. À utiliser EN COMPLÉMENT de `requireAuthenticatedUser()` —
// requireAuthenticatedUser valide le token Firebase et retourne le uid,
// requireCompanyAccess valide que ce uid a le droit d'accéder à une
// Company donnée.
//
// Sprint A : seul l'ownerUserId a accès à sa Company.
// Sprint C : on étendra avec un OR sur les firm_members (un user
// cabinet pourra accéder aux Companies dont firmId pointe vers un firm
// dont il est membre).
//
// Convention : ce helper THROW une `CompanyAccessError` typée. Les
// routes peuvent la `catch` pour renvoyer un 403 propre (vs un 500
// générique).

import { getCompany } from "@/services/companies/companyStore";
import type { CompanyRecord } from "@/services/companies/types";

export class CompanyAccessError extends Error {
  constructor(
    message: string,
    public readonly status: 403 | 404,
    public readonly companyId: string,
    public readonly userId: string
  ) {
    super(message);
    this.name = "CompanyAccessError";
  }
}

/**
 * Vérifie que l'utilisateur a le droit d'accéder à une Company.
 *
 * @returns le `CompanyRecord` une fois validé (évite un double fetch
 *          côté caller).
 *
 * @throws  `CompanyAccessError` 404 si la Company n'existe pas.
 * @throws  `CompanyAccessError` 403 si la Company existe mais que l'uid
 *          n'a pas le droit d'y accéder.
 *
 * Pattern d'usage dans une route :
 * ```ts
 * const uid = await requireAuthenticatedUser(request);
 * try {
 *   const { company } = await requireCompanyAccess(uid, companyId);
 *   // ... lire/écrire des données scopées à `company`
 * } catch (e) {
 *   if (e instanceof CompanyAccessError) {
 *     return NextResponse.json({ error: e.message }, { status: e.status });
 *   }
 *   throw e;
 * }
 * ```
 */
export async function requireCompanyAccess(
  userId: string,
  companyId: string
): Promise<{ company: CompanyRecord }> {
  const company = await getCompany(companyId);

  if (!company) {
    throw new CompanyAccessError(
      `Company ${companyId} introuvable.`,
      404,
      companyId,
      userId
    );
  }

  // Sprint A : seul l'ownerUserId est autorisé.
  // Sprint C : ajouter ici la vérification firm_members.
  if (company.ownerUserId !== userId) {
    throw new CompanyAccessError(
      `User ${userId} n'a pas accès à la company ${companyId}.`,
      403,
      companyId,
      userId
    );
  }

  // Status archived : on autorise la lecture (pour les rapports historiques)
  // mais le caller doit faire son propre check si l'écriture doit être
  // bloquée. Le store `archiveCompany` est la voie standard de désactivation.

  return { company };
}
