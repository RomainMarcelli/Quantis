// File: services/auth/requireCompanyAccess.test.ts
// Role: tests unitaires sur le middleware d'autorisation Company.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CompanyAccessError,
  requireCompanyAccess,
} from "@/services/auth/requireCompanyAccess";

vi.mock("@/services/companies/companyStore", () => ({
  getCompany: vi.fn(),
}));

import { getCompany } from "@/services/companies/companyStore";

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(getCompany).mockReset();
});

describe("requireCompanyAccess", () => {
  it("retourne la Company si ownerUserId === userId", async () => {
    vi.mocked(getCompany).mockResolvedValue({
      id: "co-1",
      ownerUserId: "user-1",
      name: "Acme",
      source: "manual",
      status: "active",
      createdAt: { seconds: 1, nanoseconds: 0 } as never,
      updatedAt: { seconds: 1, nanoseconds: 0 } as never,
    });
    const result = await requireCompanyAccess("user-1", "co-1");
    expect(result.company.id).toBe("co-1");
  });

  it("throw 404 si la Company n'existe pas", async () => {
    vi.mocked(getCompany).mockResolvedValue(null);
    await expect(requireCompanyAccess("user-1", "ghost")).rejects.toMatchObject({
      name: "CompanyAccessError",
      status: 404,
    });
  });

  it("throw 403 si ownerUserId !== userId", async () => {
    vi.mocked(getCompany).mockResolvedValue({
      id: "co-1",
      ownerUserId: "owner-user",
      name: "Acme",
      source: "manual",
      status: "active",
      createdAt: { seconds: 1, nanoseconds: 0 } as never,
      updatedAt: { seconds: 1, nanoseconds: 0 } as never,
    });
    await expect(requireCompanyAccess("attacker-user", "co-1")).rejects.toMatchObject({
      name: "CompanyAccessError",
      status: 403,
    });
  });

  it("autorise la lecture même si status === 'archived' (Sprint A : pas de blocage)", async () => {
    vi.mocked(getCompany).mockResolvedValue({
      id: "co-1",
      ownerUserId: "user-1",
      name: "Old co",
      source: "manual",
      status: "archived",
      createdAt: { seconds: 1, nanoseconds: 0 } as never,
      updatedAt: { seconds: 1, nanoseconds: 0 } as never,
    });
    const result = await requireCompanyAccess("user-1", "co-1");
    expect(result.company.status).toBe("archived");
  });

  it("CompanyAccessError porte le status, companyId, userId pour le caller", async () => {
    vi.mocked(getCompany).mockResolvedValue(null);
    try {
      await requireCompanyAccess("user-1", "ghost-co");
    } catch (e) {
      expect(e).toBeInstanceOf(CompanyAccessError);
      const err = e as CompanyAccessError;
      expect(err.status).toBe(404);
      expect(err.companyId).toBe("ghost-co");
      expect(err.userId).toBe("user-1");
    }
  });
});
