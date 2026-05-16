// GET /api/integrations/pennylane/config
// Renvoie la configuration publique nécessaire au wizard côté client :
//   - companyEnabled : indique si le mode "Entreprise" (OAuth Company API)
//     doit être proposé à l'utilisateur. Le flag réel est PENNYLANE_COMPANY_ENABLED
//     côté serveur ; on l'expose ici pour que le front sache afficher ou
//     non le bouton sans avoir à dupliquer le flag en NEXT_PUBLIC_*.
//
// Pas de secret exposé — uniquement un booléen.
// Pas d'authentification requise : c'est de la config UI publique.

import { NextResponse } from "next/server";
import { isCompanyOAuthEnabled } from "@/services/integrations/adapters/pennylane/auth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    companyEnabled: isCompanyOAuthEnabled(),
  });
}
