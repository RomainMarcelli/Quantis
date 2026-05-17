// File: services/integrations/adapters/pennylane/firmOAuth.test.ts
// Role: tests unitaires sur les helpers Firm OAuth post-token (brief 13/05/2026).
//
// Couverture :
//   - fetchFirmCompaniesWithToken : OK, 4xx, 5xx, payload malformé,
//     formats items vs data, normalisation
//   - deriveFirmIdFromCompanies : stabilité, vide, troncature

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deriveFirmIdFromCompanies,
  fetchFirmCompaniesWithToken,
  type PennylaneFirmCompany,
} from "@/services/integrations/adapters/pennylane/firmOAuth";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockResponse(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchFirmCompaniesWithToken", () => {
  it("retourne [] si le token est vide (court-circuit)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchFirmCompaniesWithToken("");
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("appelle GET /companies avec Bearer auth", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse(200, { items: [] })
    );
    await fetchFirmCompaniesWithToken("TOKEN");
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/companies");
    expect(String(url)).toContain("per_page=100");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer TOKEN",
    });
  });

  it("normalise items[] avec id + legal_name + siren", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse(200, {
        items: [
          { id: 101, legal_name: "Acme SAS", siren: "123456789" },
          { id: 102, name: "Beta Corp", registration_number: "987654321" },
        ],
      })
    );
    const result = await fetchFirmCompaniesWithToken("T");
    expect(result).toEqual([
      { id: "101", name: "Acme SAS", siren: "123456789" },
      { id: "102", name: "Beta Corp", siren: "987654321" },
    ]);
  });

  it("supporte le format data[] alternatif (selon version API)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse(200, {
        data: [{ id: "abc", name: "Gamma" }],
      })
    );
    const result = await fetchFirmCompaniesWithToken("T");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("abc");
  });

  it("retourne [] sur 401 (scope companies:readonly manquant ou token révoqué)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse(401, { error: "unauthorized" })
    );
    const result = await fetchFirmCompaniesWithToken("T");
    expect(result).toEqual([]);
  });

  it("retourne [] sur 5xx (Pennylane down)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse(503, "Service Unavailable")
    );
    const result = await fetchFirmCompaniesWithToken("T");
    expect(result).toEqual([]);
  });

  it("retourne [] sur erreur réseau", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await fetchFirmCompaniesWithToken("T");
    expect(result).toEqual([]);
  });

  it("retourne [] si payload non-JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse(200, "not json")
    );
    const result = await fetchFirmCompaniesWithToken("T");
    expect(result).toEqual([]);
  });

  it("filtre les items sans id (donnée corrompue)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse(200, {
        items: [
          { name: "no-id" },
          { id: "ok", name: "OK" },
        ],
      })
    );
    const result = await fetchFirmCompaniesWithToken("T");
    expect(result).toEqual([{ id: "ok", name: "OK", siren: null }]);
  });
});

describe("deriveFirmIdFromCompanies", () => {
  it("retourne '' pour une liste vide", () => {
    expect(deriveFirmIdFromCompanies([])).toBe("");
  });

  it("préfixe 'firm-' + ids triés (stable indépendamment de l'ordre)", () => {
    const a: PennylaneFirmCompany[] = [
      { id: "201", name: "B", siren: null },
      { id: "101", name: "A", siren: null },
    ];
    const b: PennylaneFirmCompany[] = [
      { id: "101", name: "A", siren: null },
      { id: "201", name: "B", siren: null },
    ];
    // Même périmètre → même firm-id, peu importe l'ordre de la réponse Pennylane.
    expect(deriveFirmIdFromCompanies(a)).toBe(deriveFirmIdFromCompanies(b));
    expect(deriveFirmIdFromCompanies(a)).toBe("firm-101-201");
  });

  it("tronque à 64 caractères pour ne pas saturer les index Firestore", () => {
    const many: PennylaneFirmCompany[] = Array.from({ length: 30 }, (_, i) => ({
      id: `companyid${String(i).padStart(4, "0")}`,
      name: `C${i}`,
      siren: null,
    }));
    const id = deriveFirmIdFromCompanies(many);
    // "firm-" (5) + 64 = 69 max
    expect(id.length).toBeLessThanOrEqual(69);
    expect(id.startsWith("firm-")).toBe(true);
  });
});
