// File: app/api/ai/ask/route.test.ts
// Role: tests d'intégration de la route POST /api/ai/ask. On mocke l'auth
// Firebase, le store de conversations, le rate limit, et on vérifie le
// branchement create/addMessage + l'enveloppe de réponse.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/server/requireAuth", () => ({
  AuthenticationError: class extends Error {
    status = 401;
    constructor(m: string, status: 401 | 403 = 401) {
      super(m);
      this.status = status;
    }
  },
  requireAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/server/rateLimit", () => ({
  enforceRouteRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/ai/chatStore", () => ({
  createConversation: vi.fn(),
  addMessage: vi.fn(),
  getConversation: vi.fn(),
}));

vi.mock("@/lib/ai/rateLimit", () => ({
  consumeDailyQuota: vi.fn(),
}));

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getFirebaseAdminFirestore: vi.fn(),
}));

vi.mock("@/lib/ai/aiService", () => ({
  getAiService: vi.fn(),
}));

import { POST } from "@/app/api/ai/ask/route";
import { requireAuthenticatedUser } from "@/lib/server/requireAuth";
import {
  addMessage,
  createConversation,
  getConversation,
} from "@/lib/ai/chatStore";
import { consumeDailyQuota } from "@/lib/ai/rateLimit";
import { getAiService } from "@/lib/ai/aiService";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";

function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/ai/ask", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/ask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue("user-1");
    (consumeDailyQuota as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      remaining: 19,
      used: 1,
    });
    (getAiService as ReturnType<typeof vi.fn>).mockReturnValue({
      ask: vi.fn().mockResolvedValue({ answer: "Réponse mock", mode: "mock" }),
    });
    (createConversation as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "conv-new",
      kpiId: "ebitda",
      title: "Question",
      createdAt: 0,
      lastMessageAt: 0,
      messageCount: 2,
      lastAnswerPreview: "Réponse mock",
      messages: [],
    });
    (addMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("retourne 401 si pas authentifié", async () => {
    const { AuthenticationError } = await import("@/lib/server/requireAuth");
    (requireAuthenticatedUser as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new (AuthenticationError as unknown as { new (m: string): Error })("Token absent")
    );
    const res = await POST(makeRequest({ question: "test" }));
    expect(res.status).toBe(401);
  });

  it("retourne 400 si la question est vide", async () => {
    const res = await POST(makeRequest({ question: "  " }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/question/i);
  });

  it("retourne 400 si la question dépasse 2000 caractères", async () => {
    const longQuestion = "a".repeat(2001);
    const res = await POST(makeRequest({ question: longQuestion }));
    expect(res.status).toBe(400);
  });

  it("retourne 429 quand le quota quotidien est dépassé", async () => {
    (consumeDailyQuota as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      used: 21,
    });
    const res = await POST(makeRequest({ question: "test" }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.remainingQuota).toBe(0);
  });

  it("crée une nouvelle conversation quand aucun conversationId n'est fourni", async () => {
    const res = await POST(
      makeRequest({ question: "Pourquoi mon EBITDA ?", kpiId: "ebitda" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.answer).toBe("Réponse mock");
    expect(json.conversationId).toBe("conv-new");
    expect(json.remainingQuota).toBe(19);
    expect(json.mode).toBe("mock");
    expect(createConversation).toHaveBeenCalledWith({
      userId: "user-1",
      kpiId: "ebitda",
      question: "Pourquoi mon EBITDA ?",
      answer: "Réponse mock",
    });
    expect(addMessage).not.toHaveBeenCalled();
  });

  it("append à une conversation existante quand conversationId fourni", async () => {
    (getConversation as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "conv-1",
      kpiId: "ebitda",
      title: "T",
      createdAt: 0,
      lastMessageAt: 0,
      messageCount: 2,
      lastAnswerPreview: "x",
      messages: [],
    });

    const res = await POST(
      makeRequest({
        question: "Et le BFR ?",
        conversationId: "conv-1",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.conversationId).toBe("conv-1");
    expect(addMessage).toHaveBeenCalledWith({
      userId: "user-1",
      conversationId: "conv-1",
      question: "Et le BFR ?",
      answer: "Réponse mock",
    });
    expect(createConversation).not.toHaveBeenCalled();
  });

  it("retourne 404 quand le conversationId fourni n'existe pas", async () => {
    (getConversation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await POST(
      makeRequest({ question: "Continue", conversationId: "nope" })
    );
    expect(res.status).toBe(404);
  });

  it("vérifie l'ownership de l'analyse via Firestore", async () => {
    const get = vi.fn().mockResolvedValue({
      exists: true,
      id: "an-1",
      data: () => ({ userId: "user-OTHER", kpis: {} }),
    });
    (getFirebaseAdminFirestore as ReturnType<typeof vi.fn>).mockReturnValue({
      collection: () => ({
        doc: () => ({ get }),
      }),
    });
    const res = await POST(
      makeRequest({ question: "x", analysisId: "an-1" })
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/appartient/i);
  });

  it("ignore un userLevel inconnu et retombe sur 'intermediate'", async () => {
    const askMock = vi.fn().mockResolvedValue({ answer: "ok", mode: "mock" });
    (getAiService as ReturnType<typeof vi.fn>).mockReturnValue({ ask: askMock });

    await POST(
      makeRequest({ question: "x", userLevel: "weird" })
    );
    expect(askMock).toHaveBeenCalledWith(
      expect.objectContaining({ userLevel: "intermediate" })
    );
  });
});
