// File: services/companies/__tests__/multiTenantE2E.test.ts
// Role: tests E2E des deux parcours multi-tenant (Sprint D Tâche 3).
// Composent les helpers Sprint A + B + C pour valider le flow complet
// sans dépendre de l'UI (Vitest + Firestore in-memory).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Fake Firestore in-memory (mutualisé) ───────────────────────────────

function makeFakeFirestore() {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  let nextId = 0;
  const batchOps: Array<{ op: "update"; col: string; id: string; patch: Record<string, unknown> }> = [];

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
            async set(payload: Record<string, unknown>, options?: { merge?: boolean }) {
              if (options?.merge) {
                const current = getCol(name).get(docId) ?? {};
                getCol(name).set(docId, { ...current, ...payload });
              } else {
                getCol(name).set(docId, payload);
              }
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
              getCol(name).set(docId, { ...current, ...patch });
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
      orderBy() {
        return makeQuery(name, filters, limitN);
      },
      limit(n: number) {
        return makeQuery(name, filters, n);
      },
      async get() {
        const col = getCol(name);
        const docs: Array<{ id: string; data: () => Record<string, unknown>; ref: { id: string; path: string } }> = [];
        for (const [id, data] of col.entries()) {
          const matches = filters.every((f) => {
            if (f.op === "==") return data[f.field] === f.value;
            if (f.op === "array-contains") {
              const arr = data[f.field];
              return Array.isArray(arr) && arr.includes(f.value);
            }
            return true;
          });
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
  FieldValue: { delete: () => ({ _methodName: "delete" }) },
}));

// Crypto mock pour éviter de configurer CONNECTOR_ENCRYPTION_KEY.
vi.mock("@/lib/server/tokenCrypto", () => ({
  encryptToken: (t: string) => `enc(${t})`,
  decryptToken: (t: string) => t.replace(/^enc\(|\)$/g, ""),
}));

import { createFirm, getFirm, listFirmsForUser } from "@/services/companies/firmStore";
import { createCompany, getCompany, listCompaniesForUser } from "@/services/companies/companyStore";
import { findOrCreateCompanyForConnection } from "@/services/companies/companyMatching";
import { createMappingsForFirmCallback } from "@/services/companies/firmCallbackMapping";
import {
  createMapping,
  deactivateMappingsForConnection,
  listMappingsForConnection,
} from "@/services/companies/connectionCompanyStore";
import {
  CompanyAccessError,
  requireCompanyAccess,
} from "@/services/auth/requireCompanyAccess";
import { resolveCompanyContext } from "@/services/auth/resolveCompanyContext";

beforeEach(() => {
  fakeDb._reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════
// Parcours 1 — company_owner (rétrocompat Sprint A)
// ═══════════════════════════════════════════════════════════════════════

describe("E2E parcours company_owner — rétrocompat Sprint A", () => {
  it("user solo crée sa Company → requireCompanyAccess autorise", async () => {
    const userId = "owner-1";
    const company = await createCompany({
      ownerUserId: userId,
      name: "Acme SAS",
      source: "manual",
      status: "active",
    });
    const access = await requireCompanyAccess(userId, company.id);
    expect(access.company.ownerUserId).toBe(userId);
  });

  it("requireCompanyAccess 403 si user ≠ owner", async () => {
    const company = await createCompany({
      ownerUserId: "owner-1",
      name: "Private",
      source: "manual",
      status: "active",
    });
    await expect(requireCompanyAccess("attacker", company.id)).rejects.toBeInstanceOf(
      CompanyAccessError
    );
  });

  it("resolveCompanyContext fallback sur 1re Company si companyId absent", async () => {
    await createCompany({
      ownerUserId: "owner-1",
      name: "Solo Co",
      source: "manual",
      status: "active",
    });
    const ctx = await resolveCompanyContext("owner-1", null);
    expect(ctx.mode).toBe("fallback");
    expect(ctx.company.ownerUserId).toBe("owner-1");
  });

  it("resolveCompanyContext throw 404 si user n'a aucune Company (onboarding incomplet)", async () => {
    await expect(resolveCompanyContext("ghost-user", null)).rejects.toMatchObject({
      status: 404,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Parcours 2 — firm_member (Sprint B + C complet)
// ═══════════════════════════════════════════════════════════════════════

describe("E2E parcours firm_member — onboarding cabinet complet", () => {
  it("flow Firm complet : créa Firm → 3 mappings via OAuth callback → activation picker → portefeuille", async () => {
    const userId = "firm-owner-1";

    // 1. Création de la Firm (équivalent /api/cabinet/firm/create).
    const firm = await createFirm({ ownerUserId: userId, name: "Cabinet Dupont" });
    expect(firm.memberUserIds).toContain(userId);

    // 2. Simulation du callback OAuth Firm : Pennylane retourne 3 dossiers.
    // On simule la création de la Connection (skip auth réelle).
    const connectionId = "conn-firm-1";
    fakeDb.collection("connections").doc(connectionId).set({
      userId,
      provider: "pennylane",
      providerSub: "pennylane_firm",
      status: "active",
      authMode: "oauth2",
      companyId: "co-representative",
      encryptedAccessToken: "enc(token)",
      encryptedRefreshToken: "enc(refresh)",
      tokenPreview: "abc…xyz",
      tokenExpiresAt: null,
      scopes: [],
      externalCompanyId: "ext-1",
      externalFirmId: null,
      odooInstanceUrl: null,
      odooDatabase: null,
      odooLogin: null,
      syncCursors: {
        entries: { paginationCursor: null, lastSyncedAt: null },
        invoices: { paginationCursor: null, lastSyncedAt: null },
        ledgerAccounts: { paginationCursor: null, lastSyncedAt: null },
        contacts: { paginationCursor: null, lastSyncedAt: null },
        journals: { paginationCursor: null, lastSyncedAt: null },
        bankTransactions: { paginationCursor: null, lastSyncedAt: null },
      },
      lastSyncAt: null,
      lastSyncStatus: "never",
      lastSyncError: null,
      createdAt: new Date().toISOString(),
    });

    // 3. createMappingsForFirmCallback (Sprint B helper) crée 3 Companies + 3 mappings.
    const results = await createMappingsForFirmCallback(userId, connectionId, "pennylane_oauth", [
      { externalCompanyId: "ext-1", name: "Boulangerie Martin" },
      { externalCompanyId: "ext-2", name: "SARL Dupuis" },
      { externalCompanyId: "ext-3", name: "Cabinet Leroy" },
    ]);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.outcome === "created")).toBe(true);

    // 4. listMappingsForConnection → tous actifs par défaut (import auto).
    const mappings = await listMappingsForConnection(connectionId);
    expect(mappings).toHaveLength(3);
    expect(mappings.every((m) => m.isActive)).toBe(true);

    // 5. requireCompanyAccess autorise chaque Company pour l'owner.
    for (const m of mappings) {
      const access = await requireCompanyAccess(userId, m.companyId);
      expect(access.company.ownerUserId).toBe(userId);
    }
  });

  it("createMappingsForFirmCallback idempotent — relance ne duplique pas", async () => {
    const userId = "firm-owner-1";
    const connectionId = "conn-firm-2";

    const r1 = await createMappingsForFirmCallback(userId, connectionId, "pennylane_oauth", [
      { externalCompanyId: "ext-A", name: "Co A" },
      { externalCompanyId: "ext-B", name: "Co B" },
    ]);
    expect(r1.every((r) => r.outcome === "created")).toBe(true);

    // 2e appel sur la même liste → tous reused.
    const r2 = await createMappingsForFirmCallback(userId, connectionId, "pennylane_oauth", [
      { externalCompanyId: "ext-A", name: "Co A renamed" }, // metadata ignorée
      { externalCompanyId: "ext-B", name: "Co B" },
    ]);
    expect(r2.every((r) => r.outcome === "reused")).toBe(true);

    // Total mappings actifs = 2 (pas 4).
    const all = await listMappingsForConnection(connectionId);
    expect(all).toHaveLength(2);
  });

  it("picker désactivation : PATCH met les non-sélectionnés à isActive=false", async () => {
    const userId = "firm-owner-1";
    const connectionId = "conn-firm-3";
    await createMappingsForFirmCallback(userId, connectionId, "pennylane_oauth", [
      { externalCompanyId: "ext-1", name: "Keep" },
      { externalCompanyId: "ext-2", name: "Drop" },
    ]);

    // Simule le PATCH : on désactive ext-2 via deactivate batch helper.
    // En vrai la route /api/cabinet/connections/[id]/mappings fait le tri.
    const allMappings = await listMappingsForConnection(connectionId);
    const toDeactivate = allMappings.find((m) => m.externalCompanyId === "ext-2")!;
    await deactivateMappingsForConnection(toDeactivate.connectionId).then(async () => {
      // Réactive ext-1 (selection user) — simule le PATCH activatedMappingIds=[ext-1.id].
      const ext1 = allMappings.find((m) => m.externalCompanyId === "ext-1")!;
      const { reactivateMapping } = await import("@/services/companies/connectionCompanyStore");
      await reactivateMapping(ext1.id);
    });

    const finalActives = await listMappingsForConnection(connectionId);
    expect(finalActives).toHaveLength(1);
    expect(finalActives[0]!.externalCompanyId).toBe("ext-1");
  });

  it("reconnect post-disconnect : mappings inactifs sont reactivated", async () => {
    const userId = "firm-owner-1";
    const connectionId = "conn-firm-4";

    // Première connexion.
    await createMappingsForFirmCallback(userId, connectionId, "pennylane_oauth", [
      { externalCompanyId: "ext-1", name: "Co A" },
    ]);

    // Disconnect : tous les mappings deviennent isActive=false.
    const deactivated = await deactivateMappingsForConnection(connectionId);
    expect(deactivated).toBe(1);

    // Reconnect : createMappingsForFirmCallback retrouve le mapping inactif → reactivated.
    const r = await createMappingsForFirmCallback(userId, connectionId, "pennylane_oauth", [
      { externalCompanyId: "ext-1", name: "Co A" },
    ]);
    expect(r[0]!.outcome).toBe("reactivated");

    const actives = await listMappingsForConnection(connectionId);
    expect(actives).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Isolation sécurité (firm_member vs other firm/company_owner)
// ═══════════════════════════════════════════════════════════════════════

describe("E2E sécurité — isolation Company entre users", () => {
  it("user A ne peut pas accéder à la Company du user B", async () => {
    const coA = await createCompany({
      ownerUserId: "user-A",
      name: "A SAS",
      source: "manual",
      status: "active",
    });
    await expect(requireCompanyAccess("user-B", coA.id)).rejects.toMatchObject({ status: 403 });
  });

  it("firm_member ne peut pas accéder à une Company d'une autre Firm via requireCompanyAccess (Sprint C : ownerUserId-only)", async () => {
    const firm1 = await createFirm({ ownerUserId: "firm-1-owner", name: "Firm 1" });
    const firm2 = await createFirm({ ownerUserId: "firm-2-owner", name: "Firm 2" });

    const co2 = await createCompany({
      ownerUserId: "firm-2-owner",
      name: "Dossier Firm 2",
      source: "pennylane_oauth",
      status: "active",
    });
    // firm-1-owner essaie de lire Co2 → 403.
    await expect(requireCompanyAccess("firm-1-owner", co2.id)).rejects.toMatchObject({
      status: 403,
    });
    expect(firm1.firmId).not.toBe(firm2.firmId);
  });

  it("findOrCreateCompanyForConnection isolé par userId : 2 users avec même externalCompanyId → 2 Companies distinctes", async () => {
    const userA = "user-A";
    const userB = "user-B";

    // User A crée un mapping pour ext-shared.
    const coA = await createCompany({
      ownerUserId: userA,
      name: "A",
      source: "pennylane_oauth",
      status: "active",
    });
    await createMapping({
      userId: userA,
      connectionId: "conn-A",
      companyId: coA.id,
      externalCompanyId: "ext-shared",
      isActive: true,
    });

    // User B avec une autre connection ciblant ext-shared → nouvelle Company (pas réutilisation cross-user).
    const resultB = await findOrCreateCompanyForConnection({
      userId: userB,
      connectionId: "conn-B",
      source: "pennylane_oauth",
      externalCompanyId: "ext-shared",
      companyMetadata: { name: "B" },
    });
    expect(resultB.isNew).toBe(true);
    expect(resultB.company.ownerUserId).toBe(userB);
    expect(resultB.company.id).not.toBe(coA.id);
  });

  it("Firm avec memberUserIds : seuls les membres listés peuvent lire", async () => {
    const firm = await createFirm({ ownerUserId: "owner-1", name: "Cabinet" });
    expect(firm.memberUserIds).toEqual(["owner-1"]);

    const fetched = await getFirm(firm.firmId);
    expect(fetched?.memberUserIds).toEqual(["owner-1"]);
    // listFirmsForUser pour un non-membre → []
    const otherList = await listFirmsForUser("other-user");
    expect(otherList).toEqual([]);
  });

  it("listCompaniesForUser ne renvoie QUE les Companies dont ownerUserId === userId", async () => {
    await createCompany({ ownerUserId: "user-A", name: "A1", source: "manual", status: "active" });
    await createCompany({ ownerUserId: "user-A", name: "A2", source: "manual", status: "active" });
    await createCompany({ ownerUserId: "user-B", name: "B1", source: "manual", status: "active" });

    const listA = await listCompaniesForUser("user-A");
    const listB = await listCompaniesForUser("user-B");
    expect(listA).toHaveLength(2);
    expect(listB).toHaveLength(1);
    expect(listA.every((c) => c.ownerUserId === "user-A")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Cycle de vie Company / Firm
// ═══════════════════════════════════════════════════════════════════════

describe("E2E cycle de vie", () => {
  it("Company archivée disparaît de listCompaniesForUser mais reste accessible via requireCompanyAccess", async () => {
    const userId = "user-1";
    const co = await createCompany({
      ownerUserId: userId,
      name: "Old Co",
      source: "manual",
      status: "active",
    });

    // archiveCompany (équivalent Sprint A archive flow).
    const { archiveCompany } = await import("@/services/companies/companyStore");
    await archiveCompany(co.id);

    // listCompaniesForUser exclut les archivées.
    const list = await listCompaniesForUser(userId);
    expect(list).toEqual([]);

    // Mais requireCompanyAccess permet toujours la lecture (rapports historiques).
    const access = await requireCompanyAccess(userId, co.id);
    expect(access.company.status).toBe("archived");
  });

  it("getCompany retourne null pour un id inexistant", async () => {
    expect(await getCompany("ghost-co")).toBeNull();
  });
});
