// File: scripts/seed-demo.mts
// Role: peuple Firestore (émulateur recommandé) avec 2 comptes démo :
//   1. demo-owner-001 (company_owner) : 1 Company avec données sandbox.
//   2. demo-firm-001 (firm_member) : 1 Firm + 3 Companies + mappings.
//
// Sprint D Tâche 5. Usage : pnpm seed:demo (ou npx tsx --env-file=.env.demo scripts/seed-demo.mts).
//
// SÉCURITÉ : refuse de s'exécuter contre la prod Firestore sans flag
// explicite. Détection : si NEXT_PUBLIC_FIREBASE_EMULATOR !== "true"
// ET aucun flag --force, throw.

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const FORCE_PROD = process.argv.includes("--force-prod");
const EMULATOR_MODE = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "true";

if (!EMULATOR_MODE && !FORCE_PROD) {
  console.error(
    "❌ Refus d'exécuter le seed démo en prod sans --force-prod.\n" +
      "   Active l'émulateur Firebase (NEXT_PUBLIC_FIREBASE_EMULATOR=true) ou\n" +
      "   passe --force-prod si tu sais ce que tu fais."
  );
  process.exit(1);
}

function initAdmin(): void {
  if (getApps().length > 0) return;
  if (EMULATOR_MODE) {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIREBASE_EMULATOR_HOST || "localhost:8080";
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "demo-vyzor" });
    return;
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin env missing for prod seed.");
  }
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const OWNER_UID = process.env.DEMO_OWNER_USER_UID || "demo-owner-001";
const FIRM_UID = process.env.DEMO_FIRM_USER_UID || "demo-firm-001";
const FIRM_ID = "demo-firm-abc";

const DEMO_COMPANIES = [
  {
    companyId: "demo-co-001",
    name: "Boulangerie Martin",
    externalCompanyId: "pl-martin-001",
    externalCompanyName: "Boulangerie Martin",
    ca: 180_000,
    tn: 42_000,
    vyzorScore: 72,
  },
  {
    companyId: "demo-co-002",
    name: "SARL Dupuis Plomberie",
    externalCompanyId: "pl-dupuis-001",
    externalCompanyName: "SARL Dupuis Plomberie",
    ca: 320_000,
    tn: -8_000,
    vyzorScore: 41,
  },
  {
    companyId: "demo-co-003",
    name: "Cabinet Médical Leroy",
    externalCompanyId: "pl-leroy-001",
    externalCompanyName: "Cabinet Médical Leroy",
    ca: 610_000,
    tn: 125_000,
    vyzorScore: 88,
  },
];

const SOLO_COMPANY_ID = "demo-co-solo";

