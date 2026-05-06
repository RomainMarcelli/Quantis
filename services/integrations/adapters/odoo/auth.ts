// Authentification Odoo : 1 mode supporté = odoo_session.
//
// L'utilisateur fournit instanceUrl + login + apiKey (ou password). On déduit
// la database depuis l'URL pour les instances SaaS odoo.com ; pour les self-hosted,
// l'utilisateur doit la fournir explicitement.

import {
  guessDatabaseFromUrl,
  normalizeInstanceUrl,
  odooVerifyAuth,
} from "@/services/integrations/adapters/odoo/client";
import type { OdooSessionAuth } from "@/types/connectors";

export type BuildOdooAuthInput = {
  instanceUrl: string; // ex: "acme.odoo.com" ou "https://acme.odoo.com"
  login: string; // email
  apiKey: string; // API key (ou mot de passe)
  database?: string; // optionnel ; auto-détecté pour les instances SaaS
};

export async function buildOdooSessionAuth(
  input: BuildOdooAuthInput
): Promise<OdooSessionAuth> {
  const instanceUrl = normalizeInstanceUrl(input.instanceUrl);
  const database = input.database?.trim() || guessDatabaseFromUrl(instanceUrl);
  if (!database) {
    throw new Error(
      "Impossible de déterminer la base Odoo. Fournis le nom de la base manuellement (champ 'database')."
    );
  }
  const login = input.login.trim();
  const apiKey = input.apiKey.trim();

  if (!login || !apiKey) {
    throw new Error("login et apiKey sont obligatoires.");
  }

  const verify = await odooVerifyAuth({ instanceUrl, database, login, apiKey });
  if (!verify.ok) {
    throw new Error(verify.error ?? "Identifiants Odoo invalides.");
  }

  return {
    mode: "odoo_session",
    accessToken: apiKey,
    instanceUrl,
    database,
    login,
    externalCompanyId: login, // l'identifiant utilisateur fait office d'identifiant fonctionnel
  };
}
