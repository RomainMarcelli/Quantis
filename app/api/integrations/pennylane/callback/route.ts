// GET /api/integrations/pennylane/callback?code=...&state=...
// Callback OAuth Pennylane unifié — gère LES DEUX flows : Firm et Company.
//
// Cette URL est celle whitelistée chez Pennylane :
//   https://app.vyzor.fr/api/integrations/pennylane/callback
//
// Détection du flow :
//   1. Le state OAuth est préfixé "firm:" ou "company:" par le starter.
//   2. Fallback : si le state n'a pas de préfixe (anciens flows), on lit
//      le champ `kind` stocké dans le doc oauth_states/{state}.
//   3. Défaut "company" si toujours indéterminé (rétrocompat Phase 1.5).
//
// Validation :
//   - Le state est lu en Firestore (collection oauth_states) pour CSRF +
//     pour récupérer le userId. TTL 10 min.
//
// Post-traitement Firm :
//   - GET /companies → liste des dossiers accessibles via le firm token.
//   - findOrCreateCompanyForConnection pour la Company représentative.
//   - createConnection avec providerSub="pennylane_firm".
//   - createMappingsForFirmCallback pour TOUS les dossiers (idempotent).
//   - Redirect vers /cabinet/onboarding/picker?connectionId=...
//
// Post-traitement Company :
//   - createConnection avec providerSub="pennylane_company".
//   - Redirect vers /documents?pennylane_oauth=success&...

import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeOAuthCode,
  type PennylaneOAuthKind,
} from "@/services/integrations/adapters/pennylane/auth";
import {
  deriveFirmIdFromCompanies,
  fetchFirmCompaniesWithToken,
} from "@/services/integrations/adapters/pennylane/firmOAuth";
import { createConnection } from "@/services/integrations/storage/connectionStore";
import { createMappingsForFirmCallback } from "@/services/companies/firmCallbackMapping";
import { findOrCreateCompanyForConnection } from "@/services/companies/companyMatching";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import type { ConnectorProviderSub } from "@/types/connectors";

export const runtime = "nodejs";

const OAUTH_STATES_COLLECTION = "oauth_states";

type StoredOAuthState = {
  userId: string;
  provider: string;
  kind?: PennylaneOAuthKind;
  firmId?: string;
  expiresAt: string;
};

function deriveKindFromState(
  state: string,
  storedKind: PennylaneOAuthKind | undefined
): PennylaneOAuthKind {
  if (state.startsWith("firm:")) return "firm";
  if (state.startsWith("company:")) return "company";
  return storedKind ?? "company";
}

