// File: lib/server/dataSources.test.ts
// Tests du getter Admin SDK avec cache 30s.

import { describe, expect, it, vi, beforeEach } from "vitest";

// Spy partagé. Note : `vi.hoisted` permet de référencer des constantes
// définies dans le fichier de test depuis une vi.mock factory (qui est
// elle-même hoistée au top).
const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }));

vi.mock("firebase-admin/firestore", () => {
  class FakeTimestamp {
    constructor(public iso: string) {}
    toDate(): Date {
      return new Date(this.iso);
    }
  }
  return {
    Timestamp: FakeTimestamp,
    getFirestore: () => ({ collection: vi.fn() }),
  };
});

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getFirebaseAdminFirestore: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({ get: getSpy }),
        }),
      }),
    }),
  }),
}));

// Re-import du Timestamp mocké pour l'utiliser dans les tests.
const { Timestamp: FakeTimestamp } = await import("firebase-admin/firestore");

import {
  getActiveDataSourceServer,
  invalidateActiveDataSourceCache,
} from "@/lib/server/dataSources";

beforeEach(() => {
  getSpy.mockReset();
  invalidateActiveDataSourceCache();
});

describe("getActiveDataSourceServer", () => {
  it("retourne EMPTY quand le doc n'existe pas", async () => {
    getSpy.mockResolvedValueOnce({ exists: false, data: () => null });

    const result = await getActiveDataSourceServer("user-1");

    expect(result.activeAccountingSource).toBeNull();
    expect(result.activeBankingSource).toBeNull();
    expect(result.activeFecFolderName).toBeNull();
    expect(result.createdAt).toBeNull();
    expect(result.updatedAt).toBeNull();
  });

  it("décode un doc valide avec Pennylane actif", async () => {
    getSpy.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        activeAccountingSource: "pennylane",
        activeBankingSource: "bridge",
        activeFecFolderName: null,
        createdAt: new FakeTimestamp("2026-05-06T12:00:00.000Z"),
        updatedAt: new FakeTimestamp("2026-05-07T14:30:00.000Z"),
      }),
    });

    const result = await getActiveDataSourceServer("user-1");

    expect(result.activeAccountingSource).toBe("pennylane");
    expect(result.activeBankingSource).toBe("bridge");
    expect(result.activeFecFolderName).toBeNull();
    expect(result.createdAt).toBe("2026-05-06T12:00:00.000Z");
    expect(result.updatedAt).toBe("2026-05-07T14:30:00.000Z");
  });

  it("ignore le folder si la source n'est pas FEC (cohérence)", async () => {
    getSpy.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        activeAccountingSource: "pennylane",
        activeFecFolderName: "Cabinet Orphelin", // valeur résiduelle
      }),
    });

    const result = await getActiveDataSourceServer("user-1");
    expect(result.activeFecFolderName).toBeNull();
  });

  it("retourne le folder quand source = FEC", async () => {
    getSpy.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        activeAccountingSource: "fec",
        activeFecFolderName: "Cabinet Dupont",
      }),
    });

    const result = await getActiveDataSourceServer("user-1");
    expect(result.activeAccountingSource).toBe("fec");
    expect(result.activeFecFolderName).toBe("Cabinet Dupont");
  });

  it("string invalide → null safe (résilient aux migrations / typos)", async () => {
    getSpy.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        activeAccountingSource: "sage_unknown", // pas dans ACCOUNTING_SOURCES
        activeBankingSource: "ing_unknown", // pas dans BANKING_SOURCES
      }),
    });

    const result = await getActiveDataSourceServer("user-1");
    expect(result.activeAccountingSource).toBeNull();
    expect(result.activeBankingSource).toBeNull();
  });
});

describe("cache mémoire 30s", () => {
  it("hit : un 2e appel dans la fenêtre cache ne refait pas le get Firestore", async () => {
    getSpy.mockResolvedValue({
      exists: true,
      data: () => ({ activeAccountingSource: "pennylane" }),
    });

    await getActiveDataSourceServer("user-1");
    await getActiveDataSourceServer("user-1");
    await getActiveDataSourceServer("user-1");

    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it("invalidateActiveDataSourceCache(uid) force un nouveau get pour cet user", async () => {
    getSpy.mockResolvedValue({
      exists: true,
      data: () => ({ activeAccountingSource: "pennylane" }),
    });

    await getActiveDataSourceServer("user-1");
    invalidateActiveDataSourceCache("user-1");
    await getActiveDataSourceServer("user-1");

    expect(getSpy).toHaveBeenCalledTimes(2);
  });

  it("le cache est par-userId (les autres users ne sont pas impactés)", async () => {
    getSpy.mockResolvedValue({
      exists: true,
      data: () => ({ activeAccountingSource: "pennylane" }),
    });

    await getActiveDataSourceServer("user-1");
    await getActiveDataSourceServer("user-2");

    expect(getSpy).toHaveBeenCalledTimes(2);
  });
});
