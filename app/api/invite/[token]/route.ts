// File: app/api/invite/[token]/route.ts
// Role: lookup public d'une invitation par token (le token EST le secret).
// Sans auth requise — le visiteur qui clique le lien n'a pas encore de
// compte. Retourne uniquement les champs nécessaires à l'affichage de la
// landing /invite/[token] (companyName + email + status).
//
// Pourquoi côté serveur : les Firestore rules par défaut refusent les
// reads non-authentifiés sur `invitations/*`, et on ne veut pas exposer
// la collection au monde. Admin SDK contourne les rules en sécurité par
// le code (on ne retourne pas firmId / invitedBy / token brut).

import { NextResponse, type NextRequest } from "next/server";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import type { Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Token requis." }, { status: 400 });
  }

  const db = getFirebaseAdminFirestore();
  const snap = await db.collection("invitations").doc(token).get();
  if (!snap.exists) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  const data = snap.data() ?? {};
  const status = String(data.status ?? "pending");
  const companyName = String(data.companyName ?? "Votre entreprise");
  const email = String(data.email ?? "");
  const expiresAtTs = data.expiresAt as Timestamp | undefined;
  const expiresAt = expiresAtTs?.toDate?.();

  if (status === "accepted") {
    return NextResponse.json({ status: "used", companyName });
  }
  if (expiresAt && expiresAt < new Date()) {
    return NextResponse.json({ status: "expired", companyName });
  }

  return NextResponse.json({ status: "valid", companyName, email });
}
