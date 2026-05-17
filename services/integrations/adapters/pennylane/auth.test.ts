// File: services/integrations/adapters/pennylane/auth.test.ts
// Role: tests unitaires de la couche OAuth Pennylane (brief 13/05/2026).
//
// Couverture :
//   - buildOAuthAuthorizeUrl : params, kind (firm/company), scopes
//   - exchangeOAuthCode : POST formulaire, parsing token, scopes fallback
//   - refreshOAuthToken : grant_type, refresh_token absent
//   - ensureFreshAuth : pas de refresh si > buffer, refresh si proche expiration
//   - isCompanyOAuthEnabled : feature flag
//   - Rétrocompat PENNYLANE_OAUTH_* → fallback Firm
//
// On mocke globalThis.fetch pour intercepter les appels HTTP.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Connection, OAuth2Auth } from "@/types/connectors";

// Imports déférés pour pouvoir tweaker les env vars AVANT l'import du module.
// auth.ts ne capture pas les env vars au module load (getOAuthConfig lit
// process.env à chaque appel), donc on peut juste les setter avant chaque test.
import {
  buildOAuthAuthorizeUrl,
  ensureFreshAuth,
  exchangeOAuthCode,
  isCompanyOAuthEnabled,
  isFirmOAuthVisible,
  refreshOAuthToken,
} from "@/services/integrations/adapters/pennylane/auth";

const ORIGINAL_ENV = { ...process.env };

function setFirmEnv() {
  process.env.PENNYLANE_FIRM_CLIENT_ID = "firm-client";
  process.env.PENNYLANE_FIRM_CLIENT_SECRET = "firm-secret";
  process.env.PENNYLANE_FIRM_REDIRECT_URI =
    "https://app.vyzor.fr/api/integrations/pennylane/callback";
  process.env.PENNYLANE_FIRM_SCOPES =
    "categories:readonly customers:readonly fiscal_years:readonly journals:readonly ledger_accounts:readonly ledger_entries:readonly suppliers:readonly transactions:readonly trial_balance:readonly companies:readonly dms_files:readonly";
}

function setCompanyEnv(enabled: boolean) {
  process.env.PENNYLANE_COMPANY_CLIENT_ID = "company-client";
  process.env.PENNYLANE_COMPANY_CLIENT_SECRET = "company-secret";
  process.env.PENNYLANE_COMPANY_REDIRECT_URI =
    "https://app.vyzor.fr/api/integrations/pennylane/callback";
  process.env.PENNYLANE_COMPANY_ENABLED = String(enabled);
}

function unsetAllPennylaneEnv() {
  // Liste exhaustive pour partir d'un état propre — sinon les tests qui
  // vérifient les fallback échouent si d'autres tests ont set les vars.
  delete process.env.PENNYLANE_FIRM_CLIENT_ID;
  delete process.env.PENNYLANE_FIRM_CLIENT_SECRET;
  delete process.env.PENNYLANE_FIRM_REDIRECT_URI;
  delete process.env.PENNYLANE_FIRM_SCOPES;
  delete process.env.PENNYLANE_FIRM_VISIBLE;
  delete process.env.PENNYLANE_COMPANY_CLIENT_ID;
  delete process.env.PENNYLANE_COMPANY_CLIENT_SECRET;
  delete process.env.PENNYLANE_COMPANY_REDIRECT_URI;
  delete process.env.PENNYLANE_COMPANY_SCOPES;
  delete process.env.PENNYLANE_COMPANY_ENABLED;
  delete process.env.PENNYLANE_OAUTH_CLIENT_ID;
  delete process.env.PENNYLANE_OAUTH_CLIENT_SECRET;
  delete process.env.PENNYLANE_OAUTH_REDIRECT_URI;
  delete process.env.PENNYLANE_OAUTH_AUTHORIZE_URL;
  delete process.env.PENNYLANE_OAUTH_TOKEN_URL;
  // Nouvelles vars résolues par getOAuthConfig (nommage Vercel canonique).
  delete process.env.PENNYLANE_REDIRECT_URI;
  delete process.env.APP_BASE_URL;
}

