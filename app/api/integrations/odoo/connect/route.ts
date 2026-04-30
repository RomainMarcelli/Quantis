// POST /api/integrations/odoo/connect
// Crée une connection Odoo pour l'utilisateur courant.
// Auth = instanceUrl + login + apiKey (+ database optionnelle pour self-hosted).

import { NextResponse, type NextRequest } from "next/server";
import { buildOdooSessionAuth } from "@/services/integrations/adapters/odoo/auth";
import {
  ConnectionAlreadyExistsError,
  createConnection,
} from "@/services/integrations/storage/connectionStore";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";

export const runtime = "nodejs";

type ConnectRequestBody = {
  instanceUrl?: string;
  login?: string;
  apiKey?: string;
  database?: string; // optionnel pour SaaS odoo.com (auto-détecté), requis pour self-hosted
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

  if (!body.instanceUrl?.trim()) {
    return NextResponse.json({ error: "instanceUrl manquant." }, { status: 400 });
  }
  if (!body.login?.trim()) {
    return NextResponse.json({ error: "login (email Odoo) manquant." }, { status: 400 });
  }
  if (!body.apiKey?.trim()) {
    return NextResponse.json({ error: "apiKey (ou mot de passe) manquant." }, { status: 400 });
  }

  try {
    const auth = await buildOdooSessionAuth({
      instanceUrl: body.instanceUrl,
      login: body.login,
      apiKey: body.apiKey,
      database: body.database,
    });
    const connection = await createConnection({
      userId,
      provider: "odoo",
      providerSub: null,
      auth,
    });
    return NextResponse.json(
      {
        connectionId: connection.id,
        mode: "odoo_session",
        status: "active",
        instanceUrl: auth.instanceUrl,
        database: auth.database,
        login: auth.login,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ConnectionAlreadyExistsError) {
      return NextResponse.json(
        {
          error: "Une connexion Odoo active existe déjà.",
          detail: "Déconnectez la connexion existante avant d'en créer une nouvelle, ou utilisez Resync.",
          existingConnectionId: error.existingConnectionId,
          provider: error.provider,
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        error: "Échec de la création de la connection Odoo.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }
}
