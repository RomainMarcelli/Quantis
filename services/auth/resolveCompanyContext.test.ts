// File: services/auth/resolveCompanyContext.test.ts
// Role: tests sur le helper de résolution du contexte Company avec
// rétrocompat userId/companyId (Sprint A).

import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCompanyContext } from "@/services/auth/resolveCompanyContext";
import { CompanyAccessError } from "@/services/auth/requireCompanyAccess";

vi.mock("@/services/companies/companyStore", () => ({
  getCompany: vi.fn(),
  listCompaniesForUser: vi.fn(),
}));

import {
  getCompany,
  listCompaniesForUser,
} from "@/services/companies/companyStore";

const companyA = {
  id: "co-A",
  ownerUserId: "user-1",
  name: "Acme",
  source: "manual" as const,
  status: "active" as const,
  createdAt: { seconds: 1, nanoseconds: 0 } as never,
  updatedAt: { seconds: 1, nanoseconds: 0 } as never,
};

const companyB = {
  ...companyA,
  id: "co-B",
  name: "Beta",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(getCompany).mockReset();
  vi.mocked(listCompaniesForUser).mockReset();
});

describe("resolveCompanyContext — mode explicit (companyId fourni)", () => {
  it("valide l'accès via requireCompanyAccess + retourne mode 'explicit'", async () => {
    vi.mocked(getCompany).mockResolvedValue(companyA);
    const result = await resolveCompanyContext("user-1", "co-A");
    expect(result.mode).toBe("explicit");
    expect(result.company.id).toBe("co-A");
  });

  it("propage le 403 si user n'a pas accès à la Company", async () => {
    vi.mocked(getCompany).mockResolvedValue({ ...companyA, ownerUserId: "other-user" });
    await expect(resolveCompanyContext("user-1", "co-A")).rejects.toBeInstanceOf(
      CompanyAccessError
    );
  });

  it("propage le 404 si la Company n'existe pas", async () => {
    vi.mocked(getCompany).mockResolvedValue(null);
    await expect(resolveCompanyContext("user-1", "ghost")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("resolveCompanyContext — mode fallback (companyId absent)", () => {
  it("retombe sur la 1re Company du user + mode 'fallback'", async () => {
    vi.mocked(listCompaniesForUser).mockResolvedValue([companyA, companyB]);
    const result = await resolveCompanyContext("user-1", null);
    expect(result.mode).toBe("fallback");
    expect(result.company.id).toBe("co-A"); // première dans la liste
  });

  it("retombe en fallback si companyIdHint est chaîne vide", async () => {
    vi.mocked(listCompaniesForUser).mockResolvedValue([companyA]);
    const result = await resolveCompanyContext("user-1", "");
    expect(result.mode).toBe("fallback");
  });

  it("retombe en fallback si companyIdHint est whitespace-only", async () => {
    vi.mocked(listCompaniesForUser).mockResolvedValue([companyA]);
    const result = await resolveCompanyContext("user-1", "   ");
    expect(result.mode).toBe("fallback");
  });

  it("throw 404 si le user n'a aucune Company (migration incomplète)", async () => {
    vi.mocked(listCompaniesForUser).mockResolvedValue([]);
    await expect(resolveCompanyContext("ghost-user", null)).rejects.toMatchObject({
      name: "CompanyAccessError",
      status: 404,
    });
  });
});
