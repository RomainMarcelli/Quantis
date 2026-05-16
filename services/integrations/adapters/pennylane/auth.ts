// Authentification Pennylane — 3 modes supportés.
// 1. Company Token : copié-collé par l'utilisateur (settings Pennylane). Pas de refresh.
// 2. Firm Token   : équivalent pour les cabinets. Pas de refresh.
// 3. OAuth 2.0    : pour intégrateurs (partnership Pennylane). Avec refresh.
//
// Doc : https://pennylane.readme.io/docs/authentication

import { pennylaneVerifyAuth } from "@/services/integrations/adapters/pennylane/client";
import type {
  CompanyTokenAuth,
  Connection,
  ConnectorAuth,
  FirmTokenAuth,
  OAuth2Auth,
} from "@/types/connectors";

const DEFAULT_OAUTH_AUTHORIZE_URL = "https://app.pennylane.com/oauth/authorize";
const DEFAULT_OAUTH_TOKEN_URL = "https://app.pennylane.com/oauth/token";
const DEFAULT_OAUTH_SCOPES = ["read"];

// Marge de sécurité avant expiration (refresh ~1 minute avant pour éviter les courses).
const TOKEN_REFRESH_BUFFER_MS = 60_000;

// Brief 13/05/2026 : Pennylane expose 2 APIs OAuth distinctes :
//  - Firm    : cabinets comptables (multi-dossiers). 11 scopes readonly validés.
//  - Company : entreprises (un seul dossier). En attente de validation côté
//              Pennylane → feature flag PENNYLANE_COMPANY_ENABLED.
// Le kind est porté par le state CSRF (signé via Firestore) tout au long du
// flow authorize → callback pour qu'on sache à quelle API on parle.
export type PennylaneOAuthKind = "firm" | "company";

/**
 * Indique si le mode OAuth Company est activé via feature flag.
 * Par défaut désactivé tant que Pennylane n'a pas validé les credentials.
 */
export function isCompanyOAuthEnabled(): boolean {
  return (process.env.PENNYLANE_COMPANY_ENABLED ?? "false").toLowerCase() === "true";
}

// ─── Mode 1 : Company Token ─────────────────────────────────────────────────

export async function buildCompanyTokenAuth(params: {
  accessToken: string;
}): Promise<CompanyTokenAuth> {
  const auth: CompanyTokenAuth = {
    mode: "company_token",
    accessToken: params.accessToken.trim(),
    externalCompanyId: "", // sera renseigné après vérification via /me
  };

  const tempConnection = { auth } as unknown as Connection;
  const valid = await pennylaneVerifyAuth(tempConnection);
  if (!valid) {
    throw new Error("Le Company Token Pennylane fourni est invalide ou révoqué.");
  }

  // /me renvoie l'identité de l'entreprise — on la stocke pour pouvoir filtrer les requêtes.
  // Pour l'instant on laisse vide ; le sync l'inférera ou on appellera /me dans le store.
  return auth;
}

// ─── Mode 2 : Firm Token ────────────────────────────────────────────────────

export async function buildFirmTokenAuth(params: {
  accessToken: string;
  externalFirmId: string;
}): Promise<FirmTokenAuth> {
  const auth: FirmTokenAuth = {
    mode: "firm_token",
    accessToken: params.accessToken.trim(),
    externalFirmId: params.externalFirmId.trim(),
  };

  const tempConnection = { auth } as unknown as Connection;
  const valid = await pennylaneVerifyAuth(tempConnection);
  if (!valid) {
    throw new Error("Le Firm Token Pennylane fourni est invalide ou révoqué.");
  }

  return auth;
}

// ─── Mode 3 : OAuth 2.0 ─────────────────────────────────────────────────────

type OAuthConfig = {
  kind: PennylaneOAuthKind;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  authorizeUrl: string;
  tokenUrl: string;
};

/**
 * Résout la configuration OAuth pour le kind demandé (firm | company).
 *
 * Ordre de résolution (avec fallback rétrocompat) :
 *   1. Variables explicites PENNYLANE_{KIND}_* (FIRM_CLIENT_ID, etc.).
 *   2. Fallback PENNYLANE_OAUTH_* (ancienne nomenclature Phase 1.5).
 *
 * Pour Company, lève une erreur si le feature flag est désactivé (la route
 * doit avoir vérifié `isCompanyOAuthEnabled()` en amont).
 */
