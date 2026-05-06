// Cherche dans Firestore toutes les analyses qui pourraient être des versions
// passées du PDF SORETOLE. On scanne par :
//   - nom de fichier (parsedData[0].fileName ou fileName racine contenant "soretole")
//   - kpis.ca dans la fourchette ~24M€ (20M-30M)

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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
  const snap = await db.collection("analyses").get();

  console.log(`Total analyses scannées : ${snap.size}\n`);

  type Hit = {
    id: string;
    userId: string;
    createdAt: string;
    fileName: string;
    parserVersion: string;
    ca: number | null;
    matchReason: string;
  };
  const hits: Hit[] = [];

  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const userId = String(d.userId ?? "");
    const parsed = d.parsedData as Record<string, unknown> | undefined;
    const first = parsed?.["0"] as Record<string, unknown> | undefined;
    const fileName = String(first?.fileName ?? d.fileName ?? "");
    const kpis = d.kpis as Record<string, unknown> | undefined;
    const ca = (kpis?.ca as number | null | undefined) ?? null;
    const createdAt =
      (d.createdAt as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString() ?? "(no date)";
    const parserVersion = String(d.parserVersion ?? first?.parserVersion ?? "(none)");

    const reasons: string[] = [];
    if (/soretole/i.test(fileName)) reasons.push("filename:soretole");
    if (typeof ca === "number" && ca >= 20_000_000 && ca <= 30_000_000) reasons.push(`ca~24M(=${ca})`);

    if (reasons.length > 0) {
      hits.push({
        id: doc.id,
        userId,
        createdAt,
        fileName,
        parserVersion,
        ca,
        matchReason: reasons.join(","),
      });
    }
  }

  console.log(`Hits : ${hits.length}\n`);
  hits.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const h of hits) {
    console.log(`  ${h.createdAt}  uid=${h.userId.slice(0, 14)}…  parser=${h.parserVersion}`);
    console.log(`    id=${h.id}`);
    console.log(`    file=${h.fileName.slice(0, 80)}`);
    console.log(`    ca=${h.ca}  reason=${h.matchReason}`);
    console.log();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
