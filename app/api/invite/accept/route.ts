// File: app/api/invite/accept/route.ts
// Role: l'user (authentifié, fraîchement signupé via /invite/[token])
// accepte l'invitation. On crée le profil users/{uid} en company_owner
// rattaché à la Company invitée, on met à jour Company.ownerUserId, puis
// on marque l'invitation comme acceptée.

import { NextResponse, type NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

type Body = { token?: unknown };

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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ error: "token requis." }, { status: 400 });

  const db = getFirebaseAdminFirestore();
  const inviteRef = db.collection("invitations").doc(token);
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) {
    return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });
  }
  const invite = inviteSnap.data() ?? {};
  if (invite.status !== "pending") {
    return NextResponse.json({ error: "Invitation déjà utilisée ou expirée." }, { status: 409 });
  }
  const expiresAt = invite.expiresAt as Timestamp | undefined;
  if (expiresAt && expiresAt.toDate() < new Date()) {
    await inviteRef.update({ status: "expired" });
    return NextResponse.json({ error: "Invitation expirée." }, { status: 410 });
  }

  const companyId = invite.companyId as string | undefined;
  const firmId = invite.firmId as string | undefined;
  if (!companyId || !firmId) {
    return NextResponse.json({ error: "Invitation corrompue." }, { status: 500 });
  }

  const now = Timestamp.now();
  const nowIso = new Date().toISOString();

  // 1) Profil users/{uid} → company_owner rattaché à la Company invitée.
  await db.collection("users").doc(userId).set(
    {
      accountType: "company_owner",
      companyId,
      invitedByFirmId: firmId,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  // 2) Company.ownerUserId = uid (le dirigeant prend la propriété).
  await db.collection("companies").doc(companyId).set(
    { ownerUserId: userId, updatedAt: now },
    { merge: true }
  );

  // 3) Invitation acceptée.
  await inviteRef.update({
    status: "accepted",
    acceptedBy: userId,
    acceptedAt: now,
  });

  return NextResponse.json({ success: true, companyId, firmId });
}
