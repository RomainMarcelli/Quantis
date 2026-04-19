// Supprime tous les documents des collections analyses et security_audit_logs.
// Usage : npx tsx scripts/clear-firestore.mjs
// Charge les variables d'environnement depuis .env.local

import { readFileSync } from "fs";

for (const envFile of [".env", ".env.local"]) {
  try {
    for (const line of readFileSync(envFile, "utf-8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[k] = v;
    }
  } catch {}
}

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function initAdmin() {
  if (getApps().length > 0) return getFirestore(getApps()[0]);

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Variables FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY manquantes dans .env.local");
  }

  const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return getFirestore(app);
}

async function clearCollection(db, collectionName) {
  const snapshot = await db.collection(collectionName).get();
  if (snapshot.size === 0) {
    console.log(`⚪ ${collectionName} — vide (0 documents)`);
    return;
  }
  const batchSize = 500;
  for (let i = 0; i < snapshot.docs.length; i += batchSize) {
    const batch = db.batch();
    snapshot.docs.slice(i, i + batchSize).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
  console.log(`✅ ${snapshot.size} documents supprimés dans ${collectionName}`);
}

async function main() {
  const db = initAdmin();
  await clearCollection(db, "analyses");
  await clearCollection(db, "security_audit_logs");
  console.log("✅ Nettoyage terminé");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Erreur:", err.message);
  process.exit(1);
});
