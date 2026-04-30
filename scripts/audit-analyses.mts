// Audit read-only des analyses en Firestore : groupe par userId, compte par
// type de source (PDF static vs sync dynamique vs FEC), et résume.
//
// Usage : npx tsx --env-file=.env scripts/audit-analyses.mts

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function initAdmin() {
  if (getApps().length > 0) return;
  const projectId = process.env.FIREBASE_PROJECT_ID!;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n");
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

(async () => {
  initAdmin();
  const db = getFirestore();
  const analysesSnap = await db.collection("analyses").get();
  const connectionsSnap = await db.collection("connections").get();

  const byUser = new Map<
    string,
    { static: number; dynamic: number; fec: number; unknown: number; total: number; ca: Array<{ id: string; ca: number | null; date: string; provider: string }> }
  >();

  for (const doc of analysesSnap.docs) {
    const d = doc.data();
    const uid = String(d.userId ?? "");
    const meta = d.sourceMetadata as { type?: string; provider?: string } | undefined;
    const type =
      meta?.type === "dynamic"
        ? meta.provider === "fec"
          ? "fec"
          : "dynamic"
        : meta?.type === "static" || !meta
          ? "static"
          : "unknown";
    const provider = meta?.provider ?? "(no source)";
    const ca = (d.kpis as { ca?: number | null } | undefined)?.ca ?? null;
    const createdAt = (d.createdAt as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString().slice(0, 10) ?? "(no date)";

    const slot =
      byUser.get(uid) ?? { static: 0, dynamic: 0, fec: 0, unknown: 0, total: 0, ca: [] };
    if (type === "static") slot.static += 1;
    else if (type === "dynamic") slot.dynamic += 1;
    else if (type === "fec") slot.fec += 1;
    else slot.unknown += 1;
    slot.total += 1;
    slot.ca.push({ id: doc.id, ca, date: createdAt, provider });
    byUser.set(uid, slot);
  }

  console.log(`Total analyses : ${analysesSnap.size}\n`);
  console.log(`UID | static | dynamic | fec | unknown | total`);
  console.log(`────────────────────────────────────────────────`);
  for (const [uid, s] of [...byUser.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`${uid.slice(0, 28).padEnd(28)} | ${String(s.static).padStart(6)} | ${String(s.dynamic).padStart(7)} | ${String(s.fec).padStart(3)} | ${String(s.unknown).padStart(7)} | ${String(s.total).padStart(5)}`);
  }

  // Connexions actives par UID.
  console.log(`\n--- Connexions actives ---`);
  const byConn = new Map<string, Array<{ provider: string; status: string; createdAt: string }>>();
  for (const doc of connectionsSnap.docs) {
    const d = doc.data();
    const uid = String(d.userId ?? "");
    const slot = byConn.get(uid) ?? [];
    slot.push({
      provider: String(d.provider ?? "(none)"),
      status: String(d.status ?? "(none)"),
      createdAt: typeof d.createdAt === "string" ? d.createdAt.slice(0, 10) : "(no date)",
    });
    byConn.set(uid, slot);
  }
  for (const [uid, conns] of byConn.entries()) {
    console.log(`${uid.slice(0, 28).padEnd(28)} : ${conns.map((c) => `${c.provider}/${c.status}`).join(", ")}`);
  }

  // Détail sur le top user (probablement Antoine).
  const top = [...byUser.entries()].sort((a, b) => b[1].total - a[1].total)[0];
  if (top) {
    console.log(`\n--- Détail top user (${top[0]}) ---`);
    for (const a of top[1].ca.sort((a, b) => b.date.localeCompare(a.date))) {
      const caLabel = a.ca === null ? "N/D" : `${Math.round(a.ca / 1000)}k€`;
      console.log(`  ${a.date}  ca=${caLabel.padStart(8)}  provider=${a.provider.padEnd(10)}  ${a.id}`);
    }
  }
})();
