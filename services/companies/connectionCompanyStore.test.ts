// File: services/companies/connectionCompanyStore.test.ts
// Role: tests unitaires sur le CRUD du mapping connection_companies (Sprint B).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Fake Firestore in-memory (variante batch+limit) ─────────────────────

function makeFakeFirestore() {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  let nextId = 0;

  function getCol(name: string) {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name)!;
  }

  const batchOps: Array<{ op: "update"; col: string; id: string; patch: Record<string, unknown> }> = [];

  const api = {
    collection(name: string) {
      return {
        doc(id?: string) {
          const docId = id ?? `auto-${++nextId}`;
          return {
            id: docId,
            async set(payload: Record<string, unknown>) {
              getCol(name).set(docId, payload);
            },
            async get() {
              const stored = getCol(name).get(docId);
              return stored
                ? { id: docId, exists: true, data: () => stored, ref: { id: docId, path: `${name}/${docId}` } }
                : { id: docId, exists: false, data: () => undefined, ref: { id: docId, path: `${name}/${docId}` } };
            },
            async update(patch: Record<string, unknown>) {
              const current = getCol(name).get(docId);
              if (!current) throw new Error(`update non-existing ${name}/${docId}`);
              const next = { ...current, ...patch };
              getCol(name).set(docId, next);
            },
          };
        },
        where(field: string, op: string, value: unknown) {
          return makeQuery(name, [{ field, op, value }]);
        },
      };
    },
    batch() {
      return {
        update(ref: { id: string; path: string }, patch: Record<string, unknown>) {
          const [col, id] = ref.path.split("/");
          batchOps.push({ op: "update", col: col!, id: id!, patch });
        },
        async commit() {
          for (const op of batchOps) {
            const current = getCol(op.col).get(op.id);
            if (current) getCol(op.col).set(op.id, { ...current, ...op.patch });
          }
          batchOps.length = 0;
        },
      };
    },
    _collections: collections,
    _reset() {
      collections.clear();
      nextId = 0;
      batchOps.length = 0;
    },
  };

  function makeQuery(name: string, filters: Array<{ field: string; op: string; value: unknown }>, limitN?: number) {
    return {
      where(field: string, op: string, value: unknown) {
        return makeQuery(name, [...filters, { field, op, value }], limitN);
      },
      limit(n: number) {
        return makeQuery(name, filters, n);
      },
      async get() {
        const col = getCol(name);
        const docs: Array<{
          id: string;
          data: () => Record<string, unknown>;
          ref: { id: string; path: string };
        }> = [];
        for (const [id, data] of col.entries()) {
          const matches = filters.every((f) => (f.op === "==" ? data[f.field] === f.value : true));
          if (matches) {
            docs.push({ id, data: () => data, ref: { id, path: `${name}/${id}` } });
            if (limitN !== undefined && docs.length >= limitN) break;
          }
        }
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };
  }

  return api;
}

const fakeDb = makeFakeFirestore();

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getFirebaseAdminFirestore: () => fakeDb,
}));

vi.mock("firebase-admin/firestore", () => ({
  Timestamp: {
    now: () => ({ seconds: 1_700_000_000, nanoseconds: 0, _isTimestamp: true }),
    fromDate: (d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0, _isTimestamp: true }),
  },
  FieldValue: {
    delete: () => ({ _methodName: "delete" }),
  },
}));

import {
  createMapping,
  deactivateMapping,
  deactivateMappingsForConnection,
  findMappingByExternalRef,
  getMappingById,
  listActiveMappingsForUser,
  listMappingsForCompany,
  listMappingsForConnection,
  reactivateMapping,
} from "@/services/companies/connectionCompanyStore";