function buildDocumentsRedirect(
  request: NextRequest,
  params: Record<string, string>
): URL {
  const target = new URL("/documents", request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  return target;
}

function buildConnectRedirect(
  request: NextRequest,
  params: Record<string, string>
): URL {
  const target = new URL("/cabinet/onboarding/connect", request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  return target;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(
      buildDocumentsRedirect(request, {
        pennylane_oauth: "error",
        error: "user_denied",
        detail: errorParam.slice(0, 200),
      })
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      buildDocumentsRedirect(request, {
        pennylane_oauth: "error",
        error: "missing_params",
      })
    );
  }

  // Lecture du state.
  const db = getFirebaseAdminFirestore();
  const stateRef = db.collection(OAUTH_STATES_COLLECTION).doc(state);
  const stateDoc = await stateRef.get();
  if (!stateDoc.exists) {
    return NextResponse.redirect(
      buildDocumentsRedirect(request, {
        pennylane_oauth: "error",
        error: "state_invalid",
      })
    );
  }
  const stateData = stateDoc.data() as StoredOAuthState;
  if (new Date(stateData.expiresAt).getTime() < Date.now()) {
    await stateRef.delete();
    return NextResponse.redirect(
      buildDocumentsRedirect(request, {
        pennylane_oauth: "error",
        error: "state_expired",
      })
    );
  }
  if (stateData.provider !== "pennylane") {
    return NextResponse.redirect(
      buildDocumentsRedirect(request, {
        pennylane_oauth: "error",
        error: "provider_mismatch",
      })
    );
  }

  // Détection du kind : préfixe state > champ stocké > défaut "company".
  const kind = deriveKindFromState(state, stateData.kind);
  const userId = stateData.userId;
  const firmId = stateData.firmId;

  // externalCompanyId : Pennylane peut le renvoyer en query selon l'API.
  // Pour la Firm API, on récupère via GET /companies après token (cf. ci-dessous).
  const externalCompanyIdFromQuery = url.searchParams.get("company_id") ?? "";

  try {
    const auth = await exchangeOAuthCode({
      code,
      externalCompanyId: externalCompanyIdFromQuery,
      kind,
    });

    const providerSub: ConnectorProviderSub =
      kind === "firm" ? "pennylane_firm" : "pennylane_company";

    if (kind === "firm") {
      // 1. Liste les dossiers accessibles via le firm token.
      const companies = await fetchFirmCompaniesWithToken(auth.accessToken);
      const representativeId = companies[0]?.id || "";
      const externalFirmId = deriveFirmIdFromCompanies(companies) || null;

      // 2. Company représentative (1er dossier) pour rattacher la Connection.
      //    Si pas de dossier accessible, on crée un placeholder pour ne pas
      //    perdre la Connection — le sync ultérieur pourra retenter.
      const repId =
        representativeId || `firm-${auth.accessToken.slice(0, 6)}`;
      const { company: representativeCompany } = await findOrCreateCompanyForConnection({
        userId,
        connectionId: "__pending__",
        source: "pennylane_oauth",
        externalCompanyId: repId,
        companyMetadata: {
          name: companies[0]?.name,
          siren: companies[0]?.siren ?? undefined,
        },
      });

      // 3. Crée la Connection Firm.
      const connection = await createConnection({
        userId,
        companyId: representativeCompany.id,
        provider: "pennylane",
        providerSub,
        auth,
        externalCompanyIdOverride: repId,
        externalFirmIdOverride: externalFirmId,
      });

      // 4. Mappings pour TOUS les dossiers retournés (idempotent).
      if (companies.length > 0) {
        try {
          await createMappingsForFirmCallback(
            userId,
            connection.id,
            "pennylane_oauth",
            companies.map((c) => ({
              externalCompanyId: c.id,
              name: c.name,
              siren: c.siren ?? undefined,
            }))
          );
        } catch (err) {
          console.warn("[pennylane-callback] createMappings failed (non-blocking)", err);
        }
      }

      // 5. State consommé.
      await stateRef.delete();

      console.info(
        `[pennylane-callback] firm connectionId=${connection.id} firmId=${firmId ?? "—"} ` +
          `companies=${companies.length} userId=${userId}`
      );

      // 6. Redirect vers le picker.
      const pickerUrl = new URL(
        "/cabinet/onboarding/picker",
        request.nextUrl.origin
      );
      pickerUrl.searchParams.set("connectionId", connection.id);
      pickerUrl.searchParams.set("companies_imported", String(companies.length));
      return NextResponse.redirect(pickerUrl);
    }

    // ─── Flow Company ────────────────────────────────────────────────────
    const connection = await createConnection({
      userId,
      provider: "pennylane",
      providerSub,
      auth,
    });

    await stateRef.delete();

    console.info(
      `[pennylane-callback] company connectionId=${connection.id} userId=${userId}`
    );

    const successUrl = buildDocumentsRedirect(request, {
      pennylane_oauth: "success",
      kind,
      connection_id: connection.id,
    });
    return NextResponse.redirect(successUrl);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    // Pour le flow Firm, on redirige vers /cabinet/onboarding/connect (origine
    // du flow) avec error param. Pour Company, vers /documents.
    if (kind === "firm") {
      return NextResponse.redirect(
        buildConnectRedirect(request, {
          error: "oauth_failed",
          detail: detail.slice(0, 200),
        })
      );
    }
    return NextResponse.redirect(
      buildDocumentsRedirect(request, {
        pennylane_oauth: "error",
        error: "exchange_failed",
        detail: detail.slice(0, 200),
      })
    );
  }
}
