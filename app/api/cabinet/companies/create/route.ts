// File: app/api/cabinet/companies/create/route.ts
// Role: création d'une Company rattachée au cabinet de l'user firm_member.
// Appelé par la page /cabinet/entreprises/ajouter/manuel après saisie du
// nom + SIREN + (optionnellement) fichier comptable.
//
// La Company est créée avec :
//   - ownerUserId = userId (le firm_member l'a importée)
//   - firmId      = firmId du user (lien explicite au cabinet)
//   - source      = provider de la source (fec, static_file, myunisoft…)
//   - status      = "active"
//
// Pas de Connection créée ici — seul un upload OAuth (Pennylane) ou un
// import via clé API justifierait une Connection avec tokens. Pour les
// imports manuels (FEC/PDF), l'analyse est rattachée à la Company via
// `companyId` quand le pipeline /api/analyses la persiste.

import { NextResponse, type NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import { createCompany } from "@/services/companies/companyStore";
import type { CompanySource } from "@/services/companies/types";

export const runtime = "nodejs";

type Body = {
  name?: unknown;
  siren?: unknown;
  provider?: unknown;
};

function resolveSource(provider: string): CompanySource {
  switch (provider) {
    case "pennylane_firm":
      return "pennylane_oauth";
    case "myunisoft":
      return "myu";
    case "fec":
      return "fec";
    case "static_file":
    case "manual":
    default:
      return "manual";
  }
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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Nom de l'entreprise requis." }, { status: 400 });
  }
  if (name.length > 200) {
    return NextResponse.json({ error: "Nom trop long (max 200)." }, { status: 400 });
  }

  const siren = typeof body.siren === "string" ? body.siren.replace(/\D/g, "").slice(0, 9) : "";
  const provider = typeof body.provider === "string" ? body.provider : "manual";

  // Vérifie que l'user est bien firm_member.
  const db = getFirebaseAdminFirestore();
  const userDoc = await db.collection("users").doc(userId).get();
  const userData = userDoc.exists ? userDoc.data() ?? {} : {};
  if ((userData.accountType as string | undefined) !== "firm_member") {
    return NextResponse.json(
      { error: "Réservé aux comptes cabinet (firm_member)." },
      { status: 403 }
    );
  }
  const firmId = userData.firmId as string | undefined;
  if (!firmId) {
    return NextResponse.json(
      { error: "Aucun cabinet rattaché à votre compte." },
      { status: 404 }
    );
  }

  try {
    const company = await createCompany({
      ownerUserId: userId,
      firmId,
      name,
      siren: siren || undefined,
      source: resolveSource(provider),
      status: "active",
      createdAtOverride: Timestamp.now(),
    });

    return NextResponse.json(
      { companyId: company.id, name: company.name, firmId },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Création de l'entreprise échouée.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }
}
