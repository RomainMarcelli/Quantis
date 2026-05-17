// GET /api/integrations/pennylane/firm/callback
// LEGACY — cette route a été unifiée dans /api/integrations/pennylane/callback
// pour s'aligner sur l'URL whitelistée chez Pennylane (sans segment /firm/).
//
// Elle reste en place pour ne pas casser :
//   - les liens en cache navigateur des utilisateurs déjà passés par l'ancien flow
//   - les éventuels callbacks Pennylane en flight au moment du déploiement
//
// → redirect 308 vers /api/integrations/pennylane/callback en préservant
//   les query params (code, state, error, ...).

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const target = new URL(
    "/api/integrations/pennylane/callback",
    request.nextUrl.origin
  );
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  return NextResponse.redirect(target, 308);
}
