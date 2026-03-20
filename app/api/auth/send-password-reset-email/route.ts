// app/api/auth/send-password-reset-email/route.ts
// Endpoint serveur qui envoie l'email de reinitialisation mot de passe via Resend.
import { NextRequest, NextResponse } from "next/server";
import { sendPasswordResetEmail } from "@/lib/server/authEmailService";

export const runtime = "nodejs";

type PasswordResetEmailRequestBody = {
  email?: string;
  firstName?: string;
  origin?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PasswordResetEmailRequestBody;
    const email = body.email?.trim() ?? "";
    const firstName = body.firstName?.trim() ?? "";
    const origin = body.origin?.trim();

    if (!email || !isValidEmailFormat(email)) {
      return NextResponse.json({ error: "Format d'email invalide." }, { status: 400 });
    }

    await sendPasswordResetEmail({
      email,
      firstName,
      origin
    });

    // Reponse toujours generique pour eviter d'exposer l'existence du compte.
    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Impossible d'envoyer l'email de reinitialisation pour le moment." },
      { status: 500 }
    );
  }
}

function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
