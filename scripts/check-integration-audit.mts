// File: scripts/check-integration-audit.mts
// Role: lit la collection Firestore `integration_api_audit` via l'Admin SDK
// (bypass des rules — read/write sont fermés au client) et affiche les N
// derniers événements pour un provider donné. Permet aux ops de valider
// que le logging d'API tierces tourne réellement après un sync, sans avoir
// à ouvrir la Firebase Console.
//
// Usage :
//   npx tsx --env-file=.env scripts/check-integration-audit.mts
//   npx tsx --env-file=.env scripts/check-integration-audit.mts --provider=pennylane --limit=50
//   npx tsx --env-file=.env scripts/check-integration-audit.mts --userId=<uid> --limit=10
//
// CLI :
//   --provider=<name>    "myunisoft" (défaut) | "pennylane" | "bridge" | "odoo" | "fec"
//   --limit=<n>          nombre d'événements à afficher (défaut 20, max 200)
//   --userId=<uid>       filtre sur un utilisateur précis (optionnel)
//   --only-errors        n'affiche que les events ok=false
//
// Variables d'env requises (cf. .env / .env.example) :
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY
//
// Sortie : tableau aligné en colonnes (timestamp · status · ms · endpoint ·
// userId · errorMessage tronqué). Codes ANSI pour repérer rapidement les
// échecs (rouge) et les succès (vert).

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const PROVIDERS = ["myunisoft", "pennylane", "bridge", "odoo", "fec"] as const;
type Provider = (typeof PROVIDERS)[number];

type CliArgs = {
  provider: Provider;
  limit: number;
  userId: string | null;
  onlyErrors: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    provider: "myunisoft",
    limit: 20,
    userId: null,
    onlyErrors: false,
  };
  for (const arg of argv) {
    if (arg === "--only-errors") {
      args.onlyErrors = true;
      continue;
    }
    const match = /^--([a-zA-Z-]+)=(.*)$/.exec(arg);
    if (!match) continue;
    const [, key, value] = match;
    switch (key) {
      case "provider":
        if (!PROVIDERS.includes(value as Provider)) {
          throw new Error(
            `--provider="${value}" invalide. Valeurs : ${PROVIDERS.join(", ")}`
          );
        }
        args.provider = value as Provider;
        break;
      case "limit": {
        const n = Number.parseInt(value, 10);
        if (!Number.isFinite(n) || n < 1 || n > 200) {
          throw new Error(`--limit doit être entre 1 et 200 (reçu "${value}")`);
        }
        args.limit = n;
        break;
      }
      case "userId":
        args.userId = value || null;
        break;
      default:
        // option inconnue — silent ignore pour rester forward-compatible
        break;
    }
  }
  return args;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variable d'env ${name} manquante. Renseigne-la dans .env (cf. .env.example).`
    );
  }
  return value;
}

