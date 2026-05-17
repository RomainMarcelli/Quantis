// POST /api/cabinet/firm/create
// Crée une Firm pour l'user authentifié + met à jour son profil pour
// passer en mode firm_member.
//
// Sprint C — route appelée par OnboardingSelector quand l'user choisit
// le parcours cabinet. Le firmId créé permet ensuite d'accéder à
// /cabinet/onboarding/connect → OAuth Pennylane Firm → picker → portefeuille.

import { NextResponse, type NextRequest } from "next/server";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { createFirm } from "@/services/companies/firmStore";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

type CreateFirmBody = {
  name?: unknown;
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

  let body: CreateFirmBody;
  try {
    body = (await request.json()) as CreateFirmBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Nom du cabinet requis." }, { status: 400 });
  }
  if (name.length > 120) {
    return NextResponse.json({ error: "Nom du cabinet trop long (max 120)." }, { status: 400 });
  }

  try {
    // 1. Crée la Firm (owner = user authentifié, ajouté auto dans memberUserIds).
    const firm = await createFirm({ ownerUserId: userId, name });

    // 2. Met à jour le profil user pour passer en mode firm_member.
    // Sprint C : exclusif — un user a un seul accountType (cf. audit-sprint-C Q1).
    const db = getFirebaseAdminFirestore();
    await db.collection("users").doc(userId).set(
      {
        accountType: "firm_member",
        firmId: firm.firmId,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json(
      {
        firmId: firm.firmId,
        name: firm.name,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Échec de la création du cabinet.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }
}