beforeEach(() => {
  unsetAllPennylaneEnv();
});

afterEach(() => {
  // Restaure l'env initial pour ne pas polluer d'autres suites de tests.
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("PENNYLANE_")) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value !== undefined) process.env[key] = value;
  }
  vi.restoreAllMocks();
});

describe("isCompanyOAuthEnabled", () => {
  it("retourne false par défaut (flag absent)", () => {
    expect(isCompanyOAuthEnabled()).toBe(false);
  });

  it("retourne false quand PENNYLANE_COMPANY_ENABLED=false", () => {
    process.env.PENNYLANE_COMPANY_ENABLED = "false";
    expect(isCompanyOAuthEnabled()).toBe(false);
  });

  it("retourne true quand PENNYLANE_COMPANY_ENABLED=true", () => {
    process.env.PENNYLANE_COMPANY_ENABLED = "true";
    expect(isCompanyOAuthEnabled()).toBe(true);
  });

  it("est insensible à la casse (TRUE/True)", () => {
    process.env.PENNYLANE_COMPANY_ENABLED = "TRUE";
    expect(isCompanyOAuthEnabled()).toBe(true);
  });
});

describe("isFirmOAuthVisible (brief 14/05/2026)", () => {
  it("retourne false par défaut — la tuile Firm est masquée en prod", () => {
    expect(isFirmOAuthVisible()).toBe(false);
  });

  it("retourne false quand PENNYLANE_FIRM_VISIBLE=false", () => {
    process.env.PENNYLANE_FIRM_VISIBLE = "false";
    expect(isFirmOAuthVisible()).toBe(false);
  });

  it("retourne true quand PENNYLANE_FIRM_VISIBLE=true (preview Vercel)", () => {
    process.env.PENNYLANE_FIRM_VISIBLE = "true";
    expect(isFirmOAuthVisible()).toBe(true);
  });

  it("est insensible à la casse (TRUE/True)", () => {
    process.env.PENNYLANE_FIRM_VISIBLE = "True";
    expect(isFirmOAuthVisible()).toBe(true);
  });

  it("rejette les valeurs autres que 'true' (1, yes, on...) — strict", () => {
    process.env.PENNYLANE_FIRM_VISIBLE = "1";
    expect(isFirmOAuthVisible()).toBe(false);
    process.env.PENNYLANE_FIRM_VISIBLE = "yes";
    expect(isFirmOAuthVisible()).toBe(false);
  });
});

describe("buildOAuthAuthorizeUrl — Firm (cabinet)", () => {
  it("construit l'URL avec les 11 scopes Firm validés", () => {
    setFirmEnv();
    const url = new URL(buildOAuthAuthorizeUrl("STATE123", "firm"));

    expect(url.origin + url.pathname).toBe(
      "https://app.pennylane.com/oauth/authorize"
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("firm-client");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.vyzor.fr/api/integrations/pennylane/callback"
    );
    expect(url.searchParams.get("state")).toBe("STATE123");

    const scopes = url.searchParams.get("scope")?.split(" ") ?? [];
    expect(scopes).toContain("companies:readonly");
    expect(scopes).toContain("ledger_entries:readonly");
    expect(scopes).toContain("trial_balance:readonly");
    expect(scopes).toHaveLength(11);
  });

  it("kind par défaut = firm", () => {
    setFirmEnv();
    const url = new URL(buildOAuthAuthorizeUrl("STATE_DEFAULT"));
    expect(url.searchParams.get("client_id")).toBe("firm-client");
  });

  it("override de scopes (utile pour les tests)", () => {
    setFirmEnv();
    const url = new URL(
      buildOAuthAuthorizeUrl("S", "firm", ["custom:scope"])
    );
    expect(url.searchParams.get("scope")).toBe("custom:scope");
  });

  it("lève une erreur si PENNYLANE_FIRM_* + fallback PENNYLANE_OAUTH_* absents", () => {
    expect(() => buildOAuthAuthorizeUrl("S", "firm")).toThrow(
      /Pennylane firm OAuth env missing/
    );
  });

  it("rétrocompat : utilise PENNYLANE_OAUTH_* si PENNYLANE_FIRM_* absents", () => {
    process.env.PENNYLANE_OAUTH_CLIENT_ID = "legacy-client";
    process.env.PENNYLANE_OAUTH_CLIENT_SECRET = "legacy-secret";
    process.env.PENNYLANE_OAUTH_REDIRECT_URI =
      "http://localhost:3000/api/integrations/pennylane/callback";

    const url = new URL(buildOAuthAuthorizeUrl("S", "firm"));
    expect(url.searchParams.get("client_id")).toBe("legacy-client");
  });
});

