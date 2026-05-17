// File: lib/stores/activeCompanyStore.test.ts
// Role: tests purs des helpers de persistance localStorage (Sprint C).
// Évite la dépendance @testing-library/react (non installée).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_COMPANY_STORAGE_KEY,
  readActiveCompanyFromStorage,
  writeActiveCompanyToStorage,
} from "@/lib/stores/activeCompanyStore";

beforeEach(() => {
  // Stub localStorage en in-memory map.
  const memory = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readActiveCompanyFromStorage", () => {
  it("retourne null si rien en localStorage", () => {
    expect(readActiveCompanyFromStorage()).toBeNull();
  });

  it("retourne la valeur si présente", () => {
    window.localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, "co-42");
    expect(readActiveCompanyFromStorage()).toBe("co-42");
  });

  it("retourne null si window undefined (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(readActiveCompanyFromStorage()).toBeNull();
  });
});

describe("writeActiveCompanyToStorage", () => {
  it("persiste une valeur non-null", () => {
    writeActiveCompanyToStorage("co-new");
    expect(window.localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY)).toBe("co-new");
  });

  it("supprime la clé quand valeur=null", () => {
    window.localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, "co-stale");
    writeActiveCompanyToStorage(null);
    expect(window.localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY)).toBeNull();
  });

  it("no-op si window undefined (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => writeActiveCompanyToStorage("co-x")).not.toThrow();
  });

  it("round-trip read→write→read cohérent", () => {
    writeActiveCompanyToStorage("co-A");
    expect(readActiveCompanyFromStorage()).toBe("co-A");
    writeActiveCompanyToStorage("co-B");
    expect(readActiveCompanyFromStorage()).toBe("co-B");
    writeActiveCompanyToStorage(null);
    expect(readActiveCompanyFromStorage()).toBeNull();
  });
});
