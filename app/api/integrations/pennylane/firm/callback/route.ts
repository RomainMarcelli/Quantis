// GET /api/integrations/pennylane/firm/callback
// Callback OAuth Pennylane Firm (Sprint C version minimale).
//
// Flow :
//   1. Récupère code + state depuis query params.
//   2. Valide state (CSRF) en Firestore (collection oauth_states, TTL 10 min).
//   3. Échange code → access_token via POST /oauth/token Pennylane.
//   4. Appelle GET /api/external/v2/companies avec le firm token →
//      liste des dossiers clients accessibles.
//   5. Crée la Connection Firm dans Firestore (provider: "pennylane",
//      providerSub: "pennylane_firm", authMode: "oauth2", firmId associé
//      à la Company représentative).
//   6. Appelle createMappingsForFirmCallback → mappings idempotents.
//   7. Redirige vers /cabinet/onboarding/picker?connectionId=XXX.
//
// Notes :
//   - Si PENNYLANE_FIRM_CLIENT_ID absent (sandbox / dev sans creds réels),
//     la route renvoie 503 avec un message clair.
//   - Le helper fetchFirmCompaniesWithToken est défini inline (Sprint C
//     minimal — la version complète sur feature/maj-connecteurs sera
//     fusionnée ultérieurement).

import { NextResponse, type NextRequest } from "next/server";
import { createConnection } from "@/services/integrations/storage/connectionStore";
import { createMappingsForFirmCallback } from "@/services/companies/firmCallbackMapping";
import { findOrCreateCompanyForConnection } from "@/services/companies/companyMatching";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

const OAUTH_STATES_COLLECTION = "oauth_states";
const DEFAULT_AUTHORIZE_URL = "https://app.pennylane.com/oauth/authorize";
const DEFAULT_TOKEN_URL = "https://app.pennylane.com/oauth/token";
const DEFAULT_API_BASE = "https://app.pennylane.com/api/external/v2";

type StoredOAuthState = {
  userId: string;
  provider: string;
  kind?: "firm" | "company";
  firmId?: string;
  expiresAt: string;
};

type RawTokenResponse = {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

type RawCompany = {
  id?: string | number;
  name?: string;
  legal_name?: string;
  siren?: string | null;
};

function getOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenUrl: string;
  apiBase: string;
} | null {
  const clientId = process.env.PENNYLANE_FIRM_CLIENT_ID;
  const clientSecret = process.env.PENNYLANE_FIRM_CLIENT_SECRET;
  const redirectUri = process.env.PENNYLANE_FIRM_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return {
    clientId,
    clientSecret,
    redirectUri,
    tokenUrl: process.env.PENNYLANE_OAUTH_TOKEN_URL || DEFAULT_TOKEN_URL,
    apiBase: process.env.PENNYLANE_API_BASE_URL || DEFAULT_API_BASE,
  };
}

