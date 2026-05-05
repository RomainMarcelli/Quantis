// GET /api/integrations/pennylane/callback?code=...&state=...
// Callback OAuth Pennylane. Échange le code contre un access_token, crée la connection.
//
// Le state est validé contre la collection oauth_states (TTL 10 min) pour vérifier l'origine.

import { NextResponse, type NextRequest } from "next/server";
import { exchangeOAuthCode } from "@/services/integrations/adapters/pennylane/auth";
import { createConnection } from "@/services/integrations/storage/connectionStore";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

const OAUTH_STATES_COLLECTION = "oauth_states";

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
  const stateData = stateDoc.data() as { userId: string; provider: string; expiresAt: string };
  if (new Date(stateData.expiresAt).getTime() < Date.now()) {
    await stateRef.delete();
    return NextResponse.json({ error: "State OAuth expiré." }, { status: 400 });
  }
  if (stateData.provider !== "pennylane") {
    return NextResponse.json({ error: "Provider OAuth incohérent." }, { status: 400 });
  }

  // Pennylane peut renvoyer l'identité de l'entreprise dans la réponse token.
  // Pour l'instant on laisse vide ; à compléter quand on aura accès au format réel.
  const externalCompanyId = url.searchParams.get("company_id") ?? "";

  try {
    const auth = await exchangeOAuthCode({ code, externalCompanyId });
    const connection = await createConnection({
      userId: stateData.userId,
      provider: "pennylane",
      providerSub: "pennylane_company",
      auth,
    });

    // State consommé.
    await stateRef.delete();

    // Redirection vers une page front qui informera l'utilisateur — Romain branchera l'écran final.
    // Pour l'instant on renvoie du JSON pour que l'API soit testable seule.
    return NextResponse.json(
      { connectionId: connection.id, mode: "oauth2", status: "active" },
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