function initAdmin() {
  if (getApps().length > 0) return;
  initializeApp({
    credential: cert({
      projectId: getRequiredEnv("FIREBASE_PROJECT_ID"),
      clientEmail: getRequiredEnv("FIREBASE_CLIENT_EMAIL"),
      privateKey: getRequiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
}

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function fmtTimestamp(ts: unknown): string {
  if (ts instanceof Timestamp) {
    return ts.toDate().toISOString().replace("T", " ").slice(0, 19);
  }
  return "?";
}

function fmtStatus(status: number, ok: boolean): string {
  const color = ok ? ANSI.green : status === -1 ? ANSI.yellow : ANSI.red;
  return `${color}${String(status).padStart(4)}${ANSI.reset}`;
}

function fmtDuration(ms: number): string {
  return `${String(ms).padStart(5)} ms`;
}

function truncate(value: string | null | undefined, max: number): string {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

type AuditDoc = {
  provider?: string;
  endpoint?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  userId?: string | null;
  ok?: boolean;
  errorMessage?: string | null;
  createdAt?: unknown;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  initAdmin();
  const firestore = getFirestore();

  let query = firestore
    .collection("integration_api_audit")
    .where("provider", "==", args.provider)
    .orderBy("createdAt", "desc")
    .limit(args.limit);

  if (args.userId) {
    query = firestore
      .collection("integration_api_audit")
      .where("provider", "==", args.provider)
      .where("userId", "==", args.userId)
      .orderBy("createdAt", "desc")
      .limit(args.limit);
  }

  console.log(
    `${ANSI.bold}▶ integration_api_audit${ANSI.reset} · provider=${ANSI.cyan}${args.provider}${ANSI.reset} · limit=${args.limit}${
      args.userId ? ` · userId=${args.userId}` : ""
    }${args.onlyErrors ? " · only-errors" : ""}`
  );

  const snap = await query.get();
  if (snap.empty) {
    console.log(`${ANSI.yellow}Aucun événement trouvé.${ANSI.reset}`);
    console.log(
      `${ANSI.dim}Vérifications possibles :${ANSI.reset}`
    );
    console.log(`  - aucun sync n'a encore tourné pour ce provider/utilisateur`);
    console.log(`  - le code de logging n'est pas branché (cf. client adapter)`);
    console.log(`  - les credentials Admin SDK pointent sur le mauvais projet`);
    process.exit(0);
  }

  const rows = snap.docs.map((doc) => doc.data() as AuditDoc);
  const filtered = args.onlyErrors ? rows.filter((r) => r.ok === false) : rows;
  const successCount = rows.filter((r) => r.ok === true).length;
  const errorCount = rows.filter((r) => r.ok === false).length;

  console.log(
    `${ANSI.dim}${rows.length} événement(s) · ${ANSI.green}${successCount} OK${ANSI.reset}${ANSI.dim} · ${ANSI.red}${errorCount} ERR${ANSI.reset}\n`
  );

  // En-tête
  console.log(
    `${ANSI.dim}${"timestamp".padEnd(19)}  ${"meth".padEnd(4)}  ${"stat".padEnd(4)}  ${"durée".padEnd(8)}  ${"endpoint".padEnd(28)}  ${"userId".padEnd(20)}  message${ANSI.reset}`
  );
  console.log(`${ANSI.dim}${"─".repeat(120)}${ANSI.reset}`);

  for (const row of filtered) {
    const ts = fmtTimestamp(row.createdAt);
    const method = (row.method ?? "?").padEnd(4);
    const status = fmtStatus(row.status ?? 0, row.ok ?? false);
    const duration = fmtDuration(row.durationMs ?? 0);
    const endpoint = truncate(row.endpoint, 28).padEnd(28);
    const userId = truncate(row.userId ?? "—", 20).padEnd(20);
    const message = row.errorMessage ? `${ANSI.red}${truncate(row.errorMessage, 50)}${ANSI.reset}` : "";
    console.log(`${ts}  ${method}  ${status}  ${duration}  ${endpoint}  ${userId}  ${message}`);
  }

  if (args.onlyErrors && filtered.length === 0) {
    console.log(`\n${ANSI.green}✓ Aucune erreur dans les ${rows.length} derniers événements.${ANSI.reset}`);
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n${ANSI.red}❌ Échec :${ANSI.reset} ${message}`);
  // Détecte les erreurs d'index manquant (Firestore 9 FAILED_PRECONDITION)
  // et donne le diagnostic + la commande de déploiement.
  if (/FAILED_PRECONDITION.*index/i.test(message)) {
    console.error(
      `\n${ANSI.yellow}→ Index Firestore manquant.${ANSI.reset} Deux options :`
    );
    console.error(
      `  1. Suivre le lien ci-dessus pour le créer en un clic via la Console.`
    );
    console.error(
      `  2. Déployer firestore.indexes.json :  ${ANSI.cyan}firebase deploy --only firestore:indexes${ANSI.reset}`
    );
  }
  process.exit(1);
});
