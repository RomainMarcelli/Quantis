// Mock 3 dossiers + analyses pour ma firm en prod, pour visualiser le portefeuille.
// Usage   : npx tsx --env-file=.env scripts/mock-firm-dossiers.mts
// Revert  : npx tsx --env-file=.env scripts/mock-firm-dossiers.mts --revert

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID!;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")!;
if (getApps().length === 0) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const db = getFirestore();

const UID = "2ZwWKFTuynU40HXjRV3FZY4I2pj2";
const FIRM_ID = "firm-dev-antoine";
const CONNECTION_ID = "mock-conn-firm-001";

const DOSSIERS = [
  { companyId: "mock-co-001", name: "Boulangerie Martin",      ext: "pl-martin-001", ca: 180_000, tn:  42_000, score: 72 },
  { companyId: "mock-co-002", name: "SARL Dupuis Plomberie",   ext: "pl-dupuis-001", ca: 320_000, tn:  -8_000, score: 41 },
  { companyId: "mock-co-003", name: "Cabinet Médical Leroy",   ext: "pl-leroy-001",  ca: 610_000, tn: 125_000, score: 88 },
];

const REVERT = process.argv.includes("--revert");

async function revert() {
  const colls = ["companies", "connection_companies", "connections", "analyses"];
  let count = 0;
  for (const c of colls) {
    const snap = await db.collection(c).where("__name__", ">=", "mock-").where("__name__", "<", "mock-~").get().catch(() => null);
    // Fallback : query by champ marker mock=true (plus fiable que prefix sur __name__).
    const snap2 = await db.collection(c).where("mock", "==", true).get();
    for (const d of snap2.docs) { await d.ref.delete(); count++; }
  }
  console.log(`reverted ${count} docs`);
}

async function seed() {
  const now = Timestamp.now();

  // 1) Connection mock
  await db.collection("connections").doc(CONNECTION_ID).set({
    id: CONNECTION_ID,
    userId: UID,
    firmId: FIRM_ID,
    provider: "pennylane",
    kind: "firm_oauth",
    status: "connected",
    lastSyncAt: new Date().toISOString(),
    lastSyncStatus: "success",
    createdAt: now,
    updatedAt: now,
    mock: true,
  });

  for (const d of DOSSIERS) {
    // Company
    await db.collection("companies").doc(d.companyId).set({
      id: d.companyId,
      ownerUserId: UID,
      firmId: FIRM_ID,
      name: d.name,
      externalCompanyId: d.ext,
      source: "pennylane_oauth",
      status: "active",
      createdAt: now,
      updatedAt: now,
      mock: true,
    });

    // Mapping
    const mappingId = `mock-map-${d.companyId}`;
    await db.collection("connection_companies").doc(mappingId).set({
      userId: UID,
      connectionId: CONNECTION_ID,
      companyId: d.companyId,
      externalCompanyId: d.ext,
      externalCompanyName: d.name,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      mock: true,
    });

    // Analyse (pour les KPIs synthétiques du portefeuille)
    const analysisId = `mock-an-${d.companyId}`;
    await db.collection("analyses").doc(analysisId).set({
      id: analysisId,
      userId: UID,
      companyId: d.companyId,
      createdAt: new Date().toISOString(),
      kpis: { ca: d.ca, tn: d.tn },
      quantisScore: { vyzor_score: d.score },
      mock: true,
    });
  }

  console.log(`seeded ${DOSSIERS.length} dossiers + 1 connection sur firm ${FIRM_ID}`);
}

await (REVERT ? revert() : seed());
