// app/api/auth/send-verification-email/route.ts
// Endpoint serveur qui envoie l'email de verification de compte via Resend.
import { NextRequest, NextResponse } from "next/server";
import { sendVerificationEmail } from "@/lib/server/authEmailService";
import { enforceRouteRateLimit } from "@/lib/server/rateLimit";
import { logHttpSecurityErrorFromRequest, safeLogSecurityEventFromRequest } from "@/lib/server/securityAudit";

export const runtime = "nodejs";

type VerificationEmailRequestBody = {
  email?: string;
  firstName?: string;
  origin?: string;
};

export async function POST(request: NextRequest) {
  // Limitation anti-flood sur les envois de vérification.
  const rateLimitedResponse = enforceRouteRateLimit(request, {
    routeId: "api-auth-send-verification-email",
    maxRequests: 8,
    windowMs: 15 * 60_000
  });
  if (rateLimitedResponse) {
    return rateLimitedResponse;
  }

  try {
    const body = (await request.json()) as VerificationEmailRequestBody;
    const email = body.email?.trim() ?? "";
    const firstName = body.firstName?.trim() ?? "";
    const origin = body.origin?.trim();

    const idToken = extractBearerToken(request.headers.get("authorization"));

    if (!idToken || !email) {
      await safeLogSecurityEventFromRequest(request, {
        source: "api",
        eventType: "verification_email_missing_payload",
        statusCode: 400,
        userId: null,
        message: "Envoi vérification refusé: token ou email manquant."
      });
      return NextResponse.json(
        { error: "Token utilisateur ou email manquant." },
        { status: 400 }
      );
    }

    await sendVerificationEmail({
      idToken,
      email,
      firstName,
      origin
    });

    await safeLogSecurityEventFromRequest(request, {
      source: "api",
      eventType: "verification_email_sent",
      statusCode: 200,
      userId: null,
      message: "Email de vérification envoyé.",
      metadata: {
        emailDomain: extractEmailDomain(email)
      }
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message = toErrorMessage(error);

    if (message.includes("Token utilisateur invalide")) {
      await logHttpSecurityErrorFromRequest(request, {
        eventType: "verification_email_unauthorized",
        statusCode: 401,
        userId: null,
        message: "Token utilisateur invalide lors de l'envoi de vérification."
      });
      return NextResponse.json({ error: "Non autorise." }, { status: 401 });
    }

    await safeLogSecurityEventFromRequest(request, {
      source: "api",
      eventType: "verification_email_failed",
      statusCode: 500,
      userId: null,
      message
    });

    return NextResponse.json(
      { error: "Impossible d'envoyer l'email de verification pour le moment." },
      { status: 500 }
    );
  }
}

function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erreur inconnue";
}

function extractEmailDomain(email: string): string | null {
  const atIndex = email.lastIndexOf("@");
  if (atIndex < 0) {
    return null;
  }

  const domain = email.slice(atIndex + 1).trim().toLowerCase();
  return domain || null;
}
