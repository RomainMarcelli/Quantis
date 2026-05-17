// GET /api/integrations/pennylane/config
// Renvoie la configuration publique nécessaire au wizard côté client :
//   - companyEnabled : indique si le mode "Entreprise" (OAuth Company API)
//     doit être proposé à l'utilisateur. Le flag réel est
//     PENNYLANE_COMPANY_ENABLED côté serveur.
//   - firmVisible : indique si la tuile OAuth Firm doit être affichée dans
//     l'UI. Par défaut false en prod (les bêta-testeurs sont des dirigeants
//     TPE/PME, pas des cabinets). Antoine peut activer le flag sur une
//     preview Vercel via PENNYLANE_FIRM_VISIBLE=true pour tester le flow
//     OAuth Firm bout-en-bout sans exposer la tuile aux dirigeants.
//
// Pas de secret exposé — uniquement des booléens.
// Pas d'authentification requise : c'est de la config UI publique.

import { NextResponse } from "next/server";
import {
  isCompanyOAuthEnabled,
  isFirmOAuthVisible,
} from "@/services/integrations/adapters/pennylane/auth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    companyEnabled: isCompanyOAuthEnabled(),
    firmVisible: isFirmOAuthVisible(),
  });
}