describe("buildOAuthAuthorizeUrl — Company (feature flag)", () => {
  it("lève une erreur si PENNYLANE_COMPANY_ENABLED=false", () => {
    setCompanyEnv(false);
    expect(() => buildOAuthAuthorizeUrl("S", "company")).toThrow(
      /Pennylane Company OAuth désactivé/
    );
  });

  it("fonctionne quand le flag est activé + vars définies", () => {
    setCompanyEnv(true);
    const url = new URL(buildOAuthAuthorizeUrl("S", "company"));
    expect(url.searchParams.get("client_id")).toBe("company-client");
  });
});

// ─── Mock fetch helpers ────────────────────────────────────────────────────

function mockJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("exchangeOAuthCode", () => {
  it("POST formulaire OAuth + parse access_token + refresh_token + scopes", async () => {
    setFirmEnv();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockJsonResponse(200, {
        access_token: "AT_FIRM",
        refresh_token: "RT_FIRM",
        expires_in: 604800,
        scope: "companies:readonly journals:readonly",
        token_type: "bearer",
      })
    );

    const auth = await exchangeOAuthCode({
      code: "CODE_ABC",
      externalCompanyId: "",
      kind: "firm",
    });

    // Vérifie la requête HTTP émise.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0]!;
    expect(calledUrl).toBe("https://app.pennylane.com/oauth/token");
    const body = String((calledInit as RequestInit).body);
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=CODE_ABC");
    expect(body).toContain("client_id=firm-client");
    expect(body).toContain("client_secret=firm-secret");

    // Vérifie le retour modélisé.
    expect(auth.mode).toBe("oauth2");
    expect(auth.accessToken).toBe("AT_FIRM");
    expect(auth.refreshToken).toBe("RT_FIRM");
    expect(auth.scopes).toEqual([
      "companies:readonly",
      "journals:readonly",
    ]);
    expect(auth.tokenExpiresAt).not.toBeNull();
  });

  it("fallback sur les scopes de l'env si la réponse n'en contient pas", async () => {
    setFirmEnv();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockJsonResponse(200, {
        access_token: "AT",
        expires_in: 3600,
        token_type: "bearer",
        // Pas de "scope" dans la réponse.
      })
    );

    const auth = await exchangeOAuthCode({
      code: "C",
      externalCompanyId: "",
      kind: "firm",
    });
    expect(auth.scopes).toContain("companies:readonly");
    expect(auth.scopes).toHaveLength(11);
  });

  it("lève une erreur sur 4xx du token endpoint", async () => {
    setFirmEnv();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("invalid_grant", { status: 400 })
    );
    await expect(
      exchangeOAuthCode({ code: "BAD", externalCompanyId: "", kind: "firm" })
    ).rejects.toThrow(/Pennylane OAuth token endpoint 400/);
  });
});

