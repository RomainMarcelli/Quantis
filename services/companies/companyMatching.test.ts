// File: services/companies/companyMatching.test.ts
// Role: tests sur findOrCreateCompanyForConnection (Sprint B Tâche 3).

import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompanyRecord } from "@/services/companies/types";
import type { ConnectionCompanyMapping } from "@/services/companies/connectionCompanyStore";

vi.mock("@/services/companies/companyStore", () => ({
  createCompany: vi.fn(),
  getCompany: vi.fn(),
}));

vi.mock("@/services/companies/connectionCompanyStore", () => ({
  findMappingByExternalRef: vi.fn(),
}));

import { createCompany, getCompany } from "@/services/companies/companyStore";
import { findMappingByExternalRef } from "@/services/companies/connectionCompanyStore";
import { findOrCreateCompanyForConnection } from "@/services/companies/companyMatching";

const existingCompany: CompanyRecord = {
  id: "co-existing",
  ownerUserId: "user-1",
  name: "Acme existing",
  source: "pennylane_manual",
  status: "active",
  externalCompanyId: "ext-1",
  createdAt: { seconds: 1, nanoseconds: 0 } as never,
  updatedAt: { seconds: 1, nanoseconds: 0 } as never,
};

const newCompany: CompanyRecord = {
  id: "co-new",
  ownerUserId: "user-1",
  name: "New co",
  source: "pennylane_oauth",
  status: "active",
  externalCompanyId: "ext-2",
  createdAt: { seconds: 1, nanoseconds: 0 } as never,
  updatedAt: { seconds: 1, nanoseconds: 0 } as never,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(createCompany).mockReset();
  vi.mocked(getCompany).mockReset();
  vi.mocked(findMappingByExternalRef).mockReset();
});

describe("findOrCreateCompanyForConnection", () => {
  it("réutilise la Company existante si un mapping est trouvé", async () => {
    vi.mocked(findMappingByExternalRef).mockResolvedValue({
      id: "map-1",
      userId: "user-1",
      connectionId: "conn-1",
      companyId: "co-existing",
      externalCompanyId: "ext-1",
      isActive: true,
      createdAt: { seconds: 1, nanoseconds: 0 } as never,
      updatedAt: { seconds: 1, nanoseconds: 0 } as never,
    } as ConnectionCompanyMapping);
    vi.mocked(getCompany).mockResolvedValue(existingCompany);

    const result = await findOrCreateCompanyForConnection({
      userId: "user-1",
      connectionId: "conn-1",
      source: "pennylane_oauth",
      externalCompanyId: "ext-1",
      companyMetadata: { name: "ignored", siren: "123456789" },
    });

    expect(result.isNew).toBe(false);
    expect(result.company.id).toBe("co-existing");
    expect(vi.mocked(createCompany)).not.toHaveBeenCalled();
  });

  it("crée une nouvelle Company si aucun mapping trouvé", async () => {
    vi.mocked(findMappingByExternalRef).mockResolvedValue(null);
    vi.mocked(createCompany).mockResolvedValue(newCompany);

    const result = await findOrCreateCompanyForConnection({
      userId: "user-1",
      connectionId: "conn-1",
      source: "pennylane_oauth",
      externalCompanyId: "ext-2",
      companyMetadata: { name: "New co", siren: "987654321" },
    });

    expect(result.isNew).toBe(true);
    expect(result.company.id).toBe("co-new");
    expect(vi.mocked(createCompany)).toHaveBeenCalledWith({
      ownerUserId: "user-1",
      name: "New co",
      siren: "987654321",
      source: "pennylane_oauth",
      status: "active",
      externalCompanyId: "ext-2",
    });
  });

  it("fallback name = `Dossier ${externalCompanyId}` si pas de name fourni", async () => {
    vi.mocked(findMappingByExternalRef).mockResolvedValue(null);
    vi.mocked(createCompany).mockResolvedValue(newCompany);

    await findOrCreateCompanyForConnection({
      userId: "user-1",
      connectionId: "conn-1",
      source: "manual",
      externalCompanyId: "ext-no-name",
      companyMetadata: {},
    });

    expect(vi.mocked(createCompany)).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Dossier ext-no-name" })
    );
  });

  it("cas dégénéré : mapping orphelin (Company supprimée) → crée nouvelle Company", async () => {
    vi.mocked(findMappingByExternalRef).mockResolvedValue({
      id: "map-orphan",
      userId: "user-1",
      connectionId: "conn-1",
      companyId: "co-deleted",
      externalCompanyId: "ext-1",
      isActive: true,
      createdAt: { seconds: 1, nanoseconds: 0 } as never,
      updatedAt: { seconds: 1, nanoseconds: 0 } as never,
    } as ConnectionCompanyMapping);
    vi.mocked(getCompany).mockResolvedValue(null); // company disparue
    vi.mocked(createCompany).mockResolvedValue(newCompany);

    const result = await findOrCreateCompanyForConnection({
      userId: "user-1",
      connectionId: "conn-1",
      source: "pennylane_oauth",
      externalCompanyId: "ext-1",
      companyMetadata: { name: "Recovered" },
    });

    expect(result.isNew).toBe(true);
    expect(vi.mocked(createCompany)).toHaveBeenCalled();
  });

  it("throw si externalCompanyId vide", async () => {
    await expect(
      findOrCreateCompanyForConnection({
        userId: "user-1",
        connectionId: "conn-1",
        source: "manual",
        externalCompanyId: "   ",
        companyMetadata: {},
      })
    ).rejects.toThrow(/externalCompanyId requis/);
  });
});
