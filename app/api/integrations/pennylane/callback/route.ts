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
    return NextResponse.json(
      { error: `OAuth Pennylane refusé : ${errorParam}` },
      { status: 400 }
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: "Paramètres OAuth manquants (code et state)." },
      { status: 400 }
    );
  }

  // Vérifier le state.
  const db = getFirebaseAdminFirestore();
  const stateRef = db.collection(OAUTH_STATES_COLLECTION).doc(state);
  const stateDoc = await stateRef.get();
  if (!stateDoc.exists) {
    return NextResponse.json({ error: "State OAuth invalide ou expiré." }, { status: 400 });
  }
  const stateData = stateDoc.data() as StoredOAuthState;
  if (new Date(stateData.expiresAt).getTime() < Date.now()) {
    await stateRef.delete();
    return NextResponse.json({ error: "State OAuth expiré." }, { status: 400 });
  }
  if (stateData.provider !== "pennylane") {
    return NextResponse.json({ error: "Provider OAuth incohérent." }, { status: 400 });
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

    const connection = await createConnection({
      userId: stateData.userId,
      provider: "pennylane",
      providerSub,
      auth,
    });

    // State consommé.
    await stateRef.delete();

    // TODO : redirection vers une page front qui informera l'utilisateur —
    // Romain branchera l'écran final. Pour l'instant on renvoie du JSON pour
    // que l'API soit testable seule.
    return NextResponse.json(
      { connectionId: connection.id, mode: "oauth2", kind, status: "active" },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Échec de l'échange OAuth.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }
}
