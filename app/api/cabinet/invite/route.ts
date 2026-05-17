// File: app/api/cabinet/invite/route.ts
// Role: crée une invitation pour qu'un dirigeant rejoigne sa Company sur Vyzor.
// Appelé par le bouton "Inviter le dirigeant" dans /cabinet/portefeuille.
//
// Modèle Firestore `invitations/{token}` :
//   { token, companyId, companyName, firmId, invitedBy (firm_member uid),
//     email, status: "pending" | "accepted" | "expired",
//     expiresAt: Timestamp, createdAt, acceptedBy?, acceptedAt? }
//
// L'envoi d'email réel est délégué au front (copier/coller du lien). Une
// intégration Resend (déjà en deps) pourra être branchée plus tard sans
// changer ce contrat.

import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import { getCompany } from "@/services/companies/companyStore";

export const runtime = "nodejs";

type Body = {
  companyId?: unknown;
  email?: unknown;
};

const INVITE_TTL_DAYS = 7;

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

  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!companyId) return NextResponse.json({ error: "companyId requis." }, { status: 400 });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email invalide." }, { status: 400 });
  }

  const db = getFirebaseAdminFirestore();

  // Vérifie que l'user est firm_member et qu'il appartient bien à la firm
  // qui possède la Company.
  const userDoc = await db.collection("users").doc(userId).get();
  const userData = userDoc.exists ? userDoc.data() ?? {} : {};
  if ((userData.accountType as string | undefined) !== "firm_member") {
    return NextResponse.json(
      { error: "Réservé aux comptes cabinet." },
      { status: 403 }
    );
  }
  const firmId = userData.firmId as string | undefined;
  if (!firmId) return NextResponse.json({ error: "Aucun cabinet." }, { status: 404 });

  const company = await getCompany(companyId);
  if (!company) return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });
  if (company.firmId !== firmId) {
    return NextResponse.json(
      { error: "Cette entreprise n'appartient pas à votre cabinet." },
      { status: 403 }
    );
  }

  const token = randomUUID();
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
  );
  const now = Timestamp.now();

  await db.collection("invitations").doc(token).set({
    token,
    companyId,
    companyName: company.name,
    firmId,
    invitedBy: userId,
    email,
    status: "pending",
    expiresAt,
    createdAt: now,
  });

  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  const inviteUrl = `${baseUrl.replace(/\/$/, "")}/invite/${token}`;

  return NextResponse.json({
    token,
    inviteUrl,
    expiresAt: expiresAt.toDate().toISOString(),
  });
}
