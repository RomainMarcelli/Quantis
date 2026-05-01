// File: services/vyzorBenchmark.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchVyzorBenchmark } from "@/services/vyzorBenchmark";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function setEnv(url: string | undefined, key: string | undefined) {
  if (url === undefined) {
    delete process.env.SUPABASE_URL;
  } else {
    process.env.SUPABASE_URL = url;
  }
  if (key === undefined) {
    delete process.env.SUPABASE_ANON_KEY;
  } else {
    process.env.SUPABASE_ANON_KEY = key;
  }
}

describe("fetchVyzorBenchmark", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("retourne missing_env quand SUPABASE_URL est absent", async () => {
    setEnv(undefined, "anon-key");
    const result = await fetchVyzorBenchmark();
    expect(result).toEqual({ ok: false, reason: "missing_env" });
  });

  it("retourne missing_env quand SUPABASE_ANON_KEY est absent", async () => {
    setEnv("https://x.supabase.co", undefined);
    const result = await fetchVyzorBenchmark();
    expect(result).toEqual({ ok: false, reason: "missing_env" });
  });

  it("appelle PostgREST avec apikey + Authorization Bearer et la vue cible", async () => {
    setEnv("https://yhmsyneesatkwzvqwbgg.supabase.co", "publishable-key");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([{ ca_median: 200000 }]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const result = await fetchVyzorBenchmark();
    expect(result.ok).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain("/rest/v1/v_vyzor_global_stats_360_full");
    expect(url).toContain("select=*");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.apikey).toBe("publishable-key");
    expect(headers.Authorization).toBe("Bearer publishable-key");
  });

  it("retourne empty_view quand la vue ne renvoie aucune ligne", async () => {
    setEnv("https://x.supabase.co", "key");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );

    const result = await fetchVyzorBenchmark();
    expect(result).toEqual({ ok: false, reason: "empty_view" });
  });

  it("retourne http_error quand Supabase répond en erreur", async () => {
    setEnv("https://x.supabase.co", "key");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("forbidden", { status: 403, statusText: "Forbidden" })
    );

    const result = await fetchVyzorBenchmark();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("http_error");
      expect(result.detail).toContain("403");
    }
  });

  it("parse la première ligne du payload comme VyzorBenchmarkRow", async () => {
    setEnv("https://x.supabase.co", "key");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { ca_bas: 100, ca_median: 200, ca_haut: 500 },
          { ca_bas: 999 } // ne doit pas être prise
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await fetchVyzorBenchmark();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.row.ca_median).toBe(200);
    }
  });
});
