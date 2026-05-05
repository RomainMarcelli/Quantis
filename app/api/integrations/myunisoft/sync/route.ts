// POST /api/integrations/myunisoft/sync
// Déclenche un sync pour une connection MyUnisoft. Identique à la route Pennylane,
// l'orchestrator route automatiquement vers le bon adapter via le registry.

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
  const rateLimitedResponse = enforceRouteRateLimit(request, {
    routeId: "api-integrations-myunisoft-sync",
    maxRequests: 6,
    windowMs: 60_000,
  });
  if (rateLimitedResponse) return rateLimitedResponse;

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

    let analysis: { analysisId: string; fiscalYear: number | null } | null = null;
    const hasAnyData = report.entities.some((e) => e.itemsPersisted > 0);
    if (hasAnyData) {
      try {
        const periodEnd = new Date();
        const periodStart = new Date();
        periodStart.setMonth(periodStart.getMonth() - DEFAULT_INITIAL_PERIOD_MONTHS);
        analysis = await buildAndPersistAnalysisFromSync({
          userId,
          connectionId,
          periodStart,
          periodEnd,
        });
      } catch (aggError) {
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