beforeEach(() => {
  fakeDb._reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const baseInput = {
  userId: "user-1",
  connectionId: "conn-1",
  companyId: "co-1",
  externalCompanyId: "ext-1",
  isActive: true,
};

describe("createMapping", () => {
  it("crée un mapping avec timestamps + id auto-généré", async () => {
    const mapping = await createMapping(baseInput);
    expect(mapping.id).toMatch(/^auto-/);
    expect(mapping.connectionId).toBe("conn-1");
    expect(mapping.companyId).toBe("co-1");
    expect(mapping.externalCompanyId).toBe("ext-1");
    expect(mapping.isActive).toBe(true);
    expect(mapping.createdAt).toBeDefined();
    expect(mapping.updatedAt).toBeDefined();
  });

  it("omet externalCompanyName si undefined (Firestore refuse)", async () => {
    const m = await createMapping({ ...baseInput, externalCompanyName: undefined });
    const stored = fakeDb._collections.get("connection_companies")!.get(m.id)!;
    expect(stored).not.toHaveProperty("externalCompanyName");
  });
});

describe("getMappingById", () => {
  it("retourne null si introuvable", async () => {
    expect(await getMappingById("ghost")).toBeNull();
  });

  it("retourne le mapping s'il existe", async () => {
    const m = await createMapping(baseInput);
    const fetched = await getMappingById(m.id);
    expect(fetched?.id).toBe(m.id);
  });
});

describe("listMappingsForConnection", () => {
  it("liste uniquement les mappings actifs d'une Connection", async () => {
    await createMapping({ ...baseInput, externalCompanyId: "ext-1" });
    await createMapping({ ...baseInput, externalCompanyId: "ext-2" });
    await createMapping({ ...baseInput, externalCompanyId: "ext-3", isActive: false });
    await createMapping({ ...baseInput, connectionId: "conn-2", externalCompanyId: "ext-4" });

    const list = await listMappingsForConnection("conn-1");
    expect(list).toHaveLength(2);
    expect(list.map((m) => m.externalCompanyId).sort()).toEqual(["ext-1", "ext-2"]);
  });

  it("retourne [] si aucun mapping actif", async () => {
    expect(await listMappingsForConnection("ghost")).toEqual([]);
  });
});

describe("listMappingsForCompany", () => {
  it("liste les Connections qui alimentent une Company", async () => {
    await createMapping({ ...baseInput, companyId: "co-1", connectionId: "conn-A" });
    await createMapping({ ...baseInput, companyId: "co-1", connectionId: "conn-B" });
    await createMapping({ ...baseInput, companyId: "co-2", connectionId: "conn-C" });

    const list = await listMappingsForCompany("co-1");
    expect(list).toHaveLength(2);
    expect(list.map((m) => m.connectionId).sort()).toEqual(["conn-A", "conn-B"]);
  });
});

describe("listActiveMappingsForUser", () => {
  it("liste tous les mappings actifs d'un user", async () => {
    await createMapping({ ...baseInput, userId: "user-1" });
    await createMapping({ ...baseInput, userId: "user-1", externalCompanyId: "ext-2" });
    await createMapping({ ...baseInput, userId: "user-1", isActive: false, externalCompanyId: "ext-3" });
    await createMapping({ ...baseInput, userId: "user-2", externalCompanyId: "ext-4" });

    const list = await listActiveMappingsForUser("user-1");
    expect(list).toHaveLength(2);
  });
});

describe("findMappingByExternalRef", () => {
  it("retourne le mapping pour (connectionId, externalCompanyId)", async () => {
    const m = await createMapping({ ...baseInput, externalCompanyId: "ext-A" });
    const found = await findMappingByExternalRef("conn-1", "ext-A");
    expect(found?.id).toBe(m.id);
  });

  it("retourne null si pas de match", async () => {
    await createMapping({ ...baseInput, externalCompanyId: "ext-A" });
    expect(await findMappingByExternalRef("conn-1", "ext-Z")).toBeNull();
  });

  it("retourne aussi les mappings inactifs (pour réactivation)", async () => {
    const m = await createMapping({ ...baseInput, externalCompanyId: "ext-A", isActive: false });
    const found = await findMappingByExternalRef("conn-1", "ext-A");
    expect(found?.id).toBe(m.id);
    expect(found?.isActive).toBe(false);
  });
});

describe("deactivateMapping / reactivateMapping", () => {
  it("toggle isActive correctement", async () => {
    const m = await createMapping(baseInput);
    expect(m.isActive).toBe(true);

    await deactivateMapping(m.id);
    expect((await getMappingById(m.id))?.isActive).toBe(false);

    await reactivateMapping(m.id);
    expect((await getMappingById(m.id))?.isActive).toBe(true);
  });
});

describe("deactivateMappingsForConnection (batch)", () => {
  it("désactive tous les mappings actifs d'une Connection en 1 batch", async () => {
    await createMapping({ ...baseInput, externalCompanyId: "ext-1" });
    await createMapping({ ...baseInput, externalCompanyId: "ext-2" });
    await createMapping({ ...baseInput, externalCompanyId: "ext-3", isActive: false }); // déjà OFF
    await createMapping({ ...baseInput, connectionId: "conn-2", externalCompanyId: "ext-4" });

    const count = await deactivateMappingsForConnection("conn-1");
    expect(count).toBe(2);

    const remaining = await listMappingsForConnection("conn-1");
    expect(remaining).toEqual([]); // tous inactifs

    // Conn-2 intacte
    const other = await listMappingsForConnection("conn-2");
    expect(other).toHaveLength(1);
  });

  it("retourne 0 si aucun mapping actif à désactiver", async () => {
    const count = await deactivateMappingsForConnection("ghost");
    expect(count).toBe(0);
  });
});
