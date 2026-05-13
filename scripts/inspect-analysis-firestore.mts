// File: scripts/inspect-analysis-firestore.mts
// Role: lit les derniers documents `analyses` créés pour un userId donné via
// l'Admin SDK et dump les KPIs persistés. Permet de comparer avec ce que
// le pipeline backend calcule en mémoire (cf. diagnose-myunisoft-pipeline.mts)
// pour isoler où les valeurs se perdent : persistance Firestore vs lecture
// front.
//
// Usage :
//   npx tsx --env-file=.env scripts/inspect-analysis-firestore.mts --userId=<uid>
//   npx tsx --env-file=.env scripts/inspect-analysis-firestore.mts --userId=<uid> --provider=myunisoft --limit=3
//
// Prérequis : variables FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY dans .env

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

type Args = {
  userId: string | null;
  provider: string | null;
  limit: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { userId: null, provider: null, limit: 3 };
  for (const arg of argv) {
    const m = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (!m) continue;
    const [, key, value] = m;
    if (key === "userId") args.userId = value || null;
    else if (key === "provider") args.provider = value || null;
    else if (key === "limit") args.limit = Number.parseInt(value, 10) || 3;
  }
  return args;
}

function getRequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} manquant.`);
  return v;
}

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function fmt(n: unknown): string {
  if (n === null || n === undefined) return `${ANSI.red}null${ANSI.reset}`;
  if (typeof n !== "number") return String(n);
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

(async () => {
  const args = parseArgs(process.argv.slice(2));

  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: getRequiredEnv("FIREBASE_PROJECT_ID"),
        clientEmail: getRequiredEnv("FIREBASE_CLIENT_EMAIL"),
        privateKey: getRequiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
      }),
    });
  }
  const db = getFirestore();

  console.log(
    `${ANSI.bold}▶ Inspection collection "analyses"${ANSI.reset}` +
      (args.userId ? ` · userId=${args.userId}` : " · tous utilisateurs") +
      (args.provider ? ` · provider=${args.provider}` : "") +
      ` · limit=${args.limit}\n`
  );

  // Stratégie en 2 temps pour éviter d'exiger un index composite (userId, createdAt) :
  //  - Si userId fourni : filtre simple, tri en mémoire
  //  - Sinon : orderBy direct (simple index existant sur createdAt suffit)
  let snap: FirebaseFirestore.QuerySnapshot;
  if (args.userId) {
    snap = await db.collection("analyses").where("userId", "==", args.userId).get();
  } else {
    snap = await db.collection("analyses").orderBy("createdAt", "desc").limit(args.limit).get();
  }
  if (snap.empty) {
    console.log(`${ANSI.yellow}Aucune analyse trouvée.${ANSI.reset}`);
    process.exit(0);
  }

  // Tri descendant en mémoire si userId filter (Firestore renvoie sans ordre)
  const docsSorted = args.userId
    ? [...snap.docs].sort((a, b) => {
        const ta = (a.data().createdAt as Timestamp | undefined)?.toMillis?.() ?? 0;
        const tb = (b.data().createdAt as Timestamp | undefined)?.toMillis?.() ?? 0;
        return tb - ta;
      }).slice(0, args.limit)
    : snap.docs;

  for (const [idx, doc] of docsSorted.entries()) {
    const data = doc.data();
    const meta = data.sourceMetadata ?? {};
    if (args.provider && meta.provider !== args.provider) continue;

    const created =
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate().toISOString()
        : String(data.createdAt ?? "?");
    const kpis = data.kpis ?? {};
    const mapped = data.mappedData ?? {};

    console.log(
      `${ANSI.bold}━━━ Analyse #${idx + 1} · id=${doc.id}${ANSI.reset}`
    );
    console.log(`  createdAt        : ${created}`);
    console.log(`  userId           : ${data.userId ?? "?"}`);
    console.log(`  folderName       : ${data.folderName ?? "?"}`);
    console.log(`  fiscalYear       : ${data.fiscalYear ?? "?"}`);
    console.log(`  provider         : ${ANSI.cyan}${meta.provider ?? "?"}${ANSI.reset}`);
    console.log(`  connectionId     : ${meta.connectionId ?? "?"}`);
    console.log(`  syncedAt         : ${meta.syncedAt ?? "?"}`);
    console.log(`  periodStart      : ${meta.periodStart ?? "?"}`);
    console.log(`  periodEnd        : ${meta.periodEnd ?? "?"}`);

    console.log(`\n  ${ANSI.bold}KPIs persistés${ANSI.reset} (échantillon clé) :`);
    console.log(`    ca               : ${fmt(kpis.ca)}`);
    console.log(`    ebe              : ${fmt(kpis.ebe)}`);
    console.log(`    va               : ${fmt(kpis.va)}`);
    console.log(`    marge_ebitda     : ${kpis.marge_ebitda ?? `${ANSI.red}null${ANSI.reset}`}`);
    console.log(`    disponibilites   : ${fmt(kpis.disponibilites)}`);
    console.log(`    tn               : ${fmt(kpis.tn)}`);
    console.log(`    bfr              : ${fmt(kpis.bfr)}`);
    console.log(`    res_net          : ${fmt(kpis.res_net)}`);

    console.log(`\n  ${ANSI.bold}MappedData (origines)${ANSI.reset} :`);
    console.log(`    ventes_march     : ${fmt(mapped.ventes_march)}`);
    console.log(`    prod_serv        : ${fmt(mapped.prod_serv)}`);
    console.log(`    prod_vendue      : ${fmt(mapped.prod_vendue)}`);
    console.log(`    total_prod_expl  : ${fmt(mapped.total_prod_expl)}`);
    console.log(`    dispo            : ${fmt(mapped.dispo)}`);
    console.log(`    clients          : ${fmt(mapped.clients)}`);
    console.log(`    fournisseurs     : ${fmt(mapped.fournisseurs)}`);

    if (data.dailyAccounting) {
      const da = data.dailyAccounting as Array<unknown>;
      console.log(`\n  ${ANSI.bold}dailyAccounting${ANSI.reset} : ${da.length} jour(s)`);
    }
    if (data.balanceSheetSnapshot) {
      console.log(`  ${ANSI.bold}balanceSheetSnapshot${ANSI.reset} : présent`);
    } else {
      console.log(`  ${ANSI.dim}balanceSheetSnapshot : absent${ANSI.reset}`);
    }
    console.log("");
  }
})().catch((err) => {
  console.error(`\n${ANSI.red}❌ Échec :${ANSI.reset}`, err instanceof Error ? err.message : err);
  process.exit(1);
});
