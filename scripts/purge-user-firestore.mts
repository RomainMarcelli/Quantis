// Purge Firestore complète pour un user donné — analyses, connexions, et toutes
// les entités comptables synchronisées (journals/ledger_accounts/contacts/
// accounting_entries/invoices/bank_*). Filtrage strict par `userId` pour ne
// pas toucher aux autres utilisateurs.
//
// Le token Pennylane (chiffré dans `connections`) est supprimé avec la
// connexion. La sandbox Pennylane elle-même n'est PAS touchée — on supprime
// uniquement notre miroir Firestore.
//
// Usage : npx tsx --env-file=.env scripts/purge-user-firestore.mts <userId> --apply

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const [, , userId, ...flags] = process.argv;
const apply = flags.includes("--apply");
if (!userId) {
  console.error("Usage : purge-user-firestore.mts <userId> [--apply]");
  process.exit(1);
}

const COLLECTIONS = [
  "analyses",
  "connections",
  "journals",
  "ledger_accounts",
  "contacts",
  "accounting_entries",
  "invoices",
  "bank_accounts",
  "bank_transactions",
] as const;

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

(async () => {
  initAdmin();
  const db = getFirestore();

  console.log("=".repeat(70));
  console.log(`Purge Firestore — userId=${userId}`);
  console.log(`Mode : ${apply ? "APPLY (destructif)" : "DRY-RUN"}`);
  console.log("=".repeat(70));
  console.log();

  let grandTotal = 0;
  for (const c of COLLECTIONS) {
    const snap = await db.collection(c).where("userId", "==", userId).get();
    console.log(`${c.padEnd(22)} ${String(snap.size).padStart(5)} doc(s)`);
    grandTotal += snap.size;

    if (!apply || snap.empty) continue;

    // Firestore batch limit = 500 writes par commit. 400 par sécurité.
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  console.log("─".repeat(40));
  console.log(`${"TOTAL".padEnd(22)} ${String(grandTotal).padStart(5)} doc(s)`);
  if (apply) console.log("\n✓ Suppression effectuée.");
  else console.log("\nDRY-RUN terminé. Relancer avec --apply pour supprimer.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
