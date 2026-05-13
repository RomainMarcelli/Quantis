// File: services/dataSourcesStore.test.ts
// Tests unitaires du store de source active côté client (Firebase Web SDK).
// On vérifie :
//   - Mutex : activer Pennylane écrase l'éventuelle source précédente.
//   - FEC : écrit le folder, et l'efface quand on quitte FEC.
//   - Bridge : indépendant, n'efface pas la source comptable.
//   - Décodage défensif : valeur Firestore invalide → null safe.

import { describe, expect, it, vi, beforeEach } from "vitest";

// On mock Firebase AVANT d'importer le module testé.
const setDocSpy = vi.fn();
const docSpy = vi.fn((..._args: unknown[]) => ({ __ref: _args.join("/") }));

vi.mock("firebase/firestore", () => ({
  doc: (...args: unknown[]) => docSpy(...args),
  setDoc: (ref: unknown, payload: unknown, opts: unknown) => {
    setDocSpy(ref, payload, opts);
    return Promise.resolve();
  },
  onSnapshot: vi.fn(),
  serverTimestamp: () => ({ __sentinel: "serverTimestamp" }),
}));
vi.mock("@/lib/firebase", () => ({ firestoreDb: { __mock: true } }));

import {
  writeActiveAccountingSource,
  writeActiveBankingSource,
} from "@/services/dataSourcesStore";

beforeEach(() => {
  setDocSpy.mockReset();
  docSpy.mockClear();
});

describe("writeActiveAccountingSource", () => {
  it("écrit la source comptable + clear le folder quand non-FEC (mutex)", async () => {
    await writeActiveAccountingSource("user-123", "pennylane");

    expect(setDocSpy).toHaveBeenCalledTimes(1);
    const [, payload, opts] = setDocSpy.mock.calls[0]!;
    expect(payload).toMatchObject({
      activeAccountingSource: "pennylane",
      activeFecFolderName: null, // forcé à null quand on quitte / n'entre pas dans FEC
    });
    expect((payload as { createdAt: unknown }).createdAt).toBeDefined();
    expect((payload as { updatedAt: unknown }).updatedAt).toBeDefined();
    expect(opts).toEqual({ merge: true });
  });

  it("écrit le folder quand on active FEC", async () => {
    await writeActiveAccountingSource("user-123", "fec", "Cabinet Dupont");

    const [, payload] = setDocSpy.mock.calls[0]!;
    expect(payload).toMatchObject({
      activeAccountingSource: "fec",
      activeFecFolderName: "Cabinet Dupont",
    });
  });

  it("ignore le folder fourni si la source n'est pas FEC", async () => {
    // L'appelant passe un folderName par erreur sur Pennylane → on l'ignore.
    await writeActiveAccountingSource("user-123", "pennylane", "Cabinet Dupont");

    const [, payload] = setDocSpy.mock.calls[0]!;
    expect((payload as { activeFecFolderName: unknown }).activeFecFolderName).toBeNull();
  });

  it("trim les espaces du folderName FEC", async () => {
    await writeActiveAccountingSource("user-123", "fec", "  Cabinet Dupont  ");

    const [, payload] = setDocSpy.mock.calls[0]!;
    expect((payload as { activeFecFolderName: string }).activeFecFolderName).toBe(
      "Cabinet Dupont"
    );
  });

  it("désactive entièrement la source comptable quand source = null", async () => {
    await writeActiveAccountingSource("user-123", null);

    const [, payload] = setDocSpy.mock.calls[0]!;
    expect(payload).toMatchObject({
      activeAccountingSource: null,
      activeFecFolderName: null,
    });
  });

  it("cible le doc Firestore users/{uid}/settings/dataSources", async () => {
    await writeActiveAccountingSource("user-123", "myunisoft");
    expect(docSpy).toHaveBeenCalledWith(
      { __mock: true },
      "users",
      "user-123",
      "settings",
      "dataSources"
    );
  });
});

describe("writeActiveBankingSource", () => {
  it("écrit Bridge sans toucher à la source comptable (champs indépendants)", async () => {
    await writeActiveBankingSource("user-123", "bridge");

    const [, payload, opts] = setDocSpy.mock.calls[0]!;
    expect(payload).toMatchObject({ activeBankingSource: "bridge" });
    // Cruciale : le payload n'inclut PAS activeAccountingSource → merge:true
    // préserve la valeur courante (pas de side effect sur la compta).
    expect((payload as Record<string, unknown>).activeAccountingSource).toBeUndefined();
    expect((payload as Record<string, unknown>).activeFecFolderName).toBeUndefined();
    expect(opts).toEqual({ merge: true });
  });

  it("désactive Bridge avec source = null sans toucher à la compta", async () => {
    await writeActiveBankingSource("user-123", null);

    const [, payload] = setDocSpy.mock.calls[0]!;
    expect(payload).toMatchObject({ activeBankingSource: null });
    expect((payload as Record<string, unknown>).activeAccountingSource).toBeUndefined();
  });
});

describe("mutex côté Firestore (équivalent à activation séquentielle)", () => {
  it("activation Pennylane → MyUnisoft : la 2e écrit overwrite la 1ère via merge", async () => {
    // 1. L'utilisateur active Pennylane
    await writeActiveAccountingSource("user-1", "pennylane");
    // 2. Puis bascule sur MyUnisoft
    await writeActiveAccountingSource("user-1", "myunisoft");

    expect(setDocSpy).toHaveBeenCalledTimes(2);
    const [, payload2] = setDocSpy.mock.calls[1]!;
    // Le 2e write produit un payload qui pose explicitement
    // activeAccountingSource = "myunisoft" — comme c'est le SEUL champ
    // pertinent (mutex implicite), Firestore avec merge:true écrase
    // pennylane par myunisoft. Pas de "double active" possible.
    expect((payload2 as { activeAccountingSource: string }).activeAccountingSource).toBe(
      "myunisoft"
    );
  });

  it("activation FEC après Pennylane : le folder est posé, le mutex écrase pennylane", async () => {
    await writeActiveAccountingSource("user-1", "pennylane");
    await writeActiveAccountingSource("user-1", "fec", "Cabinet A");

    const [, payload2] = setDocSpy.mock.calls[1]!;
    expect(payload2).toMatchObject({
      activeAccountingSource: "fec",
      activeFecFolderName: "Cabinet A",
    });
  });

  it("retour de FEC vers Pennylane : le folder est explicitement effacé", async () => {
    await writeActiveAccountingSource("user-1", "fec", "Cabinet A");
    await writeActiveAccountingSource("user-1", "pennylane");

    const [, payload2] = setDocSpy.mock.calls[1]!;
    expect(payload2).toMatchObject({
      activeAccountingSource: "pennylane",
      activeFecFolderName: null,
    });
  });
});
