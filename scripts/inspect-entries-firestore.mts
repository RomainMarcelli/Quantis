// File: scripts/inspect-entries-firestore.mts
// Role: compte les entries persistées dans la collection accounting_entries
// pour un connectionId donné, et vérifie l'existence d'autres entités
// (journals, ledger_accounts, contacts). Permet de localiser une rupture
// de persistance lors d'un sync.

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

type Args = { connectionId: string | null };

function parseArgs(argv: string[]): Args {
  const args: Args = { connectionId: null };
  for (const arg of argv) {
    const m = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (m && m[1] === "connectionId") args.connectionId = m[2];
  }
  return args;
}

function envOrDie(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} manquant.`);
  return v;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.connectionId) {
    console.error("--connectionId=<id> requis. Récupère-le depuis le doc analysis (sourceMetadata.connectionId).");
    process.exit(1);
  }
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: envOrDie("FIREBASE_PROJECT_ID"),
        clientEmail: envOrDie("FIREBASE_CLIENT_EMAIL"),
        privateKey: envOrDie("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
      }),
    });
  }
  const db = getFirestore();

  console.log(`▶ Inspection entités persistées pour connectionId=${args.connectionId}\n`);

  const collections = [
    "journals",
    "ledger_accounts",
    "contacts",
    "accounting_entries",
    "invoices",
  ];

  for (const col of collections) {
    const snap = await db.collection(col).where("connectionId", "==", args.connectionId).limit(1000).get();
    console.log(`  ${col.padEnd(22)} : ${snap.size} document(s)`);
    if (col === "accounting_entries" && snap.size > 0) {
      const sample = snap.docs[0]?.data();
      const lines = (sample?.lines as Array<unknown> | undefined) ?? [];
      console.log(`    └─ exemple : externalId=${sample?.externalId}, date=${sample?.date}, lines=${lines.length}, totalCredit=${sample?.totalCredit}, totalDebit=${sample?.totalDebit}`);
      // Distribution des account numbers (3 premiers chiffres) sur 100 docs max
      const counts = new Map<string, number>();
      for (const doc of snap.docs.slice(0, 200)) {
        const data = doc.data();
        for (const line of (data.lines ?? []) as Array<{ accountNumber?: string }>) {
          const p = (line.accountNumber ?? "").slice(0, 3);
          if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
        }
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      console.log(`    └─ top 10 préfixes (200 entries échant.) : ${top.map(([p, n]) => `${p}=${n}`).join(", ")}`);
    }
  }
})().catch((err) => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
