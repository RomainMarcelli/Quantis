// File: app/api/mock/oauth-firm-simulate/route.ts
// Role: simule le callback OAuth Pennylane Firm pour l'itération locale.
//
// Crée en Firestore :
//   - 1 Firm (firmId généré, ownerUserId = uid du caller)
//   - 1 Connection mock conforme au schéma ConnectionRecord (encryptedAccessToken,
//     authMode oauth2, etc.) — sinon getUserConnectionById lève sur decryptToken
//   - 3 Companies fictives (Boulangerie / Plomberie / Cabinet médical)
//   - 3 mappings connection_companies (isActive=true)
//   - 3 analyses mock avec champ `companyId` (lu par AnalysisDetailView pour
//     scoper le cockpit au dossier actif)
//
// Bascule users/{uid}.accountType = "firm_member" + firmId.
//
// Gate : MOCK_OAUTH_FIRM_ENABLED === "true".
// Tous les docs créés portent `mock: true` pour permettre un nettoyage simple.

import { NextResponse, type NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import { encryptToken } from "@/lib/server/tokenCrypto";

export const runtime = "nodejs";

const MOCK_COMPANIES = [
  { name: "Boulangerie Martin SARL",      ext: "pl-mock-boulangerie",  ca: 180_000, tn:  42_000, ebitda:  28_000, score: 72 },
  { name: "SARL Dupuis Plomberie",        ext: "pl-mock-plomberie",    ca: 320_000, tn:  -8_000, ebitda: -12_000, score: 41 },
  { name: "Cabinet Médical Leroy",        ext: "pl-mock-cabinet-med",  ca: 610_000, tn: 125_000, ebitda:  98_000, score: 88 },
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
    const nowIso = new Date().toISOString();
    const ts = Date.now();
    const firmId = `firm_mock_${ts}`;
    const connectionId = `conn_firm_mock_${ts}`;
    const mockTokenCipher = encryptToken(`mock_access_${ts}`);

    // Idempotence : avant de seed une nouvelle simulation, on purge TOUS les
    // documents `mock: true` rattachés à ce user. Évite l'accumulation
    // (chaque clic créait jusqu'ici 3 dossiers de plus, qui restaient actifs
    // après "Activer" car le PATCH ne scope qu'au connectionId courant).
    const cleanupColls = ["firms", "connections", "connection_companies", "companies", "analyses"] as const;
    for (const coll of cleanupColls) {
      const ownerField =
        coll === "firms" ? "ownerUserId" :
        coll === "companies" ? "ownerUserId" :
        "userId";
      const snap = await db
        .collection(coll)
        .where(ownerField, "==", uid)
        .where("mock", "==", true)
        .get();
      // Batch par 400 (limite Firestore = 500/op).
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = db.batch();
        for (const d of docs.slice(i, i + 400)) batch.delete(d.ref);
        await batch.commit();
      }
    }

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
        updatedAt: nowIso,
      },
      { merge: true }
    );

    // 3) Connection mock — schéma ConnectionRecord complet pour passer
    //    getUserConnectionById → toConnection → decryptAuth sans erreur.
    await db.collection("connections").doc(connectionId).set({
      userId: uid,
      firmId,
      provider: "pennylane",
      providerSub: "pennylane_firm",
      status: "active",
      authMode: "oauth2",
      encryptedAccessToken: mockTokenCipher,
      encryptedRefreshToken: null,
      tokenPreview: "mock_…",
      tokenExpiresAt: null,
      scopes: ["read_only:companies", "read_only:journal_entries"],
      externalCompanyId: "",
      externalFirmId: `firm_ext_mock_${ts}`,
      odooInstanceUrl: null,
      odooDatabase: null,
      odooLogin: null,
      syncCursors: {},
      lastSyncAt: nowIso,
      lastSyncStatus: "success",
      lastSyncError: null,
      createdAt: nowIso,
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

      const analysisId = `an_mock_${companyId}`;
      await db.collection("analyses").doc(analysisId).set({
        id: analysisId,
        userId: uid,
        companyId,
        folderName: mc.name,
        fiscalYear: 2025,
        createdAt: nowIso,
        kpis: { ca: mc.ca, tn: mc.tn, ebitda: mc.ebitda },
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
