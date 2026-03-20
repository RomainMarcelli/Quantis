// lib/server/firebaseAdmin.ts
// Centralise l'initialisation Firebase Admin pour generer des liens d'action securises cote serveur.
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

type RequiredServerEnvName = "FIREBASE_PROJECT_ID" | "FIREBASE_CLIENT_EMAIL" | "FIREBASE_PRIVATE_KEY";

let cachedAdminApp: App | null = null;

export function getFirebaseAdminAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}

function getFirebaseAdminApp(): App {
  if (cachedAdminApp) {
    return cachedAdminApp;
  }

  const existingApp = getApps()[0];
  if (existingApp) {
    cachedAdminApp = existingApp;
    return existingApp;
  }

  const projectId = getRequiredServerEnv("FIREBASE_PROJECT_ID");
  const clientEmail = getRequiredServerEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = getRequiredServerEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");

  cachedAdminApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey
    })
  });

  return cachedAdminApp;
}

function getRequiredServerEnv(name: RequiredServerEnvName): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      "Firebase Admin env missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY."
    );
  }
  return value;
}
