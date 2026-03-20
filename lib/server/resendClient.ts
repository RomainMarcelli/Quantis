// lib/server/resendClient.ts
// Expose un client Resend singleton pour les envois transactionnels de l'application.
import { Resend } from "resend";

let cachedResendClient: Resend | null = null;

export function getResendClient(): Resend {
  if (cachedResendClient) {
    return cachedResendClient;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Missing server env var: RESEND_API_KEY");
  }

  cachedResendClient = new Resend(apiKey);
  return cachedResendClient;
}

export function getResendFromEmail(): string {
  // Adresse expediteur configurable pour brancher un domaine verified Resend.
  return process.env.RESEND_FROM_EMAIL ?? "Quantis <onboarding@resend.dev>";
}
