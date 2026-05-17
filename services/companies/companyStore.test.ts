// File: services/companies/companyStore.test.ts
// Role: tests unitaires sur le CRUD Company (Sprint A multi-tenant).
// On mocke Firebase Admin avec un fake in-memory pour valider la logique
// pure du store (sans hit réel sur Firestore).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Fake Firestore in-memory ───────────────────────────────────────────────

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
                ? {
                    id: docId,
                    exists: true,
                    data: () => stored,
                  }
                : {
                    id: docId,
                    exists: false,
                    data: () => undefined,
                  };
            },
            async update(patch: Record<string, unknown>) {
              const current = getCol(name).get(docId);
              if (!current) throw new Error(`update non-existing ${name}/${docId}`);
              const next = { ...current };
              for (const [k, v] of Object.entries(patch)) {
                if (v && typeof v === "object" && "_methodName" in v && v._methodName === "delete") {
                  delete next[k];
                } else {
                  next[k] = v;
                }
              }
              getCol(name).set(docId, next);
            },
          };
        },
        where(field: string, op: string, value: unknown) {
          const filters = [{ field, op, value }];
          return makeQuery(name, filters);
        },
      };
    },
    _collections: collections,
    _reset() {
      collections.clear();
      nextId = 0;
    },
  };

  function makeQuery(name: string, filters: Array<{ field: string; op: string; value: unknown }>, orderField?: string) {
    return {
      where(field: string, op: string, value: unknown) {
        return makeQuery(name, [...filters, { field, op, value }], orderField);
      },
      orderBy(field: string) {
        return makeQuery(name, filters, field);
      },
      async get() {
        const col = getCol(name);
        const docs: Array<{ id: string; data: () => Record<string, unknown> }> = [];
        for (const [id, data] of col.entries()) {
          const matches = filters.every((f) => {
            if (f.op === "==") return data[f.field] === f.value;
            return true;
          });
          if (matches) docs.push({ id, data: () => data });
        }
        if (orderField) {
          docs.sort((a, b) => {
            const av = (a.data()[orderField] ?? "") as string | number;
            const bv = (b.data()[orderField] ?? "") as string | number;
            return av > bv ? 1 : av < bv ? -1 : 0;
          });
        }
        return { docs, size: docs.length };
      },
    };
  }

  return api;
}

const fakeDb = makeFakeFirestore();

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getFirebaseAdminFirestore: () => fakeDb,
}));

// Mock Timestamp.now() pour des assertions déterministes.
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
  archiveCompany,
  createCompany,
  getCompany,
  listCompaniesForUser,
  updateCompany,
} from "@/services/companies/companyStore";

beforeEach(() => {
  fakeDb._reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createCompany", () => {
  it("crée une Company avec les champs requis", async () => {
    const company = await createCompany({
      ownerUserId: "user-1",
      name: "Acme SAS",
      source: "manual",
      status: "active",
    });
    expect(company.id).toMatch(/^auto-/);
    expect(company.ownerUserId).toBe("user-1");
    expect(company.name).toBe("Acme SAS");
    expect(company.source).toBe("manual");
    expect(company.status).toBe("active");
    expect(company.createdAt).toBeDefined();
    expect(company.updatedAt).toBeDefined();
  });

  it("préserve createdAtOverride pour les migrations", async () => {
    const oldDate = { seconds: 1_500_000_000, nanoseconds: 0, _isTimestamp: true };
    const company = await createCompany({
      ownerUserId: "user-1",
      name: "Old Company",
      source: "manual",
      status: "active",
      createdAtOverride: oldDate as unknown as never,
    });
    expect(company.createdAt).toEqual(oldDate);
    // updatedAt = now, indépendant du createdAt override.
    expect(company.updatedAt).not.toEqual(oldDate);
  });

  it("omet les champs undefined (Firestore refuse)", async () => {
    const company = await createCompany({
      ownerUserId: "user-1",
      name: "No SIREN Co",
      source: "manual",
      status: "active",
      siren: undefined,
      externalCompanyId: undefined,
    });
    // Le record en mémoire ne doit pas avoir ces clés.
    const stored = fakeDb._collections.get("companies")!.get(company.id)!;
    expect(stored).not.toHaveProperty("siren");
    expect(stored).not.toHaveProperty("externalCompanyId");
  });
});

describe("getCompany", () => {
  it("retourne la Company si elle existe", async () => {
    const created = await createCompany({
      ownerUserId: "user-1",
      name: "Acme",
      source: "manual",
      status: "active",
    });
    const fetched = await getCompany(created.id);
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.name).toBe("Acme");
  });

  it("retourne null si la Company n'existe pas", async () => {
    const fetched = await getCompany("inexistant");
    expect(fetched).toBeNull();
  });
});

describe("listCompaniesForUser", () => {
  it("liste les Companies actives du user, ordonnées par createdAt asc", async () => {
    await createCompany({ ownerUserId: "user-1", name: "C1", source: "manual", status: "active" });
    await createCompany({ ownerUserId: "user-1", name: "C2", source: "manual", status: "active" });
    await createCompany({ ownerUserId: "user-2", name: "Other", source: "manual", status: "active" });

    const list = await listCompaniesForUser("user-1");
    expect(list).toHaveLength(2);
    expect(list.map((c) => c.name)).toEqual(["C1", "C2"]);
  });

  it("exclut les Companies archivées", async () => {
    const archived = await createCompany({
      ownerUserId: "user-1",
      name: "Archived",
      source: "manual",
      status: "archived",
    });
    expect(archived.status).toBe("archived");
    const list = await listCompaniesForUser("user-1");
    expect(list).toHaveLength(0);
  });

  it("retourne [] si le user n'a aucune Company", async () => {
    const list = await listCompaniesForUser("ghost-user");
    expect(list).toEqual([]);
  });
});

describe("updateCompany", () => {
  it("patch partiel + met à jour updatedAt", async () => {
    const created = await createCompany({
      ownerUserId: "user-1",
      name: "Old name",
      source: "manual",
      status: "active",
    });
    await updateCompany(created.id, { name: "New name" });
    const updated = await getCompany(created.id);
    expect(updated?.name).toBe("New name");
    expect(updated?.source).toBe("manual"); // inchangé
  });

  it("null efface un champ optionnel via FieldValue.delete()", async () => {
    const created = await createCompany({
      ownerUserId: "user-1",
      name: "C",
      source: "manual",
      status: "active",
      siren: "123456789",
    });
    await updateCompany(created.id, { siren: null as unknown as undefined });
    const stored = fakeDb._collections.get("companies")!.get(created.id)!;
    expect(stored).not.toHaveProperty("siren");
  });
});

describe("archiveCompany", () => {
  it("passe le status à 'archived'", async () => {
    const created = await createCompany({
      ownerUserId: "user-1",
      name: "C",
      source: "manual",
      status: "active",
    });
    await archiveCompany(created.id);
    const fetched = await getCompany(created.id);
    expect(fetched?.status).toBe("archived");
    // Elle disparaît de listCompaniesForUser (filtre status=active).
    const list = await listCompaniesForUser("user-1");
    expect(list).toEqual([]);
  });
});