async function seed(): Promise<void> {
  initAdmin();
  const db = getFirestore();
  const now = Timestamp.now();

  console.log("🌱 Seed démo Sprint D — démarrage");
  console.log(`   Mode : ${EMULATOR_MODE ? "ÉMULATEUR" : "PROD (--force-prod)"}`);

  // ─── User 1 : company_owner (dirigeant solo) ─────────────────────────
  await db.collection("users").doc(OWNER_UID).set(
    {
      email: "dirigeant@demo.vyzor.fr",
      firstName: "Antoine",
      lastName: "Dirigeant",
      companyName: "Vyzor Demo SAS",
      siren: "902144027",
      companySize: "startup_tpe",
      sector: "Conseil B2B",
      emailVerified: true,
      accountType: "company_owner",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  // Sa Company solo.
  await db.collection("companies").doc(SOLO_COMPANY_ID).set({
    ownerUserId: OWNER_UID,
    name: "Vyzor Demo SAS",
    siren: "902144027",
    source: "manual",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  // Une analyse minimale pour que le cockpit affiche des chiffres cohérents.
  await db.collection("analyses").doc(`demo-analysis-solo`).set({
    userId: OWNER_UID,
    companyId: SOLO_COMPANY_ID,
    folderName: "Démo",
    fiscalYear: 2025,
    createdAt: new Date().toISOString(),
    sourceFiles: [],
    parsedData: [],
    rawData: {},
    mappedData: { total_prod_expl: 222000, dispo: 318000, emprunts: 100000 },
    financialFacts: {},
    kpis: { ca: 222000, tn: 218000, total_actif: 653000, total_passif: 618000 },
    quantisScore: {
      vyzor_score: 76,
      piliers: { rentabilite: 80, solvabilite: 75, liquidite: 70, efficacite: 78 },
      alerte_investissement: false,
    },
    uploadContext: { companySize: "startup_tpe", sector: "Conseil B2B", source: "manual" },
  });

  console.log(`✓ User company_owner créé : ${OWNER_UID} → Company ${SOLO_COMPANY_ID}`);

  // ─── User 2 : firm_member (expert-comptable) ─────────────────────────
  await db.collection("users").doc(FIRM_UID).set(
    {
      email: "cabinet@demo.vyzor.fr",
      firstName: "Sophie",
      lastName: "Dupont",
      companyName: "Cabinet Dupont & Associés",
      siren: "",
      companySize: "tpe_5_19",
      sector: "Expertise comptable",
      emailVerified: true,
      accountType: "firm_member",
      firmId: FIRM_ID,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  // La Firm.
  await db.collection("firms").doc(FIRM_ID).set({
    name: "Cabinet Dupont & Associés",
    ownerUserId: FIRM_UID,
    memberUserIds: [FIRM_UID],
    createdAt: now,
    updatedAt: now,
  });

  // Connection Firm Pennylane mockée.
  const connectionId = "demo-conn-firm";
  await db.collection("connections").doc(connectionId).set({
    userId: FIRM_UID,
    companyId: DEMO_COMPANIES[0]!.companyId, // representative
    provider: "pennylane",
    providerSub: "pennylane_firm",
    status: "active",
    authMode: "oauth2",
    encryptedAccessToken: "enc(demo-token)",
    encryptedRefreshToken: "enc(demo-refresh)",
    tokenPreview: "demo…oken",
    tokenExpiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    scopes: ["companies:readonly", "ledger_entries:readonly"],
    externalCompanyId: DEMO_COMPANIES[0]!.externalCompanyId,
    externalFirmId: null,
    odooInstanceUrl: null,
    odooDatabase: null,
    odooLogin: null,
    syncCursors: {
      entries: { paginationCursor: null, lastSyncedAt: null },
      invoices: { paginationCursor: null, lastSyncedAt: null },
      ledgerAccounts: { paginationCursor: null, lastSyncedAt: null },
      contacts: { paginationCursor: null, lastSyncedAt: null },
      journals: { paginationCursor: null, lastSyncedAt: null },
      bankTransactions: { paginationCursor: null, lastSyncedAt: null },
    },
    lastSyncAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    lastSyncStatus: "success",
    lastSyncError: null,
    createdAt: new Date().toISOString(),
  });

  // 3 Companies du cabinet + mappings + analyses synthétiques.
  for (const co of DEMO_COMPANIES) {
    await db.collection("companies").doc(co.companyId).set({
      ownerUserId: FIRM_UID,
      firmId: FIRM_ID,
      name: co.name,
      source: "pennylane_oauth",
      status: "active",
      externalCompanyId: co.externalCompanyId,
      createdAt: now,
      updatedAt: now,
    });

    await db.collection("connection_companies").doc(`map-${co.companyId}`).set({
      userId: FIRM_UID,
      connectionId,
      companyId: co.companyId,
      externalCompanyId: co.externalCompanyId,
      externalCompanyName: co.externalCompanyName,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.collection("analyses").doc(`demo-analysis-${co.companyId}`).set({
      userId: FIRM_UID,
      companyId: co.companyId,
      folderName: "Démo cabinet",
      fiscalYear: 2025,
      createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      sourceFiles: [],
      parsedData: [],
      rawData: {},
      mappedData: { total_prod_expl: co.ca },
      financialFacts: {},
      kpis: { ca: co.ca, tn: co.tn },
      quantisScore: {
        vyzor_score: co.vyzorScore,
        piliers: { rentabilite: co.vyzorScore, solvabilite: co.vyzorScore, liquidite: co.vyzorScore, efficacite: co.vyzorScore },
        alerte_investissement: co.vyzorScore < 50,
      },
      uploadContext: null,
    });
  }

  console.log(`✓ User firm_member créé : ${FIRM_UID} → Firm ${FIRM_ID}`);
  console.log(`✓ 3 Companies + mappings : ${DEMO_COMPANIES.map((c) => c.name).join(", ")}`);
  console.log("\n🎉 Seed démo terminé. Lance pnpm dev et connecte-toi avec :");
  console.log(`   - Dirigeant : dirigeant@demo.vyzor.fr  (uid ${OWNER_UID})`);
  console.log(`   - Cabinet   : cabinet@demo.vyzor.fr    (uid ${FIRM_UID})`);
}

seed().catch((err) => {
  console.error("\n❌ Seed échoué :", err);
  process.exit(99);
});
