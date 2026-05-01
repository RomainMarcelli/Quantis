// File: services/integrations/adapters/bridge/__tests__/client.test.ts
// Role: tests sur la pagination cursor-based du BridgeClient. On stub fetch
// global et on vérifie que `paginate` boucle bien jusqu'à `next_uri = null`,
// et qu'il borne avec `maxPages` si l'API tourne en boucle (sécurité).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BridgeClient } from "@/services/integrations/adapters/bridge/client";

const originalFetch = global.fetch;

function mockFetchSequence(responses: Array<{ status?: number; body: unknown }>) {
  let i = 0;
  global.fetch = vi.fn(async () => {
    const r = responses[i++] ?? { status: 500, body: { error: "no more" } };
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  // Bypass throttle (100ms entre 2 requêtes) en mode test pour rester rapide.
  // Le client ne dépend pas de timers, c'est juste un setTimeout — on laisse
  // tel quel mais on garde des tests à 1-3 pages max.
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("BridgeClient.paginate", () => {
  it("itère jusqu'à next_uri null et concatène les ressources", async () => {
    mockFetchSequence([
      {
        body: {
          resources: [{ id: 1 }, { id: 2 }],
          pagination: { next_uri: "/v3/aggregation/transactions?after=cursor1" },
        },
      },
      {
        body: {
          resources: [{ id: 3 }, { id: 4 }],
          pagination: { next_uri: null },
        },
      },
    ]);
    const client = new BridgeClient({ clientId: "cid", clientSecret: "csec" });
    const result = await client.paginate<{ id: number }>("/v3/aggregation/transactions");
    expect(result.map((r) => r.id)).toEqual([1, 2, 3, 4]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("borne à maxPages même si l'API renvoie next_uri en boucle", async () => {
    mockFetchSequence(
      Array.from({ length: 10 }, () => ({
        body: {
          resources: [{ id: 1 }],
          pagination: { next_uri: "/v3/aggregation/transactions?after=loop" },
        },
      }))
    );
    const client = new BridgeClient({ clientId: "cid", clientSecret: "csec" });
    const result = await client.paginate("/v3/aggregation/transactions", { maxPages: 3 });
    expect(result).toHaveLength(3);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("retourne un tableau vide quand la première page est vide", async () => {
    mockFetchSequence([{ body: { resources: [], pagination: { next_uri: null } } }]);
    const client = new BridgeClient({ clientId: "cid", clientSecret: "csec" });
    const result = await client.paginate("/v3/aggregation/accounts");
    expect(result).toEqual([]);
  });

  it("propage l'erreur HTTP sur status non-2xx", async () => {
    mockFetchSequence([{ status: 401, body: { error: "unauthorized" } }]);
    const client = new BridgeClient({ clientId: "cid", clientSecret: "csec" });
    await expect(client.paginate("/v3/aggregation/accounts")).rejects.toThrow(/401/);
  });

  it("inclut les headers Bridge requis (Client-Id, Client-Secret, Bridge-Version)", async () => {
    mockFetchSequence([{ body: { resources: [], pagination: { next_uri: null } } }]);
    const client = new BridgeClient({
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      bridgeVersion: "2025-01-15",
    });
    await client.paginate("/v3/aggregation/accounts");
    const call = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const init = call?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Client-Id"]).toBe("test-client-id");
    expect(headers["Client-Secret"]).toBe("test-client-secret");
    expect(headers["Bridge-Version"]).toBe("2025-01-15");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("ajoute Authorization: Bearer <token> quand userAccessToken fourni", async () => {
    mockFetchSequence([{ body: { resources: [], pagination: { next_uri: null } } }]);
    const client = new BridgeClient({
      clientId: "cid",
      clientSecret: "csec",
      userAccessToken: "user-token-abc",
    });
    await client.paginate("/v3/aggregation/transactions");
    const call = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const init = call?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer user-token-abc");
  });
});
