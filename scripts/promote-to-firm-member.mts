// Patch un user prod en firm_member + crée un Firm minimal.
// Usage : npx tsx --env-file=.env scripts/promote-to-firm-member.mts <email>
// Revert : npx tsx --env-file=.env scripts/promote-to-firm-member.mts <email> --revert

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const [, , email, flag] = process.argv;
if (!email) {
  console.error("Usage: ... <email> [--revert]");
  process.exit(1);
}
const REVERT = flag === "--revert";

const projectId = process.env.FIREBASE_PROJECT_ID!;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")!;
if (getApps().length === 0) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const db = getFirestore();
const auth = getAuth();

const FIRM_ID = "firm-dev-antoine";

async function run() {
  const user = await auth.getUserByEmail(email);
  const uid = user.uid;
  console.log(`uid=${uid}`);

  if (REVERT) {
    await db.collection("users").doc(uid).update({
      accountType: FieldValue.delete(),
      firmId: FieldValue.delete(),
    });
    await db.collection("firms").doc(FIRM_ID).delete();
    console.log("reverted");
    return;
  }

  const now = Timestamp.now();
  await db.collection("firms").doc(FIRM_ID).set({
    firmId: FIRM_ID,
    name: "Cabinet Dev Antoine",
    ownerUserId: uid,
    memberUserIds: [uid],
    createdAt: now,
    updatedAt: now,
  });
  await db.collection("users").doc(uid).set(
    { accountType: "firm_member", firmId: FIRM_ID, updatedAt: now.toDate().toISOString() },
    { merge: true }
  );
  console.log("done — refresh ton navigateur (logout/login si besoin)");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
