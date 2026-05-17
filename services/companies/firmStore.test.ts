// File: services/companies/firmStore.test.ts
// Role: tests unitaires sur le CRUD Firm (Sprint C).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Fake Firestore avec support array-contains ─────────────────────────

function makeFakeFirestore() {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  let nextId = 0;

  function getCol(name: string) {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name)!;
  }

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
                ? { id: docId, exists: true, data: () => stored }
                : { id: docId, exists: false, data: () => undefined };
            },
            async update(patch: Record<string, unknown>) {
              const current = getCol(name).get(docId);
              if (!current) throw new Error(`update non-existing ${name}/${docId}`);
              getCol(name).set(docId, { ...current, ...patch });
            },
          };
        },
        where(field: string, op: string, value: unknown) {
          return makeQuery(name, [{ field, op, value }]);
        },
      };
    },
    _reset() {
      collections.clear();
      nextId = 0;
    },
  };

  function makeQuery(name: string, filters: Array<{ field: string; op: string; value: unknown }>) {
    return {
      where(field: string, op: string, value: unknown) {
        return makeQuery(name, [...filters, { field, op, value }]);
      },
      async get() {
        const col = getCol(name);
        const docs: Array<{ id: string; data: () => Record<string, unknown> }> = [];
        for (const [id, data] of col.entries()) {
          const matches = filters.every((f) => {
            if (f.op === "==") return data[f.field] === f.value;
            if (f.op === "array-contains") {
              const arr = data[f.field];
              return Array.isArray(arr) && arr.includes(f.value);
            }
            return true;
          });
          if (matches) docs.push({ id, data: () => data });
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
  },
}));

import {
  addMemberToFirm,
  createFirm,
  getFirm,
  listFirmsForUser,
} from "@/services/companies/firmStore";

beforeEach(() => {
  fakeDb._reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createFirm", () => {
  it("crée une Firm avec ownerUserId dans memberUserIds", async () => {
    const firm = await createFirm({
      ownerUserId: "user-1",
      name: "Cabinet Dupont",
    });
    expect(firm.firmId).toMatch(/^auto-/);
    expect(firm.name).toBe("Cabinet Dupont");
    expect(firm.ownerUserId).toBe("user-1");
    expect(firm.memberUserIds).toEqual(["user-1"]);
    expect(firm.createdAt).toBeDefined();
    expect(firm.updatedAt).toBeDefined();
  });

  it("trim le nom (whitespace en début/fin)", async () => {
    const firm = await createFirm({ ownerUserId: "user-1", name: "  Acme Cabinet  " });
    expect(firm.name).toBe("Acme Cabinet");
  });

  it("throw si le nom est vide ou whitespace-only", async () => {
    await expect(createFirm({ ownerUserId: "user-1", name: "" })).rejects.toThrow(
      /name requis/
    );
    await expect(createFirm({ ownerUserId: "user-1", name: "   " })).rejects.toThrow();
  });
});

describe("getFirm", () => {
  it("retourne la Firm si elle existe", async () => {
    const created = await createFirm({ ownerUserId: "user-1", name: "Test" });
    const fetched = await getFirm(created.firmId);
    expect(fetched?.firmId).toBe(created.firmId);
    expect(fetched?.name).toBe("Test");
  });

  it("retourne null si la Firm n'existe pas", async () => {
    expect(await getFirm("ghost")).toBeNull();
  });
});

describe("addMemberToFirm", () => {
  it("ajoute un user à memberUserIds (idempotent)", async () => {
    const firm = await createFirm({ ownerUserId: "owner-1", name: "Cabinet" });
    await addMemberToFirm(firm.firmId, "member-1");
    const updated = await getFirm(firm.firmId);
    expect(updated?.memberUserIds).toEqual(["owner-1", "member-1"]);
  });

  it("no-op si user déjà membre (idempotence)", async () => {
    const firm = await createFirm({ ownerUserId: "owner-1", name: "Cabinet" });
    await addMemberToFirm(firm.firmId, "owner-1"); // déjà membre
    const updated = await getFirm(firm.firmId);
    expect(updated?.memberUserIds).toEqual(["owner-1"]);
  });

  it("throw si Firm introuvable", async () => {
    await expect(addMemberToFirm("ghost", "user-1")).rejects.toThrow(/introuvable/);
  });
});

describe("listFirmsForUser", () => {
  it("liste les Firms dont l'user est membre", async () => {
    await createFirm({ ownerUserId: "user-1", name: "Cabinet A" });
    const firm2 = await createFirm({ ownerUserId: "user-2", name: "Cabinet B" });
    await addMemberToFirm(firm2.firmId, "user-1");
    await createFirm({ ownerUserId: "user-3", name: "Cabinet C" }); // pas user-1

    const list = await listFirmsForUser("user-1");
    expect(list).toHaveLength(2);
    expect(list.map((f) => f.name).sort()).toEqual(["Cabinet A", "Cabinet B"]);
  });

  it("retourne [] si l'user n'est membre d'aucune Firm", async () => {
    expect(await listFirmsForUser("ghost")).toEqual([]);
  });
});
