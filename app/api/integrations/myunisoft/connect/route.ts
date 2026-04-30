// POST /api/integrations/myunisoft/connect
// Crée une connection MyUnisoft pour l'utilisateur courant.
// Auth = JWT MyUnisoft (par cabinet/société) + ID externe de la société.
// Le X-Third-Party-Secret partenaire est lu côté serveur depuis MYUNISOFT_PARTNER_SECRET.

import { NextResponse, type NextRequest } from "next/server";
import { buildPartnerJwtAuth } from "@/services/integrations/adapters/myunisoft/auth";
import {
  ConnectionAlreadyExistsError,
  createConnection,
} from "@/services/integrations/storage/connectionStore";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";

export const runtime = "nodejs";

type ConnectRequestBody = {
  accessToken?: string;
  externalCompanyId?: string;
};

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuthenticatedUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  let body: ConnectRequestBody;
  try {
    body = (await request.json()) as ConnectRequestBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  if (!body.accessToken?.trim()) {
    return NextResponse.json({ error: "accessToken (JWT MyUnisoft) manquant." }, { status: 400 });
  }
  if (!body.externalCompanyId?.trim()) {
    return NextResponse.json(
      { error: "externalCompanyId (ID société MyUnisoft) manquant." },
      { status: 400 }
    );
  }

  try {
    const auth = await buildPartnerJwtAuth({
      accessToken: body.accessToken,
      externalCompanyId: body.externalCompanyId,
    });
    const connection = await createConnection({
      userId,
      provider: "myunisoft",
      providerSub: null,
      auth,
    });
    return NextResponse.json(
      { connectionId: connection.id, mode: "partner_jwt", status: "active" },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ConnectionAlreadyExistsError) {
      return NextResponse.json(
        {
          error: "Une connexion MyUnisoft active existe déjà.",
          detail: "Déconnectez la connexion existante avant d'en créer une nouvelle, ou utilisez Resync.",
          existingConnectionId: error.existingConnectionId,
          provider: error.provider,
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        error: "Échec de la création de la connection.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }
}
