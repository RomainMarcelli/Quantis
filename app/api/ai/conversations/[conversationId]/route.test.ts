// File: app/api/ai/conversations/[conversationId]/route.test.ts
// Role: tests d'intégration des handlers GET/PATCH/DELETE pour une
// conversation. Auth + chatStore sont mockés. Ownership implicite via
// le chemin Firestore — `getConversation` retournant null = 404.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/server/requireAuth", () => ({
  AuthenticationError: class extends Error {
    status: 401 | 403 = 401;
    constructor(m: string, status: 401 | 403 = 401) {
      super(m);
      this.status = status;
    }
  },
  requireAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/ai/chatStore", () => ({
  getConversation: vi.fn(),
  updateConversationTitle: vi.fn(),
  updateConversationPinned: vi.fn(),
  deleteConversation: vi.fn(),
}));

import {
  DELETE,
  GET,
  PATCH,
} from "@/app/api/ai/conversations/[conversationId]/route";
import { requireAuthenticatedUser } from "@/lib/server/requireAuth";
import {
  deleteConversation,
  getConversation,
  updateConversationPinned,
  updateConversationTitle,
} from "@/lib/ai/chatStore";

function makeRequest(
  method: "GET" | "PATCH" | "DELETE",
  body?: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method,
    headers: { "content-type": "application/json", ...headers },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(
    "http://localhost/api/ai/conversations/conv-1",
    init as unknown as ConstructorParameters<typeof NextRequest>[1]
  );
}

function makeContext(conversationId = "conv-1") {
  return { params: Promise.resolve({ conversationId }) };
}

const existingConv = {
  id: "conv-1",
  kpiId: "ebitda",
  title: "Titre actuel",
  createdAt: 1000,
  lastMessageAt: 2000,
  messageCount: 4,
  lastAnswerPreview: "x",
  pinned: false,
  messages: [],
};

describe("PATCH /api/ai/conversations/[conversationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue("user-1");
    (getConversation as ReturnType<typeof vi.fn>).mockResolvedValue(existingConv);
    (updateConversationTitle as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (updateConversationPinned as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("renomme + épingle en une seule requête (cas nominal)", async () => {
    const res = await PATCH(
      makeRequest("PATCH", { title: "Nouveau titre", pinned: true }),
      makeContext()
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.conversation.title).toBe("Nouveau titre");
    expect(json.conversation.pinned).toBe(true);
    expect(updateConversationTitle).toHaveBeenCalledWith(
      "user-1",
      "conv-1",
      "Nouveau titre"
    );
    expect(updateConversationPinned).toHaveBeenCalledWith("user-1", "conv-1", true);
  });

  it("retourne 401 si pas authentifié", async () => {
    const { AuthenticationError } = await import("@/lib/server/requireAuth");
    (requireAuthenticatedUser as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new (AuthenticationError as unknown as { new (m: string): Error })("Token absent")
    );
    const res = await PATCH(makeRequest("PATCH", { title: "x" }), makeContext());
    expect(res.status).toBe(401);
  });

  it("retourne 404 si la conversation n'appartient pas à l'utilisateur (ou inexistante)", async () => {
    (getConversation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await PATCH(
      makeRequest("PATCH", { title: "x" }),
      makeContext("ghost")
    );
    expect(res.status).toBe(404);
  });

  it("retourne 400 si title est une chaîne vide après trim", async () => {
    const res = await PATCH(
      makeRequest("PATCH", { title: "   " }),
      makeContext()
    );
    expect(res.status).toBe(400);
  });

  it("retourne 400 si title dépasse 80 caractères", async () => {
    const res = await PATCH(
      makeRequest("PATCH", { title: "a".repeat(81) }),
      makeContext()
    );
    expect(res.status).toBe(400);
  });

  it("retourne 400 si pinned n'est pas un booléen", async () => {
    const res = await PATCH(
      makeRequest("PATCH", { pinned: "yes" }),
      makeContext()
    );
    expect(res.status).toBe(400);
  });

  it("retourne 400 si aucun champ fourni", async () => {
    const res = await PATCH(makeRequest("PATCH", {}), makeContext());
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/ai/conversations/[conversationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue("user-1");
    (getConversation as ReturnType<typeof vi.fn>).mockResolvedValue(existingConv);
    (deleteConversation as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("supprime la conversation (cas nominal)", async () => {
    const res = await DELETE(makeRequest("DELETE"), makeContext());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(deleteConversation).toHaveBeenCalledWith("user-1", "conv-1");
  });

  it("retourne 401 si pas authentifié", async () => {
    const { AuthenticationError } = await import("@/lib/server/requireAuth");
    (requireAuthenticatedUser as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new (AuthenticationError as unknown as { new (m: string): Error })("Token absent")
    );
    const res = await DELETE(makeRequest("DELETE"), makeContext());
    expect(res.status).toBe(401);
    expect(deleteConversation).not.toHaveBeenCalled();
  });

  it("retourne 404 si la conversation n'appartient pas à l'utilisateur", async () => {
    (getConversation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await DELETE(makeRequest("DELETE"), makeContext("ghost"));
    expect(res.status).toBe(404);
    expect(deleteConversation).not.toHaveBeenCalled();
  });
});

describe("GET /api/ai/conversations/[conversationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue("user-1");
  });

  it("retourne la conversation existante", async () => {
    (getConversation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(existingConv);
    const res = await GET(makeRequest("GET"), makeContext());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.conversation.id).toBe("conv-1");
  });

  it("retourne 404 si la conversation n'existe pas", async () => {
    (getConversation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await GET(makeRequest("GET"), makeContext());
    expect(res.status).toBe(404);
  });
});
