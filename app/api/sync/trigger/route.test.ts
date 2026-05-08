// Tests de la route /api/sync/trigger — couvrent l'ownership, le rate
// limit, et la propagation du résultat de runSync.
//
// Pourquoi ces tests :
//   - L'ownership est CRITIQUE : si un utilisateur peut sync la
//     connexion d'un autre, on viole l'isolation Firestore (un compte
//     compromis pourrait épuiser les quotas API d'un autre client).
//   - Le rate limit empêche les abus / boucles côté UI (clic
//     compulsif sur "Synchroniser maintenant").
//   - Les messages d'erreur ne doivent PAS leak de détails internes
//     (chemins, stack, ID de connexion non-propre).

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAuthMock,
  runSyncMock,
  buildAndPersistMock,
  getUserConnectionMock,
  rateLimitMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  runSyncMock: vi.fn(),
  buildAndPersistMock: vi.fn(),
  getUserConnectionMock: vi.fn(),
  rateLimitMock: vi.fn(),
}));

vi.mock("@/lib/server/requireAuth", () => ({
  AuthenticationError: class extends Error {
    status: number;
    constructor(message: string, status = 401) {
      super(message);
      this.status = status;
    }
  },
  requireAuthenticatedUser: requireAuthMock,
}));
vi.mock("@/services/integrations/sync/syncOrchestrator", () => ({
  runSync: runSyncMock,
  DEFAULT_INITIAL_PERIOD_MONTHS: 36,
}));
vi.mock("@/services/integrations/sync/buildAnalysisFromSync", () => ({
  buildAndPersistAnalysisFromSync: buildAndPersistMock,
}));
vi.mock("@/services/integrations/storage/connectionStore", () => ({
  getUserConnectionById: getUserConnectionMock,
}));
vi.mock("@/lib/server/rateLimit", () => ({
  checkFixedWindowRateLimit: rateLimitMock,
}));

import { POST } from "@/app/api/sync/trigger/route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/sync/trigger", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const FAKE_REPORT = {
  connectionId: "conn-1",
  provider: "myunisoft",
  mode: "incremental",
  startedAt: "2026-05-08T12:00:00.000Z",
  finishedAt: "2026-05-08T12:00:30.000Z",
  durationMs: 30_000,
  entities: [{ entity: "entries", pagesFetched: 1, itemsPersisted: 100, durationMs: 1000, error: null }],
  error: null,
  status: "success" as const,
  timedOut: false,
};

describe("POST /api/sync/trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue("user-1");
    rateLimitMock.mockReturnValue({
      allowed: true,
      remaining: 0,
      resetAt: Date.now() + 300_000,
      retryAfterSeconds: 300,
    });
    getUserConnectionMock.mockResolvedValue({
      id: "conn-1",
      userId: "user-1",
      provider: "myunisoft",
    });
    runSyncMock.mockResolvedValue(FAKE_REPORT);
    buildAndPersistMock.mockResolvedValue({ analysisId: "analysis-1", fiscalYear: 2026 });
  });

  it("retourne 401 quand l'utilisateur n'est pas authentifié", async () => {
    const { AuthenticationError } = await import("@/lib/server/requireAuth");
    requireAuthMock.mockRejectedValue(new AuthenticationError("Non authentifié.", 401));
    const res = await POST(makeRequest({ connectionId: "conn-1" }));
    expect(res.status).toBe(401);
    expect(runSyncMock).not.toHaveBeenCalled();
  });

  it("retourne 400 si connectionId manquant ou vide", async () => {
    const res1 = await POST(makeRequest({}));
    expect(res1.status).toBe(400);
    const res2 = await POST(makeRequest({ connectionId: "   " }));
    expect(res2.status).toBe(400);
    expect(runSyncMock).not.toHaveBeenCalled();
  });

  it("retourne 403 quand la connexion n'appartient PAS à l'utilisateur (ownership)", async () => {
    // Cas critique sécurité : un user qui forge un connectionId d'un autre
    // ne doit PAS pouvoir déclencher un sync. Le store renvoie null si
    // pas d'ownership match.
    getUserConnectionMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ connectionId: "conn-of-someone-else" }));
    expect(res.status).toBe(403);
    expect(runSyncMock).not.toHaveBeenCalled();
    // Le message d'erreur ne doit PAS révéler l'existence ou non de la
    // connexion (information disclosure → ne dit pas "introuvable").
    const json = await res.json();
    expect(json.error).toBe("Accès refusé.");
  });

  it("retourne 429 quand le rate limit est dépassé (1/5min)", async () => {
    rateLimitMock.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 240_000,
      retryAfterSeconds: 240,
    });
    const res = await POST(makeRequest({ connectionId: "conn-1" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("240");
    expect(runSyncMock).not.toHaveBeenCalled();
  });

  it("appelle runSync en mode incremental + retourne success + lastSyncedAt", async () => {
    const res = await POST(makeRequest({ connectionId: "conn-1" }));
    expect(res.status).toBe(200);
    expect(runSyncMock).toHaveBeenCalledWith({
      userId: "user-1",
      connectionId: "conn-1",
      options: { mode: "incremental" },
    });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.lastSyncedAt).toBe(FAKE_REPORT.finishedAt);
    expect(json.status).toBe("success");
  });

  it("invoque le pipeline KPI uniquement si des entités ont été persistées", async () => {
    runSyncMock.mockResolvedValue({
      ...FAKE_REPORT,
      entities: [{ entity: "entries", pagesFetched: 0, itemsPersisted: 0, durationMs: 100, error: null }],
    });
    const res = await POST(makeRequest({ connectionId: "conn-1" }));
    expect(res.status).toBe(200);
    expect(buildAndPersistMock).not.toHaveBeenCalled();
  });

  it("retourne 500 + message générique quand runSync throw (pas de leak interne)", async () => {
    runSyncMock.mockRejectedValue(new Error("Stack trace internal /var/lib/secrets/..."));
    const res = await POST(makeRequest({ connectionId: "conn-1" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    // Pas de leak de la stack ni du path interne — message stable.
    expect(json.error).toBe("La synchronisation a échoué.");
    expect(JSON.stringify(json)).not.toContain("/var/lib");
  });

  it("ne propage pas l'erreur d'agrégation post-sync (best-effort)", async () => {
    buildAndPersistMock.mockRejectedValue(new Error("Pipeline KPI down"));
    const res = await POST(makeRequest({ connectionId: "conn-1" }));
    // Le sync technique est OK → on retourne 200 même si l'agrégation
    // a échoué. L'utilisateur peut re-trigger manuellement plus tard.
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});
