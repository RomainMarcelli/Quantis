// app/api/auth/send-password-reset-email/route.ts
// Endpoint serveur qui envoie l'email de réinitialisation mot de passe via Resend.
import { NextRequest, NextResponse } from "next/server";
import { sendPasswordResetEmail } from "@/lib/server/authEmailService";
import { enforceRouteRateLimit } from "@/lib/server/rateLimit";
import { safeLogSecurityEventFromRequest } from "@/lib/server/securityAudit";

export const runtime = "nodejs";

type PasswordResetEmailRequestBody = {
  email?: string;
  firstName?: string;
  origin?: string;
};

export async function POST(request: NextRequest) {
  // Limitation stricte pour réduire les tentatives d'abus sur la récupération de mot de passe.
  const rateLimitedResponse = enforceRouteRateLimit(request, {
    routeId: "api-auth-send-password-reset-email",
    maxRequests: 5,
    windowMs: 15 * 60_000
  });
  if (rateLimitedResponse) {
    return rateLimitedResponse;
  }

  try {
    const body = (await request.json()) as PasswordResetEmailRequestBody;
    const email = body.email?.trim() ?? "";
    const firstName = body.firstName?.trim() ?? "";
    const origin = body.origin?.trim();

    if (!email || !isValidEmailFormat(email)) {
      await safeLogSecurityEventFromRequest(request, {
        source: "api",
        eventType: "password_reset_request_invalid_email",
        statusCode: 400,
        userId: null,
        message: "Demande reset refusée: format email invalide."
      });
      return NextResponse.json({ error: "Format d'email invalide." }, { status: 400 });
    }

    await sendPasswordResetEmail({
      email,
      firstName,
      origin
    });

    await safeLogSecurityEventFromRequest(request, {
      source: "api",
      eventType: "password_reset_request_sent",
      statusCode: 200,
      userId: null,
      message: "Demande de réinitialisation mot de passe traitée.",
      metadata: {
        emailDomain: extractEmailDomain(email)
      }
    });

    // Reponse toujours generique pour eviter d'exposer l'existence du compte.
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    await safeLogSecurityEventFromRequest(request, {
      source: "api",
      eventType: "password_reset_request_failed",
      statusCode: 500,
      userId: null,
      message: error instanceof Error ? error.message : "Erreur inconnue"
    });
    return NextResponse.json(
      { error: "Impossible d'envoyer l'email de réinitialisation pour le moment." },
      { status: 500 }
    );
  }
}

function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function extractEmailDomain(email: string): string | null {
  const atIndex = email.lastIndexOf("@");
  if (atIndex < 0) {
    return null;
  }

  const domain = email.slice(atIndex + 1).trim().toLowerCase();
  return domain || null;
}
