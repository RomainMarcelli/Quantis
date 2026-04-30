// File: app/api/ai/conversations/[conversationId]/route.ts
// Role: GET d'une conversation entière (avec messages). Utilisé quand
// l'utilisateur ré-ouvre une conversation depuis la page Assistant IA.

import { NextRequest, NextResponse } from "next/server";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { getConversation } from "@/lib/ai/chatStore";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  let userId: string;
  try {
    userId = await requireAuthenticatedUser(request);
  } catch (err) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const { conversationId } = await context.params;
  const conv = await getConversation(userId, conversationId);
  if (!conv) {
    return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
  }

  return NextResponse.json({ conversation: conv });
}
