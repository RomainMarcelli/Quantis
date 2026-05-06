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

function getOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizeUrl: string;
  tokenUrl: string;
} {
  const clientId = process.env.PENNYLANE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.PENNYLANE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.PENNYLANE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Pennylane OAuth env missing. Set PENNYLANE_OAUTH_CLIENT_ID, PENNYLANE_OAUTH_CLIENT_SECRET, PENNYLANE_OAUTH_REDIRECT_URI."
    );
  }
  return {
    clientId,
    clientSecret,
    redirectUri,
    authorizeUrl: process.env.PENNYLANE_OAUTH_AUTHORIZE_URL || DEFAULT_OAUTH_AUTHORIZE_URL,
    tokenUrl: process.env.PENNYLANE_OAUTH_TOKEN_URL || DEFAULT_OAUTH_TOKEN_URL,
  };
}

export function buildOAuthAuthorizeUrl(state: string, scopes: string[] = DEFAULT_OAUTH_SCOPES): string {
  const cfg = getOAuthConfig();
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

async function postOAuthToken(body: Record<string, string>): Promise<RawOAuthTokenResponse> {
  const cfg = getOAuthConfig();
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
}): Promise<OAuth2Auth> {
  const cfg = getOAuthConfig();
  const raw = await postOAuthToken({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  return toOAuth2Auth(raw, params.externalCompanyId);
}

export async function refreshOAuthToken(currentAuth: OAuth2Auth): Promise<OAuth2Auth> {
  if (!currentAuth.refreshToken) {
    throw new Error("Refresh token absent : reconnexion OAuth nécessaire.");
  }
  const cfg = getOAuthConfig();
  const raw = await postOAuthToken({
    grant_type: "refresh_token",
    refresh_token: currentAuth.refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  return toOAuth2Auth(raw, currentAuth.externalCompanyId);
}

function toOAuth2Auth(raw: RawOAuthTokenResponse, externalCompanyId: string): OAuth2Auth {
  const expiresAt = raw.expires_in
    ? new Date(Date.now() + raw.expires_in * 1000).toISOString()
    : null;
  return {
    mode: "oauth2",
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token ?? null,
    tokenExpiresAt: expiresAt,
    scopes: raw.scope ? raw.scope.split(/\s+/) : DEFAULT_OAUTH_SCOPES,
    externalCompanyId,
  };
}

// ─── Refresh à la demande (utilisé par l'adaptateur avant fetchAll) ─────────

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
  const refreshed = await refreshOAuthToken(connection.auth);
  return { auth: refreshed, refreshed: true };
}
