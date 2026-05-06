// File: app/api/ai/conversations/route.ts
// Role: GET /api/ai/conversations — liste les conversations de l'utilisateur
// authentifié pour la page Assistant IA. Pas de pagination dans la première
// version (limite hard à 50 conversations, suffisant pour l'usage attendu).

import { NextRequest, NextResponse } from "next/server";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { listConversations } from "@/lib/ai/chatStore";
import { readRemainingQuota } from "@/lib/ai/rateLimit";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuthenticatedUser(request);
  } catch (err) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  // Liste + quota courant — un seul aller-retour pour le client.
  const [conversations, quota] = await Promise.all([
    listConversations(userId),
    readRemainingQuota(userId),
  ]);

  return NextResponse.json({
    conversations,
    quota: { remaining: quota.remaining, used: quota.used, total: quota.quota },
  });
}
