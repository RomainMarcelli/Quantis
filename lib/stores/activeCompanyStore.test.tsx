// File: lib/stores/activeCompanyStore.test.tsx
// Role: tests du store React Context (Sprint C Tâche 6).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  ActiveCompanyProvider,
  useActiveCompany,
} from "@/lib/stores/activeCompanyStore";

const STORAGE_KEY = "vyzor:activeCompanyId";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useActiveCompany — fallback no-op hors Provider", () => {
  it("retourne activeCompanyId=null et setActiveCompanyId no-op sans Provider", () => {
    const { result } = renderHook(() => useActiveCompany());
    expect(result.current.activeCompanyId).toBeNull();
    expect(() => result.current.setActiveCompanyId("co-X")).not.toThrow();
  });
});

describe("ActiveCompanyProvider", () => {
  it("init avec activeCompanyId=null si rien en localStorage", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ActiveCompanyProvider>{children}</ActiveCompanyProvider>
    );
    const { result } = renderHook(() => useActiveCompany(), { wrapper });
    expect(result.current.activeCompanyId).toBeNull();
  });

  it("hydrate depuis localStorage si présent", async () => {
    window.localStorage.setItem(STORAGE_KEY, "co-stored");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ActiveCompanyProvider>{children}</ActiveCompanyProvider>
    );
    const { result } = renderHook(() => useActiveCompany(), { wrapper });
    // useEffect d'hydratation = micro-tick async.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.activeCompanyId).toBe("co-stored");
  });

  it("setActiveCompanyId update le state ET persiste en localStorage", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ActiveCompanyProvider>{children}</ActiveCompanyProvider>
    );
    const { result } = renderHook(() => useActiveCompany(), { wrapper });
    act(() => {
      result.current.setActiveCompanyId("co-new");
    });
    expect(result.current.activeCompanyId).toBe("co-new");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("co-new");
  });

  it("setActiveCompanyId(null) efface la persistance", () => {
    window.localStorage.setItem(STORAGE_KEY, "co-x");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ActiveCompanyProvider>{children}</ActiveCompanyProvider>
    );
    const { result } = renderHook(() => useActiveCompany(), { wrapper });
    act(() => {
      result.current.setActiveCompanyId(null);
    });
    expect(result.current.activeCompanyId).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
