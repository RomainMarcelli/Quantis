// File: services/companies/firmCallbackMapping.test.ts
// Role: tests sur createMappingsForFirmCallback (Sprint B Tâche 6).

import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompanyRecord } from "@/services/companies/types";
import type { ConnectionCompanyMapping } from "@/services/companies/connectionCompanyStore";

vi.mock("@/services/companies/companyMatching", () => ({
  findOrCreateCompanyForConnection: vi.fn(),
}));

vi.mock("@/services/companies/connectionCompanyStore", () => ({
  createMapping: vi.fn(),
  findMappingByExternalRef: vi.fn(),
  reactivateMapping: vi.fn(),
}));

import { findOrCreateCompanyForConnection } from "@/services/companies/companyMatching";
import {
  createMapping,
  findMappingByExternalRef,
  reactivateMapping,
} from "@/services/companies/connectionCompanyStore";
import { createMappingsForFirmCallback } from "@/services/companies/firmCallbackMapping";

const companyA: CompanyRecord = {
  id: "co-A",
  ownerUserId: "user-1",
  name: "Acme A",
  source: "pennylane_oauth",
  status: "active",
  externalCompanyId: "ext-A",
  createdAt: { seconds: 1, nanoseconds: 0 } as never,
  updatedAt: { seconds: 1, nanoseconds: 0 } as never,
};

const companyB: CompanyRecord = {
  ...companyA,
  id: "co-B",
  name: "Acme B",
  externalCompanyId: "ext-B",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(findOrCreateCompanyForConnection).mockReset();
  vi.mocked(createMapping).mockReset();
  vi.mocked(findMappingByExternalRef).mockReset();
  vi.mocked(reactivateMapping).mockReset();
});

describe("createMappingsForFirmCallback — création multi-dossiers", () => {
  it("crée N mappings pour N dossiers (cabinet 3 dossiers)", async () => {
    vi.mocked(findOrCreateCompanyForConnection)
      .mockResolvedValueOnce({ company: companyA, isNew: true })
      .mockResolvedValueOnce({ company: companyB, isNew: true })
      .mockResolvedValueOnce({
        company: { ...companyA, id: "co-C", externalCompanyId: "ext-C" },
        isNew: true,
      });
    vi.mocked(findMappingByExternalRef).mockResolvedValue(null);
    vi.mocked(createMapping).mockImplementation(async (input) => ({
      id: `map-${input.externalCompanyId}`,
      ...input,
      createdAt: { seconds: 1, nanoseconds: 0 } as never,
      updatedAt: { seconds: 1, nanoseconds: 0 } as never,
    }));

    const results = await createMappingsForFirmCallback("user-1", "conn-1", "pennylane_oauth", [
      { externalCompanyId: "ext-A", name: "Acme A" },
      { externalCompanyId: "ext-B", name: "Acme B" },
      { externalCompanyId: "ext-C", name: "Acme C" },
    ]);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.outcome === "created")).toBe(true);
    expect(vi.mocked(createMapping)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(reactivateMapping)).not.toHaveBeenCalled();
  });
});

describe("createMappingsForFirmCallback — idempotence", () => {
  it("réutilise un mapping déjà actif (no-op)", async () => {
    vi.mocked(findOrCreateCompanyForConnection).mockResolvedValue({
      company: companyA,
      isNew: false,
    });
    vi.mocked(findMappingByExternalRef).mockResolvedValue({
      id: "map-existing",
      userId: "user-1",
      connectionId: "conn-1",
      companyId: "co-A",
      externalCompanyId: "ext-A",
      isActive: true,
      createdAt: { seconds: 1, nanoseconds: 0 } as never,
      updatedAt: { seconds: 1, nanoseconds: 0 } as never,
    } as ConnectionCompanyMapping);

    const results = await createMappingsForFirmCallback("user-1", "conn-1", "pennylane_oauth", [
      { externalCompanyId: "ext-A", name: "Acme A" },
    ]);

    expect(results[0]!.outcome).toBe("reused");
    expect(vi.mocked(createMapping)).not.toHaveBeenCalled();
    expect(vi.mocked(reactivateMapping)).not.toHaveBeenCalled();
  });

  it("réactive un mapping inactif (cas reconnexion post-disconnect)", async () => {
    vi.mocked(findOrCreateCompanyForConnection).mockResolvedValue({
      company: companyA,
      isNew: false,
    });
    vi.mocked(findMappingByExternalRef).mockResolvedValue({
      id: "map-stale",
      userId: "user-1",
      connectionId: "conn-1",
      companyId: "co-A",
      externalCompanyId: "ext-A",
      isActive: false,
      createdAt: { seconds: 1, nanoseconds: 0 } as never,
      updatedAt: { seconds: 1, nanoseconds: 0 } as never,
    } as ConnectionCompanyMapping);

    const results = await createMappingsForFirmCallback("user-1", "conn-1", "pennylane_oauth", [
      { externalCompanyId: "ext-A", name: "Acme A" },
    ]);

    expect(results[0]!.outcome).toBe("reactivated");
    expect(results[0]!.mapping.isActive).toBe(true);
    expect(vi.mocked(reactivateMapping)).toHaveBeenCalledWith("map-stale");
    expect(vi.mocked(createMapping)).not.toHaveBeenCalled();
  });
});

describe("createMappingsForFirmCallback — edge cases", () => {
  it("ignore les descripteurs sans externalCompanyId", async () => {
    const results = await createMappingsForFirmCallback("user-1", "conn-1", "pennylane_oauth", [
      { externalCompanyId: "   " },
      { externalCompanyId: "" },
    ]);
    expect(results).toEqual([]);
    expect(vi.mocked(findOrCreateCompanyForConnection)).not.toHaveBeenCalled();
  });

  it("traite chaque dossier indépendamment (mix créé / réutilisé)", async () => {
    vi.mocked(findOrCreateCompanyForConnection)
      .mockResolvedValueOnce({ company: companyA, isNew: false })
      .mockResolvedValueOnce({ company: companyB, isNew: true });
    vi.mocked(findMappingByExternalRef)
      .mockResolvedValueOnce({
        id: "map-A",
        userId: "user-1",
        connectionId: "conn-1",
        companyId: "co-A",
        externalCompanyId: "ext-A",
        isActive: true,
        createdAt: { seconds: 1, nanoseconds: 0 } as never,
        updatedAt: { seconds: 1, nanoseconds: 0 } as never,
      } as ConnectionCompanyMapping)
      .mockResolvedValueOnce(null);
    vi.mocked(createMapping).mockImplementation(async (input) => ({
      id: `map-${input.externalCompanyId}`,
      ...input,
      createdAt: { seconds: 1, nanoseconds: 0 } as never,
      updatedAt: { seconds: 1, nanoseconds: 0 } as never,
    }));

    const results = await createMappingsForFirmCallback("user-1", "conn-1", "pennylane_oauth", [
      { externalCompanyId: "ext-A", name: "Acme A" },
      { externalCompanyId: "ext-B", name: "Acme B" },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]!.outcome).toBe("reused");
    expect(results[1]!.outcome).toBe("created");
  });
});