function buildRedirect(request: NextRequest, params: Record<string, string>): URL {
  // Erreurs et succès renvoient vers /cabinet/onboarding/connect (origine
  // du flow) avec des query params. Le picker est chargé séparément
  // après validation de la connexion.
  const url = new URL("/cabinet/onboarding/connect", request.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url;
}

export async function GET(request: NextRequest) {
  const cfg = getOAuthConfig();
  if (!cfg) {
    return NextResponse.json(
      {
        error: "Pennylane Firm OAuth non configuré.",
        detail: "PENNYLANE_FIRM_CLIENT_ID / _CLIENT_SECRET / _REDIRECT_URI manquants côté serveur.",
      },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(
      buildRedirect(request, { error: "user_denied", detail: errorParam.slice(0, 100) })
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(buildRedirect(request, { error: "missing_params" }));
  }

  // 1. Valider state CSRF.
  const db = getFirebaseAdminFirestore();
  const stateRef = db.collection(OAUTH_STATES_COLLECTION).doc(state);
  const stateDoc = await stateRef.get();
  if (!stateDoc.exists) {
    return NextResponse.redirect(buildRedirect(request, { error: "state_invalid" }));
  }
  const stateData = stateDoc.data() as StoredOAuthState;
  if (new Date(stateData.expiresAt).getTime() < Date.now()) {
    await stateRef.delete();
    return NextResponse.redirect(buildRedirect(request, { error: "state_expired" }));
  }
  if (stateData.provider !== "pennylane") {
    return NextResponse.redirect(buildRedirect(request, { error: "provider_mismatch" }));
  }
  const userId = stateData.userId;
  const firmId = stateData.firmId;

  // 2. Échange code → access_token.
  let tokens: RawTokenResponse;
  try {
    const tokenRes = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: cfg.redirectUri,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }).toString(),
    });
    if (!tokenRes.ok) {
      const detail = (await tokenRes.text()).slice(0, 200);
      console.warn(`[firm-callback] token exchange failed ${tokenRes.status}: ${detail}`);
      return NextResponse.redirect(
        buildRedirect(request, { error: "oauth_failed", detail: "token_exchange" })
      );
    }
    tokens = (await tokenRes.json()) as RawTokenResponse;
  } catch (err) {
    console.error("[firm-callback] token network error", err);
    return NextResponse.redirect(buildRedirect(request, { error: "oauth_failed", detail: "network" }));
  }

  // 3. Fetch /companies (liste dossiers du cabinet).
  let companies: Array<{ externalCompanyId: string; name?: string; siren?: string }> = [];
  try {
    const compRes = await fetch(`${cfg.apiBase}/companies?per_page=100`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: "application/json",
      },
    });
    if (!compRes.ok) {
      console.warn(`[firm-callback] /companies non-OK ${compRes.status}`);
      // Continue quand même — on crée la Connection sans mapping, l'user
      // peut retenter le sync plus tard.
    } else {
      const payload = (await compRes.json()) as { items?: RawCompany[]; data?: RawCompany[] };
      const raw = payload.items ?? payload.data ?? [];
      companies = raw
        .map((c) => {
          const id = c.id != null ? String(c.id) : "";
          if (!id) return null;
          return {
            externalCompanyId: id,
            name: c.legal_name?.trim() || c.name?.trim() || `Dossier ${id}`,
            siren: c.siren?.trim() || undefined,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
    }
  } catch (err) {
    console.warn("[firm-callback] /companies network error", err);
    // Idem : on continue avec companies=[] pour ne pas perdre la Connection.
  }

  // 4. Choisir une Company "représentative" (le 1er dossier) pour rattacher
  //    la Connection. Sprint C : si pas de dossier accessible, on crée
  //    quand même une Company placeholder (cas pas censé arriver mais
  //    défensif).
  const representativeId =
    companies[0]?.externalCompanyId || `firm-${tokens.access_token.slice(0, 6)}`;
  const { company: representativeCompany } = await findOrCreateCompanyForConnection({
    userId,
    connectionId: "__pending__", // sera remplacé après createConnection
    source: "pennylane_oauth",
    externalCompanyId: representativeId,
    companyMetadata: {
      name: companies[0]?.name,
      siren: companies[0]?.siren,
    },
  });

  // 5. Crée la Connection Firm en Firestore.
  let connection;
  try {
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;
    connection = await createConnection({
      userId,
      companyId: representativeCompany.id,
      provider: "pennylane",
      providerSub: "pennylane_firm",
      auth: {
        mode: "oauth2",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiresAt: expiresAt,
        scopes: tokens.scope ? tokens.scope.split(/\s+/) : [],
        externalCompanyId: representativeId,
      },
    });
  } catch (err) {
    console.error("[firm-callback] createConnection failed", err);
    return NextResponse.redirect(
      buildRedirect(request, {
        error: "oauth_failed",
        detail: err instanceof Error ? err.message.slice(0, 80) : "connection_create",
      })
    );
  }

  // 6. Crée les mappings pour TOUS les dossiers retournés (Sprint B helper).
  if (companies.length > 0) {
    try {
      await createMappingsForFirmCallback(
        userId,
        connection.id,
        "pennylane_oauth",
        companies
      );
    } catch (err) {
      console.warn("[firm-callback] createMappings failed (non-blocking)", err);
    }
  }

  // 7. State consommé.
  await stateRef.delete();

  // Logging final (pas de secret en clair).
  console.info(
    `[firm-callback] connectionId=${connection.id} firmId=${firmId ?? "—"} ` +
      `companies=${companies.length} userId=${userId}`
  );

  // 8. Redirect vers le picker.
  const pickerUrl = new URL("/cabinet/onboarding/picker", request.nextUrl.origin);
  pickerUrl.searchParams.set("connectionId", connection.id);
  pickerUrl.searchParams.set("companies_imported", String(companies.length));
  return NextResponse.redirect(pickerUrl);
}
