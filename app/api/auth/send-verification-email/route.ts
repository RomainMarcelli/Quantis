// app/api/auth/send-verification-email/route.ts
// Endpoint serveur qui envoie l'email de verification de compte via Resend.
import { NextRequest, NextResponse } from "next/server";
import { sendVerificationEmail } from "@/lib/server/authEmailService";

export const runtime = "nodejs";

type VerificationEmailRequestBody = {
  email?: string;
  firstName?: string;
  origin?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VerificationEmailRequestBody;
    const email = body.email?.trim() ?? "";
    const firstName = body.firstName?.trim() ?? "";
    const origin = body.origin?.trim();

    const idToken = extractBearerToken(request.headers.get("authorization"));

    if (!idToken || !email) {
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

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message = toErrorMessage(error);

    if (message.includes("Token utilisateur invalide")) {
      return NextResponse.json({ error: "Non autorise." }, { status: 401 });
    }

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
