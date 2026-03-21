// app/api/cron/security-audit-cleanup/route.ts
// Exécute la purge mensuelle de tous les logs d'audit sécurité Firestore.
import { NextRequest, NextResponse } from "next/server";
import {
  deleteAllSecurityAuditLogs,
  isValidCronAuthorization,
  logHttpSecurityErrorFromRequest
} from "@/lib/server/securityAudit";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorizationHeader = request.headers.get("authorization");

  // On protège la route cron avec un secret serveur (Bearer token).
  if (!isValidCronAuthorization(authorizationHeader, cronSecret)) {
    await logHttpSecurityErrorFromRequest(request, {
      eventType: "security_audit_cleanup_unauthorized",
      statusCode: 401,
      userId: null,
      message: "Appel non autorisé de la purge mensuelle des logs sécurité."
    });

    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    const result = await deleteAllSecurityAuditLogs();

    return NextResponse.json(
      {
        success: true,
        deletedCount: result.deletedCount,
        batchCount: result.batchCount,
        message: "Purge mensuelle des logs sécurité terminée."
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Échec de la purge mensuelle des logs sécurité.",
        detail: error instanceof Error ? error.message : "Erreur inconnue"
      },
      { status: 500 }
    );
  }
}
