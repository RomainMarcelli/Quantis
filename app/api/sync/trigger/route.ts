// File: app/api/sync/trigger/route.ts
// Role: route unifiée de déclenchement de sync manuel pour toute connexion
// active (Pennylane, MyUnisoft, Bridge, Odoo). Utilisée par le bouton
// "Synchroniser maintenant" sur le dashboard.
//
// Différence avec /api/integrations/{provider}/sync :
//   - Indépendante du provider — l'orchestrator route automatiquement.
//   - Rate limit STRICT : 1 appel / 5 min par (userId × connectionId)
//     vs 6/min sur les routes provider (qui restent pour les flows
//     d'onboarding wizard).
//   - Vérification d'ownership explicite : la connexion doit appartenir
//     à l'utilisateur authentifié (403 sinon).
//   - Réponse stable : { success, lastSyncedAt, status, error? } — le
//     front affiche directement ces champs sans dépendre du SyncReport
//     détaillé du orchestrator.
//
// Sécurité :
//   - Auth via requireAuthenticatedUser (pattern existant).
//   - Pas de stack trace ni de path interne dans les erreurs.
//   - Rate-limit Firestore-less : checkFixedWindowRateLimit avec clé
//     custom userId:connectionId (pas l'IP — un user peut sync depuis
//     plusieurs onglets / appareils sans être bridé par l'IP).

import { NextResponse, type NextRequest } from "next/server";
import { runSync, DEFAULT_INITIAL_PERIOD_MONTHS } from "@/services/integrations/sync/syncOrchestrator";
import { buildAndPersistAnalysisFromSync } from "@/services/integrations/sync/buildAnalysisFromSync";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { checkFixedWindowRateLimit } from "@/lib/server/rateLimit";
import { getUserConnectionById } from "@/services/integrations/storage/connectionStore";
import { resolveCompanyContext } from "@/services/auth/resolveCompanyContext";
import { CompanyAccessError } from "@/services/auth/requireCompanyAccess";

export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX = 1;

type TriggerRequestBody = {
  connectionId?: unknown;
  /** Sprint A multi-tenant — optionnel. Si fourni, on valide l'accès
   *  via requireCompanyAccess. Sinon, fallback rétrocompat sur la
   *  première Company du user (mode dirigeant 1-user = 1-company). */
  companyId?: unknown;
};

type TriggerResponse =
  | {
      success: true;
      lastSyncedAt: string;
      status: "success" | "partial" | "failed";
    }
  | {
      success: false;
      lastSyncedAt: string | null;
      status: "failed";
      error: string;
    };

export async function POST(request: NextRequest) {
  // ─── Auth ─────────────────────────────────────────────────────────
  let userId: string;
  try {
    userId = await requireAuthenticatedUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  // ─── Validation body ───────────────────────────────────────────────
  let body: TriggerRequestBody;
  try {
    body = (await request.json()) as TriggerRequestBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const connectionId =
    typeof body.connectionId === "string" ? body.connectionId.trim() : "";
  if (!connectionId) {
    return NextResponse.json({ error: "connectionId manquant." }, { status: 400 });
  }

  // ─── Ownership : la connexion doit appartenir à l'utilisateur ──────
  const connection = await getUserConnectionById(userId, connectionId);
  if (!connection) {
    // 403 plutôt que 404 — on ne révèle pas l'existence d'une connexion
    // d'un autre utilisateur (information disclosure).
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  // ─── Sprint A multi-tenant — résolution du contexte Company ─────────
  // Si companyId fourni : validation stricte via requireCompanyAccess.
  // Sinon : fallback rétrocompat sur la 1re Company du user. Le log
  // émis par resolveCompanyContext permet de mesurer la migration au
  // fil des sprints (combien de calls ont encore le fallback ?).
  const companyIdHint =
    typeof body.companyId === "string" ? body.companyId.trim() : null;
  try {
    await resolveCompanyContext(userId, companyIdHint);
  } catch (error) {
    if (error instanceof CompanyAccessError) {
      // 404 = pas de Company (migration incomplète), 403 = autre user.
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  // ─── Rate limit : 1 sync / 5 min par (userId × connectionId) ───────
  // Indépendant de l'IP : on autorise les multi-onglets/appareils, on
  // borne juste la fréquence de sync pour cette paire.
  const rlResult = checkFixedWindowRateLimit({
    key: `sync-trigger:${userId}:${connectionId}`,
    maxRequests: RATE_LIMIT_MAX,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!rlResult.allowed) {
    return NextResponse.json(
      {
        error: "Synchronisation déjà effectuée récemment.",
        retryAfterSeconds: rlResult.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rlResult.retryAfterSeconds) },
      }
    );
  }

  // ─── Sync ──────────────────────────────────────────────────────────
  try {
    const report = await runSync({
      userId,
      connectionId,
      options: { mode: "incremental" },
    });

    // Pipeline KPI post-sync (best-effort — un échec n'invalide pas le
    // sync technique, on remonte juste un warning).
    const hasAnyData = report.entities.some((e) => e.itemsPersisted > 0);
    if (hasAnyData) {
      try {
        const periodEnd = new Date();
        const periodStart = new Date();
        periodStart.setMonth(periodStart.getMonth() - DEFAULT_INITIAL_PERIOD_MONTHS);
        await buildAndPersistAnalysisFromSync({
          userId,
          connectionId,
          periodStart,
          periodEnd,
        });
      } catch {
        // L'agrégation a échoué mais le sync brut est OK — on continue.
      }
    }

    const response: TriggerResponse = {
      success: true,
      lastSyncedAt: report.finishedAt,
      status: report.status,
    };
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    // Message générique côté client — pas de stack trace ni de path.
    // L'erreur détaillée est captée par l'orchestrator dans le report
    // et persistée sur la connection (lastSyncStatus / errorMessage).
    void error;
    const response: TriggerResponse = {
      success: false,
      lastSyncedAt: null,
      status: "failed",
      error: "La synchronisation a échoué.",
    };
    return NextResponse.json(response, { status: 500 });
  }
}
