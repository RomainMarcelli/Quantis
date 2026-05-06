// Authentification MyUnisoft : 1 mode supporté = partner_jwt.
//
// L'utilisateur fournit un JWT généré côté MyUnisoft (par cabinet/société).
// La clé partenaire X-Third-Party-Secret est lue depuis l'env serveur (commune à tous
// les utilisateurs de notre intégration).

import { myUnisoftVerifyAuth } from "@/services/integrations/adapters/myunisoft/client";
import type { Connection, PartnerJwtAuth } from "@/types/connectors";

export async function buildPartnerJwtAuth(params: {
  accessToken: string;
  externalCompanyId: string;
}): Promise<PartnerJwtAuth> {
  const auth: PartnerJwtAuth = {
    mode: "partner_jwt",
    accessToken: params.accessToken.trim(),
    externalCompanyId: params.externalCompanyId.trim(),
  };

  const tempConnection = { auth } as unknown as Connection;
  const valid = await myUnisoftVerifyAuth(tempConnection);
  if (!valid) {
    throw new Error("Le JWT MyUnisoft fourni est invalide ou révoqué.");
  }

  return auth;
}
