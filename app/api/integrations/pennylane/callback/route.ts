// GET /api/integrations/pennylane/callback?code=...&state=...
// Callback OAuth Pennylane. Échange le code contre un access_token, crée la connection.
//
// Le state est validé contre la collection oauth_states (TTL 10 min) pour vérifier
// l'origine ET pour récupérer le `kind` (firm | company) choisi côté /connect.

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
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import type { ConnectorProviderSub } from "@/types/connectors";

export const runtime = "nodejs";

const OAUTH_STATES_COLLECTION = "oauth_states";

type StoredOAuthState = {
  userId: string;
  provider: string;
  /** Brief 13/05/2026 : champ ajouté pour router Firm vs Company.
   *  Absent sur les states créés AVANT le câblage Firm (compat ascendante). */
  kind?: PennylaneOAuthKind;
  expiresAt: string;
};

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(
      buildRedirectUrl(request, {
        pennylane_oauth: "error",
        error: "user_denied",
        detail: errorParam.slice(0, 200),
      })
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      buildRedirectUrl(request, {
        pennylane_oauth: "error",
        error: "missing_params",
      })
    );
  }

  // Vérifier le state.
  const db = getFirebaseAdminFirestore();
  const stateRef = db.collection(OAUTH_STATES_COLLECTION).doc(state);
  const stateDoc = await stateRef.get();
  if (!stateDoc.exists) {
    return NextResponse.redirect(
      buildRedirectUrl(request, {
        pennylane_oauth: "error",
        error: "state_invalid",
      })
    );
  }
  const stateData = stateDoc.data() as StoredOAuthState;
  if (new Date(stateData.expiresAt).getTime() < Date.now()) {
    await stateRef.delete();
    return NextResponse.redirect(
      buildRedirectUrl(request, {
        pennylane_oauth: "error",
        error: "state_expired",
      })
    );
  }
  if (stateData.provider !== "pennylane") {
    return NextResponse.redirect(
      buildRedirectUrl(request, {
        pennylane_oauth: "error",
        error: "provider_mismatch",
      })
    );
  }

  // Kind récupéré depuis le state (signé via stockage Firestore + TTL 10 min).
  // Défaut "company" pour les states pré-Firm (Phase 1.5) — c'était le comportement implicite.
  const kind: PennylaneOAuthKind = stateData.kind ?? "company";

  // externalCompanyId : Pennylane peut le renvoyer en query ou non selon l'API.
  // Pour la Firm API, l'identité est récupérée via GET /companies post-token
  // (cf. commit suivant qui câble ce fetch). Pour l'instant on persiste vide
  // si non fourni — le sync ultérieur résoudra l'identité.
  const externalCompanyId = url.searchParams.get("company_id") ?? "";

  try {
    const auth = await exchangeOAuthCode({ code, externalCompanyId, kind });

    // providerSub dérivé du kind. Le ConnectionRecord persiste cette info
    // pour que les futures requêtes (sync, refresh) sachent à quelle API
    // Pennylane elles parlent (Firm vs Company).
    const providerSub: ConnectorProviderSub =
      kind === "firm" ? "pennylane_firm" : "pennylane_company";

    // Brief 13/05/2026 — Firm OAuth uniquement : on liste les dossiers
    // accessibles via GET /companies (scope companies:readonly requis).
    // Sélection multi-dossiers = v2 → on stocke un identifiant cabinet
    // synthétique stable (deriveFirmIdFromCompanies) + le 1er dossier
    // comme externalCompanyId représentatif. Le sync ultérieur itèrera
    // sur l'ensemble des dossiers via le firm token.
    let externalCompanyIdOverride: string | undefined;
    let externalFirmIdOverride: string | null | undefined;
    let companiesCount = 0;
    if (kind === "firm") {
      const companies = await fetchFirmCompaniesWithToken(auth.accessToken);
      companiesCount = companies.length;
      externalCompanyIdOverride = companies[0]?.id ?? "";
      externalFirmIdOverride = deriveFirmIdFromCompanies(companies) || null;
    }

    const connection = await createConnection({
      userId: stateData.userId,
      provider: "pennylane",
      providerSub,
      auth,
      externalCompanyIdOverride,
      externalFirmIdOverride,
    });

    // State consommé.
    await stateRef.delete();

    // Brief Tâche 3 (13/05/2026) : redirection vers /documents avec un
    // marqueur de succès — c'est un flow déclenché côté navigateur, le
    // callback ne peut pas répondre en JSON (l'utilisateur verrait une
    // page brute). Le front /documents lit ces query params pour
    // afficher un toast et rafraîchir la liste des connexions.
    const successUrl = buildRedirectUrl(request, {
      pennylane_oauth: "success",
      kind,
      connection_id: connection.id,
      companies_count: String(companiesCount),
    });
    return NextResponse.redirect(successUrl);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    const errorUrl = buildRedirectUrl(request, {
      pennylane_oauth: "error",
      error: "exchange_failed",
      detail: detail.slice(0, 200),
    });
    return NextResponse.redirect(errorUrl);
  }
}

/**
 * Construit l'URL de redirection vers /documents en preservant l'origine
 * de la requête (utile pour les déploiements multi-environnements : prod,
 * preview Vercel, dev).
 */
function buildRedirectUrl(
  request: NextRequest,
  params: Record<string, string>
): URL {
  const target = new URL("/documents", request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  return target;
}
