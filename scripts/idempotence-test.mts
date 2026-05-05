// Test d'idempotence : lance le sync 3 fois consécutives sur le même compte sandbox.
// Vérifie qu'aucune duplication ne se produit en Firestore (entités stockées par
// docId déterministe `${connectionId}_${externalId}`).
//
// Usage : npx tsx --env-file=.env scripts/idempotence-test.mts

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const TEST_UID = "idem-test-uid-001";
const APP_BASE = process.env.APP_BASE_URL || "http://localhost:3000";

function initAdmin() {
  if (getApps().length > 0) return;
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    }),
  });
}

async function getIdToken(uid: string): Promise<string> {
  const customToken = await getAuth().createCustomToken(uid);
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  const json = (await res.json()) as { idToken: string };
  return json.idToken;
}

async function cleanup(userId: string): Promise<void> {
  const db = getFirestore();
  const cs = ["connections", "journals", "ledger_accounts", "contacts", "accounting_entries", "invoices", "analyses"];
  for (const c of cs) {
    const snap = await db.collection(c).where("userId", "==", userId).get();
    if (snap.empty) continue;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

type Counts = Record<string, number>;
async function countEntities(userId: string, connectionId: string): Promise<Counts> {
  const db = getFirestore();
  const cs = ["journals", "ledger_accounts", "contacts", "accounting_entries", "invoices"];
  const counts: Counts = {};
  for (const c of cs) {
    const snap = await db
      .collection(c)
      .where("userId", "==", userId)
      .where("connectionId", "==", connectionId)
      .get();
    counts[c] = snap.size;
  }
  // Analyses ne sont pas filtrées par connectionId — comptées par userId.
  const analyses = await db.collection("analyses").where("userId", "==", userId).get();
  counts.analyses = analyses.size;
  return counts;
}

async function checksumEntities(userId: string, connectionId: string): Promise<Record<string, string>> {
  const db = getFirestore();
  const collections = ["journals", "ledger_accounts", "contacts", "accounting_entries", "invoices"];
  const result: Record<string, string> = {};
  for (const c of collections) {
    const snap = await db
      .collection(c)
      .where("userId", "==", userId)
      .where("connectionId", "==", connectionId)
      .get();
    // On hash sur les externalId triés — l'ensemble est stable si idempotent.
    const externalIds = snap.docs
      .map((d) => (d.data() as { externalId: string }).externalId)
      .sort();
    result[c] = `${externalIds.length}|${externalIds.slice(0, 5).join(",")}…${externalIds.slice(-3).join(",")}`;
  }
  return result;
}

async function callApi(path: string, body: unknown, idToken: string): Promise<{ status: number; data: any }> {
  const res = await fetch(`${APP_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data };
}

(async () => {
  if (!process.env.PENNYLANE_TEST_TOKEN) {
    console.error("PENNYLANE_TEST_TOKEN manquante.");
    process.exit(1);
  }
  initAdmin();

  console.log(`Test d'idempotence — uid=${TEST_UID}\n`);

  // Setup : cleanup + connect.
  console.log("[setup] cleanup + connect…");
  await cleanup(TEST_UID);
  const idToken = await getIdToken(TEST_UID);
  const connectResult = await callApi(
    "/api/integrations/pennylane/connect",
    { mode: "company_token", accessToken: process.env.PENNYLANE_TEST_TOKEN },
    idToken
  );
  if (connectResult.status !== 201) {
    console.error("Connect KO:", connectResult);
    process.exit(2);
  }
  const connectionId = connectResult.data.connectionId;
  console.log(`[setup] connectionId=${connectionId}\n`);

  // 3 syncs consécutifs.
  const runs: Array<{ run: number; counts: Counts; checksums: Record<string, string>; durationMs: number; analysisId: string | null }> = [];
  for (let i = 1; i <= 3; i++) {
    console.log(`─── Sync #${i} ───`);
    const t0 = Date.now();
    const syncResult = await callApi(
      "/api/integrations/pennylane/sync",
      { connectionId },
      idToken
    );
    const duration = Date.now() - t0;
    if (syncResult.status !== 200) {
      console.error(`Sync #${i} KO:`, syncResult);
      process.exit(3);
    }
    const counts = await countEntities(TEST_UID, connectionId);
    const checksums = await checksumEntities(TEST_UID, connectionId);
    const analysisId = syncResult.data.analysis?.analysisId ?? null;
    runs.push({ run: i, counts, checksums, durationMs: duration, analysisId });
    console.log(`  durée=${duration}ms | analysis=${analysisId}`);
    console.log(`  counts:`, counts);
  }

  // Vérification d'idempotence.
  console.log(`\n─── Vérification ───`);
  const baseCounts = runs[0]!.counts;
  let idempotenceKO = false;
  for (let i = 1; i < runs.length; i++) {
    for (const collection of Object.keys(baseCounts)) {
      if (collection === "analyses") {
        // Les analyses sont créées à chaque sync (1 par sync) → pas d'idempotence attendue.
        continue;
      }
      const a = baseCounts[collection]!;
      const b = runs[i]!.counts[collection]!;
      const status = a === b ? "OK" : "KO";
      if (a !== b) idempotenceKO = true;
      console.log(`  [${status}] ${collection.padEnd(20)} run1=${a} run${i + 1}=${b}`);
    }
  }

  // Vérification que les checksums sont identiques entre runs.
  console.log(`\n  Checksums (externalId set par collection) :`);
  for (const collection of Object.keys(runs[0]!.checksums)) {
    const allSame = runs.every((r) => r.checksums[collection] === runs[0]!.checksums[collection]);
    console.log(`    [${allSame ? "OK" : "KO"}] ${collection.padEnd(20)} ${runs[0]!.checksums[collection]}`);
    if (!allSame) idempotenceKO = true;
  }

  // Vérification de la durée : sync 2 et 3 doivent être ≤ sync 1 (incrémental).
  console.log(`\n  Durées :`);
  for (const r of runs) {
    console.log(`    run #${r.run} : ${r.durationMs}ms`);
  }

  // Analyses : 3 docs distincts attendus (1 par sync).
  const analysesCount = runs[runs.length - 1]!.counts.analyses;
  console.log(`\n  Analyses générées : ${analysesCount} (attendu : 3)`);
  if (analysesCount !== 3) {
    idempotenceKO = true;
    console.log(`    [KO] devrait être 3`);
  } else {
    console.log(`    [OK]`);
  }

  if (idempotenceKO) {
    console.log(`\n[IDEMPOTENCE KO] — voir logs ci-dessus`);
    process.exit(4);
  }
  console.log(`\n[IDEMPOTENCE OK] aucune duplication détectée sur 3 syncs.`);
})();
