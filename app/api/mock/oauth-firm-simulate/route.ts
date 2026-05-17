// File: app/api/mock/oauth-firm-simulate/route.ts
// Role: simule le callback OAuth Pennylane Firm pour l'itération locale.
//
// Crée en Firestore :
//   - 1 Firm (firmId généré, ownerUserId = uid du caller)
//   - 1 Connection mock (provider=pennylane_firm)
//   - 3 Companies fictives (Boulangerie / Plomberie / Cabinet médical)
//   - 3 mappings connection_companies (isActive=true → visibles dans le portefeuille)
//   - 3 analyses mock par Company (kpis + quantisScore → portefeuille affiche les KPIs)
//
// Puis bascule users/{uid}.accountType = "firm_member" + firmId.
//
// Gate : MOCK_OAUTH_FIRM_ENABLED === "true". Refuse sinon (403).
//
// Tous les docs créés portent `mock: true` pour permettre un nettoyage simple
// (cf. scripts/mock-firm-dossiers.mts --revert pour la logique de revert).

import { NextResponse, type NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

const MOCK_COMPANIES = [
  { name: "Boulangerie Martin SARL",      ext: "pl-mock-boulangerie",  ca: 180_000, tn:  42_000, score: 72 },
  { name: "SARL Dupuis Plomberie",        ext: "pl-mock-plomberie",    ca: 320_000, tn:  -8_000, score: 41 },
  { name: "Cabinet Médical Leroy",        ext: "pl-mock-cabinet-med",  ca: 610_000, tn: 125_000, score: 88 },
];

export async function GET(req: NextRequest) {
  if (process.env.MOCK_OAUTH_FIRM_ENABLED !== "true") {
    return NextResponse.json({ error: "Mock disabled" }, { status: 403 });
  }

  const uid = req.nextUrl.searchParams.get("uid");
  const firmName = req.nextUrl.searchParams.get("firmName");
  if (!uid || !firmName) {
    return NextResponse.json({ error: "Missing uid or firmName" }, { status: 400 });
  }

  try {
    const db = getFirebaseAdminFirestore();
    const now = Timestamp.now();
    const ts = Date.now();
    const firmId = `firm_mock_${ts}`;
    const connectionId = `conn_firm_mock_${ts}`;

    // 1) Firm
    await db.collection("firms").doc(firmId).set({
      firmId,
      name: firmName,
      ownerUserId: uid,
      memberUserIds: [uid],
      createdAt: now,
      updatedAt: now,
      mock: true,
    });

    // 2) users/{uid}.accountType = firm_member
    await db.collection("users").doc(uid).set(
      {
        accountType: "firm_member",
        firmId,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // 3) Connection mock
    await db.collection("connections").doc(connectionId).set({
      id: connectionId,
      userId: uid,
      firmId,
      provider: "pennylane",
      kind: "firm_oauth",
      status: "connected",
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: "success",
      createdAt: now,
      updatedAt: now,
      mock: true,
    });

    // 4) Companies + mappings + analyses
    const mappings: Array<{ companyId: string; externalCompanyName: string }> = [];
    for (const mc of MOCK_COMPANIES) {
      const companyId = `co_mock_${ts}_${Math.random().toString(36).slice(2, 9)}`;
      await db.collection("companies").doc(companyId).set({
        id: companyId,
        ownerUserId: uid,
        firmId,
        name: mc.name,
        externalCompanyId: mc.ext,
        source: "pennylane_oauth",
        status: "active",
        createdAt: now,
        updatedAt: now,
        mock: true,
      });

      const mappingId = `mapping_mock_${companyId}`;
      await db.collection("connection_companies").doc(mappingId).set({
        userId: uid,
        connectionId,
        companyId,
        externalCompanyId: mc.ext,
        externalCompanyName: mc.name,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        mock: true,
      });

      // Analyse mock — alimente les KPIs synthétiques du portefeuille.
      const analysisId = `an_mock_${companyId}`;
      await db.collection("analyses").doc(analysisId).set({
        id: analysisId,
        userId: uid,
        companyId,
        createdAt: new Date().toISOString(),
        kpis: { ca: mc.ca, tn: mc.tn },
        quantisScore: { vyzor_score: mc.score },
        mock: true,
      });

      mappings.push({ companyId, externalCompanyName: mc.name });
    }

    return NextResponse.json({
      success: true,
      firmId,
      connectionId,
      mappings,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown" },
      { status: 500 }
    );
  }
}
