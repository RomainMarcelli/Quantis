// POST /api/integrations/myunisoft/connect
// Crée une connection MyUnisoft pour l'utilisateur courant.
// Auth = JWT MyUnisoft (par cabinet/société). L'externalCompanyId est dérivé
// automatiquement depuis le JWT côté serveur (claim `sub` ou `cabinet_id`),
// avec fallback sur un identifiant déterministe basé sur le token — l'utilisateur
// n'a aucun ID à saisir manuellement (le JWT scope déjà la société côté API).
// Le X-Third-Party-Secret partenaire est lu côté serveur depuis MYUNISOFT_THIRD_PARTY_SECRET.

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
  /** Optionnel — auto-déduit depuis le JWT si absent. Conservé pour compat
   *  d'éventuels appels programmatiques anciens. */
  externalCompanyId?: string;
};

/**
 * Décode le payload (claims) d'un JWT sans vérification de signature.
 * Sûr ici car on extrait juste un identifiant pour le label Firestore —
 * l'authentification réelle vis-à-vis de MyUnisoft passe par le JWT
 * complet envoyé en `Authorization: Bearer` (vérifié par leur API).
 */
function extractJwtClaim(jwt: string, claim: string): string | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    const value = payload[claim];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Dérive un identifiant stable de société depuis le JWT MyUnisoft.
 *
 * Le payload JWT MyUnisoft observé sur la sandbox utilise des claims
 * courts non-standard (`s` = society, `t` = tenant/cabinet, `m` =
 * member). On essaye d'abord les claims standard JWT (`sub`), puis ces
 * formats courts spécifiques MyUnisoft, puis un fallback hash 12 chars.
 * Le résultat sert UNIQUEMENT de label pour identifier la connection
 * dans Firestore — l'authentification réelle vis-à-vis de l'API
 * MyUnisoft passe par le JWT complet.
 */
function deriveExternalCompanyIdFromJwt(jwt: string): string {
  const candidates = ["sub", "cabinet_id", "company_id", "producerId"];
  for (const claim of candidates) {
    const v = extractJwtClaim(jwt, claim);
    if (v) return v;
  }
  // Claims MyUnisoft courts : `s` = society, `t` = tenant. Sont
  // numériques côté payload — on lit aussi via une variante number→string.
  for (const claim of ["s", "t"]) {
    try {
      const parts = jwt.split(".");
      if (parts.length !== 3) break;
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<
        string,
        unknown
      >;
      const v = payload[claim];
      if (typeof v === "number" && Number.isFinite(v)) return `myunisoft-${claim}-${v}`;
      if (typeof v === "string" && v.trim()) return `myunisoft-${claim}-${v.trim()}`;
    } catch {
      // ignore — on retombe sur le fallback ci-dessous
    }
  }
  // Fallback déterministe : 12 derniers chars du JWT (hors signature) —
  // suffisant pour distinguer plusieurs cabinets côté Firestore label.
  const lastDot = jwt.lastIndexOf(".");
  const tail = lastDot > 0 ? jwt.slice(0, lastDot) : jwt;
  return `myunisoft-${tail.slice(-12)}`;
}

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

  const accessToken = body.accessToken?.trim();
  if (!accessToken) {
    return NextResponse.json({ error: "accessToken (JWT MyUnisoft) manquant." }, { status: 400 });
  }

  // Backward-compat : si l'appelant fournit un externalCompanyId explicite
  // (ex. script de seed), on le respecte ; sinon on dérive du JWT.
  const externalCompanyId =
    body.externalCompanyId?.trim() || deriveExternalCompanyIdFromJwt(accessToken);

  try {
    const auth = await buildPartnerJwtAuth({
      accessToken,
      externalCompanyId,
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
