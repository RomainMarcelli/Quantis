// Suppression ciblée d'une analyse Firestore par id, avec vérification du
// userId attendu pour éviter de toucher à l'analyse d'un autre utilisateur.
//
// Usage : npx tsx --env-file=.env scripts/delete-analysis.mts <analysisId> <expectedUserId>

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const [analysisId, expectedUserId] = process.argv.slice(2);
if (!analysisId || !expectedUserId) {
  console.error("Usage : delete-analysis.mts <analysisId> <expectedUserId>");
  process.exit(1);
}

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
  const ref = db.collection("analyses").doc(analysisId);
  const snap = await ref.get();

  if (!snap.exists) {
    console.log(`analyses/${analysisId} : déjà absente.`);
    return;
  }

  const data = snap.data() as Record<string, unknown>;
  const actualUserId = String(data.userId ?? "");
  if (actualUserId !== expectedUserId) {
    console.error(
      `Refus : userId=${actualUserId} ≠ expected=${expectedUserId}. Aucune suppression.`
    );
    process.exit(2);
  }

  const meta = data.sourceMetadata as { provider?: string; type?: string } | undefined;
  const kpis = data.kpis as { ca?: number | null } | undefined;
  console.log(`Suppression de analyses/${analysisId}`);
  console.log(`  userId   : ${actualUserId}`);
  console.log(`  provider : ${meta?.provider ?? "(none)"}`);
  console.log(`  type     : ${meta?.type ?? "(none)"}`);
  console.log(`  ca       : ${kpis?.ca ?? "(null)"}`);

  await ref.delete();
  console.log("OK.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
