#!/usr/bin/env node
/**
 * Vérifie toutes les connexions Quantis sans consommer de crédits.
 * Usage : node scripts/test-connections.mjs
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createSign } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── Charger .env ─────────────────────────────────────────────────────────────

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Retirer les guillemets englobants
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

// Charger dans l'ordre de priorité (local > base)
loadEnvFile(join(ROOT, ".env.local"));
loadEnvFile(join(ROOT, ".env"));

// ─── Helpers affichage ───────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function section(title) {
  console.log(`\n${C.bold}${C.cyan}${"─".repeat(62)}${C.reset}`);
  console.log(`${C.bold}  ${title}${C.reset}`);
  console.log(`${C.cyan}${"─".repeat(62)}${C.reset}`);
}

function row(label, status, detail = "") {
  const icon =
    status === true
      ? `${C.green}✅${C.reset}`
      : status === false
      ? `${C.red}❌${C.reset}`
      : `${C.yellow}⚠️ ${C.reset}`;
  const det = detail ? `  ${C.dim}${detail}${C.reset}` : "";
  console.log(`  ${icon}  ${label}${det}`);
}

function preview(val) {
  if (!val) return "(vide)";
  const s = String(val);
  return `(${s.slice(0, 24)}${s.length > 24 ? "…" : ""})`;
}

// ─── 1. Variables d'environnement ────────────────────────────────────────────

section("1 / Variables d'environnement");

const REQUIRED = [
  // Firebase Client SDK
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  // Firebase Admin SDK
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  // Anthropic
  "ANTHROPIC_API_KEY",
  // App
  "APP_BASE_URL",
  "CRON_SECRET",
];

const OPTIONAL = [
  "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
  "DOCUMENT_AI_PROJECT_ID",
  "DOCUMENT_AI_LOCATION",
  "DOCUMENT_AI_PROCESSOR_ID",
  "DOCUMENT_AI_CLIENT_EMAIL",
  "DOCUMENT_AI_PRIVATE_KEY",
];

let allRequiredOk = true;
for (const v of REQUIRED) {
  const val = process.env[v];
  const ok = Boolean(val);
  if (!ok) allRequiredOk = false;
  row(v, ok, ok ? preview(val) : "MANQUANTE");
}

console.log(`\n  ${C.dim}Optionnelles :${C.reset}`);
for (const v of OPTIONAL) {
  const val = process.env[v];
  row(v, val ? true : null, val ? preview(val) : "absent (optionnel)");
}

// ─── 2. Firebase Firestore ───────────────────────────────────────────────────

section("2 / Firebase Firestore — Admin SDK (lecture seule)");

async function testFirebase() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    row("Credentials Admin", false, "Variables FIREBASE_* manquantes");
    return;
  }

  try {
    const { initializeApp, cert, getApps, getApp } = await import(
      "firebase-admin/app"
    );
    const { getFirestore } = await import("firebase-admin/firestore");

    const app =
      getApps().length === 0
        ? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
        : getApp();

    const db = getFirestore(app);

    // Lecture d'un document dans la collection principale (sans écriture)
    const snap = await db.collection("analyses").limit(1).get();
    row(
      "Connexion Firestore",
      true,
      `collection 'analyses' — ${snap.size} doc(s) accessible(s)`
    );
  } catch (err) {
    row("Connexion Firestore", false, err.message.slice(0, 120));
  }
}

await testFirebase();

// ─── 3. Anthropic API ────────────────────────────────────────────────────────

section("3 / Anthropic API — GET /v1/models (gratuit, 0 crédit)");

async function testAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    row("ANTHROPIC_API_KEY", false, "Variable absente");
    return;
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });

    if (res.ok) {
      const data = await res.json();
      const models = (data.data ?? []).map((m) => m.id);
      row("Clé API Anthropic valide", true, `${models.length} modèles listés`);

      const relevant = models.filter(
        (m) => m.includes("haiku") || m.includes("sonnet") || m.includes("opus")
      );
      if (relevant.length > 0) {
        console.log(
          `     ${C.dim}Modèles : ${relevant.slice(0, 5).join(", ")}${C.reset}`
        );
      }

      // Vérifier que les modèles utilisés par le projet sont disponibles
      const USED_MODELS = ["claude-haiku-4-5-20251001", "claude-sonnet-4-6"];
      for (const m of USED_MODELS) {
        const found = models.includes(m);
        row(`  Modèle projet ${m}`, found, found ? "" : "non trouvé dans la liste");
      }
    } else {
      const body = await res.text();
      row(
        "Clé API Anthropic",
        false,
        `HTTP ${res.status} — ${body.slice(0, 100)}`
      );
    }
  } catch (err) {
    row("Anthropic API", false, err.message);
  }
}

await testAnthropic();

// ─── 4. Google Cloud credentials ─────────────────────────────────────────────

section("4 / Google Cloud — Service Account (auth token, 0 crédit)");

async function testGoogleCloud() {
  // Préférer les credentials Document AI dédiés, sinon utiliser ceux Firebase
  const clientEmail =
    process.env.DOCUMENT_AI_CLIENT_EMAIL ||
    process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw =
    process.env.DOCUMENT_AI_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY;
  const privateKey = privateKeyRaw?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    row(
      "Service account",
      false,
      "FIREBASE_CLIENT_EMAIL / DOCUMENT_AI_CLIENT_EMAIL absents"
    );
    return;
  }

  const source =
    process.env.DOCUMENT_AI_CLIENT_EMAIL
      ? "DOCUMENT_AI_CLIENT_EMAIL"
      : "FIREBASE_CLIENT_EMAIL (fallback)";
  row("Service account", true, `${clientEmail}  [${source}]`);

  try {
    // Construire un JWT signé RS256
    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    };
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT" })
    ).toString("base64url");
    const body = Buffer.from(JSON.stringify(jwtPayload)).toString("base64url");
    const sigInput = `${header}.${body}`;

    const sign = createSign("SHA256");
    sign.update(sigInput);
    const signature = sign.sign(privateKey, "base64url");
    const jwt = `${sigInput}.${signature}`;

    // Échanger le JWT contre un access token OAuth2
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      row(
        "OAuth2 token",
        false,
        `HTTP ${tokenRes.status} — ${errBody.slice(0, 120)}`
      );
      return;
    }

    const tokenData = await tokenRes.json();
    row(
      "OAuth2 access token",
      true,
      `obtenu — expires_in: ${tokenData.expires_in}s`
    );

    // Vérifier le processor Document AI si les variables sont configurées
    const docAiProject = process.env.DOCUMENT_AI_PROJECT_ID;
    const docAiLocation = process.env.DOCUMENT_AI_LOCATION;
    const docAiProcessor = process.env.DOCUMENT_AI_PROCESSOR_ID;

    if (docAiProject && docAiLocation && docAiProcessor) {
      const processorUrl = `https://${docAiLocation}-documentai.googleapis.com/v1/projects/${docAiProject}/locations/${docAiLocation}/processors/${docAiProcessor}`;
      const procRes = await fetch(processorUrl, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (procRes.ok) {
        const proc = await procRes.json();
        row(
          "Document AI processor",
          true,
          `${proc.displayName ?? docAiProcessor} — état: ${proc.state ?? "OK"}`
        );
      } else {
        row(
          "Document AI processor",
          false,
          `HTTP ${procRes.status} — vérifier DOCUMENT_AI_PROJECT_ID / PROCESSOR_ID`
        );
      }
    } else {
      row(
        "Document AI vars",
        null,
        "DOCUMENT_AI_PROJECT/LOCATION/PROCESSOR_ID absents → pipeline V1 inactif"
      );
    }
  } catch (err) {
    row("Google Cloud auth", false, err.message.slice(0, 120));
  }
}

await testGoogleCloud();

// ─── Résumé ───────────────────────────────────────────────────────────────────

section("Résumé");
if (allRequiredOk) {
  console.log(
    `  ${C.green}✅  Toutes les variables requises sont présentes.${C.reset}`
  );
} else {
  console.log(
    `  ${C.red}❌  Certaines variables requises sont MANQUANTES — voir section 1.${C.reset}`
  );
}
console.log();
