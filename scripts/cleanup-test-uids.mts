// Cleanup ciblé : supprime toutes les données Firestore créées par les scripts
// smoke / idempotence. Sûr car les UIDs synthétiques (`smoke-e2e-uid-001`,
// `idem-test-uid-001`) ne correspondent à aucun compte utilisateur réel.
//
// Usage : npx tsx --env-file=.env scripts/cleanup-test-uids.mts

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const TEST_UIDS = ["smoke-e2e-uid-001", "idem-test-uid-001"];

const COLLECTIONS = [
  "connections",
  "journals",
  "ledger_accounts",
  "contacts",
  "accounting_entries",
  "invoices",
  "bank_accounts",
  "bank_transactions",
  "analyses",
];

function initAdmin() {
  if (getApps().length > 0) return;
  const projectId = process.env.FIREBASE_PROJECT_ID!;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n");
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

async function cleanupUid(userId: string): Promise<{ collection: string; deleted: number }[]> {
  const db = getFirestore();
  const report: { collection: string; deleted: number }[] = [];
  for (const c of COLLECTIONS) {
    const snap = await db.collection(c).where("userId", "==", userId).get();
    if (snap.empty) {
      report.push({ collection: c, deleted: 0 });
      continue;
    }
    // Firestore batch limit = 500 writes per commit. Pour rester sûr, on chunke.
    const docs = snap.docs;
    let deleted = 0;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += Math.min(400, docs.length - i);
    }
    report.push({ collection: c, deleted });
  }
  return report;
}

(async () => {
  initAdmin();
  console.log("Cleanup test UIDs (Firestore)\n");
  for (const uid of TEST_UIDS) {
    console.log(`uid=${uid}`);
    const report = await cleanupUid(uid);
    const total = report.reduce((s, r) => s + r.deleted, 0);
    for (const r of report) {
      if (r.deleted > 0) console.log(`  ${r.collection.padEnd(22)} ${r.deleted}`);
    }
    console.log(`  TOTAL                 ${total}`);
    console.log();
  }
  console.log("Done.");
})();
