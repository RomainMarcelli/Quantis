// POST /api/integrations/pennylane/sync
// Déclenche un sync (initial ou incrémental) pour une connection Pennylane existante.
// À l'issue du sync, agrège les données fraîches en un AnalysisRecord (mêmes champs que le front
// consomme déjà via l'upload statique) et persiste dans la collection "analyses".

import { NextResponse, type NextRequest } from "next/server";
import { runSync, DEFAULT_INITIAL_PERIOD_MONTHS } from "@/services/integrations/sync/syncOrchestrator";
import { buildAndPersistAnalysisFromSync } from "@/services/integrations/sync/buildAnalysisFromSync";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { enforceRouteRateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

type SyncRequestBody = {
  connectionId?: string;
  mode?: "initial" | "incremental";
};

export async function POST(request: NextRequest) {
  // Sync = appel coûteux côté Pennylane → rate-limit serré.
  const rateLimitedResponse = enforceRouteRateLimit(request, {
    routeId: "api-integrations-pennylane-sync",
    maxRequests: 6,
    windowMs: 60_000,
  });
  if (rateLimitedResponse) {
    return rateLimitedResponse;
  }

  let userId: string;
  try {
    userId = await requireAuthenticatedUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  let body: SyncRequestBody;
  try {
    body = (await request.json()) as SyncRequestBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const connectionId = body.connectionId?.trim();
  if (!connectionId) {
    return NextResponse.json({ error: "connectionId manquant." }, { status: 400 });
  }

  try {
    const report = await runSync({
      userId,
      connectionId,
      options: { mode: body.mode },
    });

    // Si le sync a au moins partiellement réussi, on matérialise une analyse.
    // Échec total = pas d'analyse produite (rien à agréger).
    let analysis: { analysisId: string; fiscalYear: number | null } | null = null;
    const hasAnyData = report.entities.some((e) => e.itemsPersisted > 0);
    if (hasAnyData) {
      try {
        const periodEnd = new Date();
        const periodStart = new Date();
        // Aligné sur DEFAULT_INITIAL_PERIOD_MONTHS du sync orchestrator pour que
        // la fenêtre du sync (qui peuple les entités) et celle de l'agrégation
        // (qui produit l'AnalysisRecord) soient identiques. Cf. commentaire
        // dans syncOrchestrator pour la justification de la valeur (36 mois).
        periodStart.setMonth(periodStart.getMonth() - DEFAULT_INITIAL_PERIOD_MONTHS);
        analysis = await buildAndPersistAnalysisFromSync({
          userId,
          connectionId,
          periodStart,
          periodEnd,
        });
      } catch (aggError) {
        // L'agrégation peut échouer sans qu'on perde le sync (entités déjà persistées).
        // On signale ; le client peut relancer l'agrégation séparément.
        return NextResponse.json(
          {
            report,
            analysis: null,
            aggregationError: aggError instanceof Error ? aggError.message : "unknown",
          },
          { status: 200 }
        );
      }
    }

    return NextResponse.json({ report, analysis }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Échec du sync.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }
}
