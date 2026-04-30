// Smoke test : POST /api/reports/financial avec une analyse persistée pour
// le user "smoke-e2e-uid-001" (créé par scripts/smoke-e2e.mts). Récupère le
// PDF binaire et le sauvegarde dans /tmp/rapport-financier-smoke.pdf.
//
// Usage : APP_BASE_URL=http://localhost:3000 npx tsx --env-file=.env scripts/smoke-financial-report.mts

import { writeFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const TEST_UID = process.env.SMOKE_UID || "smoke-e2e-uid-001";
const APP_BASE = process.env.APP_BASE_URL || "http://localhost:3000";

function initAdmin() {
  if (getApps().length > 0) return;
  const projectId = process.env.FIREBASE_PROJECT_ID!;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n");
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
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
  const data = (await res.json()) as { idToken: string };
  return data.idToken;
}

(async () => {
  initAdmin();
  const db = getFirestore();
  const snap = await db.collection("analyses").where("userId", "==", TEST_UID).get();
  if (snap.empty) {
    console.error(`No analysis for uid=${TEST_UID}. Run scripts/smoke-e2e.mts first.`);
    process.exit(2);
  }
  // Tri en mémoire pour éviter d'avoir à créer un index composite Firestore
  // juste pour ce smoke test.
  const docs = snap.docs.slice().sort((a, b) => {
    const aTs = (a.get("createdAt") as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date(0);
    const bTs = (b.get("createdAt") as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date(0);
    return bTs.getTime() - aTs.getTime();
  });
  const analysisId = docs[0]!.id;
  console.log(`[1/3] analysisId=${analysisId}`);

  const idToken = await getIdToken(TEST_UID);
  console.log(`[2/3] minted ID token (${idToken.length} chars)`);

  const res = await fetch(`${APP_BASE}/api/reports/financial`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ analysisId }),
  });
  console.log(`[3/3] status=${res.status} content-type=${res.headers.get("content-type")} content-length=${res.headers.get("content-length")}`);
  if (!res.ok) {
    const text = await res.text();
    console.error("err:", text.slice(0, 500));
    process.exit(3);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const out = "/tmp/rapport-financier-smoke.pdf";
  writeFileSync(out, buffer);
  const head = buffer.slice(0, 5).toString("ascii");
  console.log(`  → wrote ${buffer.length} bytes to ${out} (header="${head}")`);
})();
