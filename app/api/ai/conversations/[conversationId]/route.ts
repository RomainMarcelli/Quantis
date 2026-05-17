// File: app/api/ai/conversations/[conversationId]/route.ts
// Role: opérations CRUD sur une conversation IA.
//   - GET    : récupère une conversation entière (avec messages)
//   - PATCH  : met à jour le titre et/ou l'état épinglé
//   - DELETE : supprime définitivement la conversation
//
// Ownership implicite via le chemin Firestore `chats/{userId}/conversations/{id}`.

import { NextRequest, NextResponse } from "next/server";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import {
  deleteConversation,
  getConversation,
  updateConversationPinned,
  updateConversationTitle,
} from "@/lib/ai/chatStore";

export const runtime = "nodejs";

const TITLE_MAX_LENGTH = 80;

async function authenticate(
  request: NextRequest
): Promise<{ userId: string } | { errorResponse: NextResponse }> {
  try {
    const userId = await requireAuthenticatedUser(request);
    return { userId };
  } catch (err) {
    if (err instanceof AuthenticationError) {
      return {
        errorResponse: NextResponse.json(
          { error: err.message },
          { status: err.status }
        ),
      };
    }
    return {
      errorResponse: NextResponse.json(
        { error: "Authentification requise." },
        { status: 401 }
      ),
    };
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  const auth = await authenticate(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  const { conversationId } = await context.params;
  const conv = await getConversation(auth.userId, conversationId);
  if (!conv) {
    return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
  }

  return NextResponse.json({ conversation: conv });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  const auth = await authenticate(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  const { conversationId } = await context.params;

  // Body parse + validation. On accepte { title }, { pinned } ou les deux.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body invalide." }, { status: 400 });
  }
  const { title, pinned } = body as { title?: unknown; pinned?: unknown };

  if (title === undefined && pinned === undefined) {
    return NextResponse.json(
      { error: "Aucun champ à mettre à jour (title ou pinned requis)." },
      { status: 400 }
    );
  }

  let normalizedTitle: string | undefined;
  if (title !== undefined) {
    if (typeof title !== "string") {
      return NextResponse.json({ error: "Le titre doit être une chaîne." }, { status: 400 });
    }
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      return NextResponse.json({ error: "Le titre ne peut pas être vide." }, { status: 400 });
    }
    if (trimmed.length > TITLE_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Le titre dépasse ${TITLE_MAX_LENGTH} caractères.` },
        { status: 400 }
      );
    }
    normalizedTitle = trimmed;
  }

  let normalizedPinned: boolean | undefined;
  if (pinned !== undefined) {
    if (typeof pinned !== "boolean") {
      return NextResponse.json(
        { error: "Le champ pinned doit être un booléen." },
        { status: 400 }
      );
    }
    normalizedPinned = pinned;
  }

  // Vérifie l'existence (mapping ownership/404). On lit une seule fois et on
  // applique les updates ensuite.
  const existing = await getConversation(auth.userId, conversationId);
  if (!existing) {
    return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
  }

  try {
    if (normalizedTitle !== undefined) {
      await updateConversationTitle(auth.userId, conversationId, normalizedTitle);
    }
    if (normalizedPinned !== undefined) {
      await updateConversationPinned(auth.userId, conversationId, normalizedPinned);
    }
  } catch {
    // Le doc a été supprimé entre la vérif et l'update — comportement rare,
    // on remappe en 404 plutôt qu'en 500.
    return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
  }

  return NextResponse.json({
    conversation: {
      id: conversationId,
      title: normalizedTitle ?? existing.title,
      pinned: normalizedPinned ?? existing.pinned,
    },
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  const auth = await authenticate(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  const { conversationId } = await context.params;

  const existing = await getConversation(auth.userId, conversationId);
  if (!existing) {
    return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
  }

  try {
    await deleteConversation(auth.userId, conversationId);
  } catch {
    return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