describe("refreshOAuthToken", () => {
  it("POST grant_type=refresh_token + retourne nouveau access_token", async () => {
    setFirmEnv();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockJsonResponse(200, {
        access_token: "AT_FRESH",
        refresh_token: "RT_FRESH",
        expires_in: 604800,
        scope: "companies:readonly",
      })
    );
    const current: OAuth2Auth = {
      mode: "oauth2",
      accessToken: "AT_OLD",
      refreshToken: "RT_OLD",
      tokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
      scopes: ["companies:readonly"],
      externalCompanyId: "co-1",
    };
    const refreshed = await refreshOAuthToken(current, "firm");

    expect(refreshed.accessToken).toBe("AT_FRESH");
    expect(refreshed.refreshToken).toBe("RT_FRESH");
    expect(refreshed.externalCompanyId).toBe("co-1"); // conservé
    const body = String((fetchSpy.mock.calls[0]![1] as RequestInit).body);
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=RT_OLD");
  });

  it("lève une erreur si refreshToken absent (= reconnexion requise)", async () => {
    setFirmEnv();
    const noRefresh: OAuth2Auth = {
      mode: "oauth2",
      accessToken: "AT",
      refreshToken: null,
      tokenExpiresAt: null,
      scopes: [],
      externalCompanyId: "",
    };
    await expect(refreshOAuthToken(noRefresh, "firm")).rejects.toThrow(
      /Refresh token absent/
    );
  });
});

describe("ensureFreshAuth", () => {
  function makeConnection(
    auth: OAuth2Auth,
    providerSub: "pennylane_firm" | "pennylane_company" = "pennylane_firm"
  ): Connection {
    return {
      id: "conn",
      userId: "u",
      provider: "pennylane",
      providerSub,
      status: "active",
      authMode: "oauth2",
      tokenPreview: "x…x",
      tokenExpiresAt: auth.tokenExpiresAt,
      scopes: auth.scopes,
      externalCompanyId: auth.externalCompanyId,
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
      auth,
    };
  }

  it("ne refresh pas tant que l'expiration est > buffer (60s)", async () => {
    setFirmEnv();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const auth: OAuth2Auth = {
      mode: "oauth2",
      accessToken: "AT",
      refreshToken: "RT",
      tokenExpiresAt: new Date(Date.now() + 3600 * 1000).toISOString(), // 1h
      scopes: [],
      externalCompanyId: "co",
    };
    const result = await ensureFreshAuth(makeConnection(auth));
    expect(result.refreshed).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refresh quand l'expiration est < buffer (60s)", async () => {
    setFirmEnv();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockJsonResponse(200, {
        access_token: "AT_NEW",
        refresh_token: "RT_NEW",
        expires_in: 604800,
      })
    );
    const auth: OAuth2Auth = {
      mode: "oauth2",
      accessToken: "AT_OLD",
      refreshToken: "RT_OLD",
      tokenExpiresAt: new Date(Date.now() + 5000).toISOString(), // 5s
      scopes: [],
      externalCompanyId: "co",
    };
    const result = await ensureFreshAuth(makeConnection(auth));
    expect(result.refreshed).toBe(true);
    if (result.auth.mode === "oauth2") {
      expect(result.auth.accessToken).toBe("AT_NEW");
    }
  });

  it("route le refresh vers le kind correspondant au providerSub (firm)", async () => {
    setFirmEnv();
    setCompanyEnv(true);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockJsonResponse(200, {
        access_token: "AT_NEW",
        refresh_token: "RT_NEW",
        expires_in: 604800,
      })
    );
    const auth: OAuth2Auth = {
      mode: "oauth2",
      accessToken: "AT",
      refreshToken: "RT",
      tokenExpiresAt: new Date(Date.now() + 5000).toISOString(),
      scopes: [],
      externalCompanyId: "co",
    };
    await ensureFreshAuth(makeConnection(auth, "pennylane_firm"));
    const body = String((fetchSpy.mock.calls[0]![1] as RequestInit).body);
    // Confirme qu'on a tapé sur la config Firm (client_id firm-client).
    expect(body).toContain("client_id=firm-client");
  });

  it("passthrough si auth.mode !== oauth2 (token manuel, partner_jwt)", async () => {
    const conn = {
      ...makeConnection({
        mode: "oauth2",
        accessToken: "AT",
        refreshToken: "RT",
        tokenExpiresAt: null,
        scopes: [],
        externalCompanyId: "co",
      }),
      auth: {
        mode: "company_token" as const,
        accessToken: "manual-token",
        externalCompanyId: "co",
      },
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await ensureFreshAuth(conn);
    expect(result.refreshed).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
