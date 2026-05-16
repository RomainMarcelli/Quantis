// GET /api/integrations/connectors/visibility
// Renvoie la map de visibilité de tous les connecteurs au front.
// Brief 14/05/2026 — source unique consommée par le wizard /documents,
// la grille AccountingTilesGrid et la tuile Bridge du bloc bancaire.
//
// Pas de secret exposé — uniquement des booléens. Pas d'auth requise
// (config UI publique, alignée sur /api/integrations/pennylane/config).

import { NextResponse } from "next/server";
import { getConnectorVisibility } from "@/services/integrations/connectorVisibility";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getConnectorVisibility());
}