function getOAuthConfig(kind: PennylaneOAuthKind = "firm"): OAuthConfig {
  if (kind === "company" && !isCompanyOAuthEnabled()) {
    throw new Error(
      "Pennylane Company OAuth désactivé (PENNYLANE_COMPANY_ENABLED=false). En attente de validation Pennylane."
    );
  }

  const prefix = kind === "firm" ? "PENNYLANE_FIRM" : "PENNYLANE_COMPANY";
  const clientId =
    process.env[`${prefix}_CLIENT_ID`] ?? process.env.PENNYLANE_OAUTH_CLIENT_ID;
  const clientSecret =
    process.env[`${prefix}_CLIENT_SECRET`] ?? process.env.PENNYLANE_OAUTH_CLIENT_SECRET;
  const redirectUri =
    process.env[`${prefix}_REDIRECT_URI`] ?? process.env.PENNYLANE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      `Pennylane ${kind} OAuth env missing. Set ${prefix}_CLIENT_ID, ${prefix}_CLIENT_SECRET, ${prefix}_REDIRECT_URI.`
    );
  }

  // Scopes : env var dédiée par kind, sinon DEFAULT_OAUTH_SCOPES (lecture
  // seule générique — convient pour Company API basique mais PAS pour la
  // Firm API qui exige 11 scopes explicites cf. brief 13/05/2026).
  const scopesRaw = process.env[`${prefix}_SCOPES`];
  const scopes = scopesRaw && scopesRaw.trim()
    ? scopesRaw.trim().split(/\s+/)
    : DEFAULT_OAUTH_SCOPES;

  return {
    kind,
    clientId,
    clientSecret,
    redirectUri,
    scopes,
    authorizeUrl: process.env.PENNYLANE_OAUTH_AUTHORIZE_URL || DEFAULT_OAUTH_AUTHORIZE_URL,
    tokenUrl: process.env.PENNYLANE_OAUTH_TOKEN_URL || DEFAULT_OAUTH_TOKEN_URL,
  };
}

/**
 * Construit l'URL d'autorisation Pennylane pour le kind demandé.
 * `scopes` peut overrider la valeur d'env (utile pour les tests unitaires).
 */
export function buildOAuthAuthorizeUrl(
  state: string,
  kind: PennylaneOAuthKind = "firm",
  scopesOverride?: string[]
): string {
  const cfg = getOAuthConfig(kind);
  const scopes = scopesOverride ?? cfg.scopes;
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

type RawOAuthTokenResponse = {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number; // secondes
  scope?: string;
  token_type?: string;
  // Selon la conf Pennylane, l'identité de l'entreprise peut arriver via un autre endpoint.
};

async function postOAuthToken(
  kind: PennylaneOAuthKind,
  body: Record<string, string>
): Promise<RawOAuthTokenResponse> {
  const cfg = getOAuthConfig(kind);
  const formBody = new URLSearchParams(body).toString();
  const response = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: formBody,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Pennylane OAuth token endpoint ${response.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text) as RawOAuthTokenResponse;
}

export async function exchangeOAuthCode(params: {
  code: string;
  externalCompanyId: string;
  kind?: PennylaneOAuthKind;
}): Promise<OAuth2Auth> {
  const kind = params.kind ?? "firm";
  const cfg = getOAuthConfig(kind);
  const raw = await postOAuthToken(kind, {
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  return toOAuth2Auth(raw, params.externalCompanyId, cfg.scopes);
}

export async function refreshOAuthToken(
  currentAuth: OAuth2Auth,
  kind: PennylaneOAuthKind = "firm"
): Promise<OAuth2Auth> {
  if (!currentAuth.refreshToken) {
    throw new Error("Refresh token absent : reconnexion OAuth nécessaire.");
  }
  const cfg = getOAuthConfig(kind);
  const raw = await postOAuthToken(kind, {
    grant_type: "refresh_token",
    refresh_token: currentAuth.refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  return toOAuth2Auth(raw, currentAuth.externalCompanyId, cfg.scopes);
}

function toOAuth2Auth(
  raw: RawOAuthTokenResponse,
  externalCompanyId: string,
  fallbackScopes: string[]
): OAuth2Auth {
  const expiresAt = raw.expires_in
    ? new Date(Date.now() + raw.expires_in * 1000).toISOString()
    : null;
  return {
    mode: "oauth2",
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token ?? null,
    tokenExpiresAt: expiresAt,
    scopes: raw.scope ? raw.scope.split(/\s+/) : fallbackScopes,
    externalCompanyId,
  };
}

// ─── Refresh à la demande (utilisé par l'adaptateur avant fetchAll) ─────────

/**
 * Détermine le kind OAuth (firm | company) à partir de la connexion en cours.
 * Utilisé par ensureFreshAuth pour router le refresh vers la bonne config.
 */
function inferKindFromConnection(connection: Connection): PennylaneOAuthKind {
  if (connection.providerSub === "pennylane_firm") return "firm";
  // Default = company pour compat avec les connexions Phase 1.5 antérieures
  // au câblage Firm (toutes étaient pennylane_company implicite).
  return "company";
}

export async function ensureFreshAuth(connection: Connection): Promise<{
  auth: ConnectorAuth;
  refreshed: boolean;
}> {
  if (connection.auth.mode !== "oauth2") {
    return { auth: connection.auth, refreshed: false };
  }
  const expiresAt = connection.auth.tokenExpiresAt
    ? new Date(connection.auth.tokenExpiresAt).getTime()
    : null;
  const needsRefresh = expiresAt !== null && expiresAt - Date.now() < TOKEN_REFRESH_BUFFER_MS;
  if (!needsRefresh) {
    return { auth: connection.auth, refreshed: false };
  }
  const kind = inferKindFromConnection(connection);
  const refreshed = await refreshOAuthToken(connection.auth, kind);
  return { auth: refreshed, refreshed: true };
}
