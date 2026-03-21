// lib/server/authEmailService.ts
// Regroupe l'envoi des emails d'authentification (verification + reset) via Firebase Admin et Resend.
import type { ActionCodeSettings } from "firebase-admin/auth";
import { buildPasswordResetEmailTemplate } from "@/lib/email/templates/passwordResetEmailTemplate";
import { buildVerificationEmailTemplate } from "@/lib/email/templates/verificationEmailTemplate";
import { getFirebaseAdminAuth } from "@/lib/server/firebaseAdmin";
import { getResendClient, getResendFromEmail } from "@/lib/server/resendClient";

type SendVerificationEmailInput = {
  idToken: string;
  email: string;
  firstName?: string;
  origin?: string;
};

type SendPasswordResetEmailInput = {
  email: string;
  firstName?: string;
  origin?: string;
};

export async function sendVerificationEmail(input: SendVerificationEmailInput): Promise<void> {
  const auth = getFirebaseAdminAuth();

  // On valide le token pour garantir que seul l'utilisateur courant declenche son email de verification.
  const decodedToken = await auth.verifyIdToken(input.idToken);
  const normalizedEmail = input.email.trim().toLowerCase();
  const decodedEmail = decodedToken.email?.trim().toLowerCase();

  if (!decodedEmail || decodedEmail !== normalizedEmail) {
    throw new Error("Token utilisateur invalide pour l'email de verification.");
  }

  const verificationLink = await auth.generateEmailVerificationLink(
    normalizedEmail,
    buildActionCodeSettings({
      origin: input.origin,
      targetPath: "/",
      handleCodeInApp: false
    })
  );

  const template = buildVerificationEmailTemplate({
    firstName: input.firstName,
    verificationUrl: verificationLink
  });

  await getResendClient().emails.send({
    from: getResendFromEmail(),
    to: normalizedEmail,
    subject: template.subject,
    html: template.html,
    text: template.text
  });
}

export async function sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void> {
  const auth = getFirebaseAdminAuth();
  const normalizedEmail = input.email.trim().toLowerCase();

  let resetLink: string;

  try {
    resetLink = await auth.generatePasswordResetLink(
      normalizedEmail,
      buildActionCodeSettings({
        origin: input.origin,
        targetPath: "/reset-password",
        handleCodeInApp: true
      })
    );
  } catch (error) {
    const code = extractFirebaseAdminErrorCode(error);

    // On masque volontairement le cas "utilisateur inexistant" pour eviter l'enumeration d'emails.
    if (code === "auth/user-not-found") {
      return;
    }

    throw error;
  }

  const template = buildPasswordResetEmailTemplate({
    firstName: input.firstName,
    resetUrl: resetLink
  });

  await getResendClient().emails.send({
    from: getResendFromEmail(),
    to: normalizedEmail,
    subject: template.subject,
    html: template.html,
    text: template.text
  });
}

function buildActionCodeSettings({
  origin,
  targetPath,
  handleCodeInApp
}: {
  origin?: string;
  targetPath: `/${string}`;
  handleCodeInApp: boolean;
}): ActionCodeSettings {
  const baseUrl = resolveAppBaseUrl(origin);

  return {
    url: `${baseUrl}${targetPath}`,
    handleCodeInApp
  };
}

function resolveAppBaseUrl(origin?: string): string {
  const sanitizedOrigin = sanitizeOrigin(origin);
  if (sanitizedOrigin) {
    return sanitizedOrigin;
  }

  const envUrl = sanitizeOrigin(process.env.APP_BASE_URL) ?? sanitizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (envUrl) {
    return envUrl;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

function sanitizeOrigin(origin: string | undefined): string | null {
  if (!origin) {
    return null;
  }

  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function extractFirebaseAdminErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

