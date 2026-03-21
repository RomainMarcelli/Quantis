// app/api/security/audit/route.ts
// Endpoint serveur de réception des événements sécurité émis par le frontend.
import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdminAuth } from "@/lib/server/firebaseAdmin";
import { enforceRouteRateLimit } from "@/lib/server/rateLimit";
import { logHttpSecurityErrorFromRequest, safeLogSecurityEventFromRequest } from "@/lib/server/securityAudit";

export const runtime = "nodejs";

type SecurityAuditRequestBody = {
  eventType?: string;
  statusCode?: number;
  userId?: string | null;
  message?: string;
  metadata?: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  // Anti-flood sur l'endpoint d'audit pour éviter d'en faire une cible d'abus.
  const rateLimitedResponse = enforceRouteRateLimit(request, {
    routeId: "api-security-audit",
    maxRequests: 120,
    windowMs: 60_000
  });
  if (rateLimitedResponse) {
    return rateLimitedResponse;
  }

  try {
    const body = (await request.json()) as SecurityAuditRequestBody;
    const eventType = body.eventType?.trim() ?? "";
    const requestedUserId = body.userId?.trim() || null;

    if (!eventType) {
      return NextResponse.json({ error: "eventType manquant." }, { status: 400 });
    }

    const bearerToken = extractBearerToken(request.headers.get("authorization"));
    let authenticatedUserId: string | null = null;

    if (bearerToken) {
      try {
        const decodedToken = await getFirebaseAdminAuth().verifyIdToken(bearerToken);
        authenticatedUserId = decodedToken.uid;
      } catch {
        await logHttpSecurityErrorFromRequest(request, {
          eventType: "security_audit_unauthorized",
          statusCode: 401,
          userId: null,
          message: "Token Bearer invalide pour /api/security/audit."
        });
        return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
      }
    }

    // Si un token est fourni, on refuse qu'un userId tiers soit injecté.
    if (authenticatedUserId && requestedUserId && requestedUserId !== authenticatedUserId) {
      await logHttpSecurityErrorFromRequest(request, {
        eventType: "security_audit_forbidden_user_mismatch",
        statusCode: 403,
        userId: authenticatedUserId,
        message: "Tentative de log audit avec userId différent du token.",
        metadata: {
          requestedUserId
        }
      });
      return NextResponse.json({ error: "Accès interdit." }, { status: 403 });
    }

    await safeLogSecurityEventFromRequest(request, {
      source: "client",
      eventType,
      statusCode: typeof body.statusCode === "number" ? body.statusCode : undefined,
      userId: authenticatedUserId ?? requestedUserId,
      message: body.message,
      metadata: body.metadata
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Audit indisponible." }, { status: 500 });
  }
}

function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
