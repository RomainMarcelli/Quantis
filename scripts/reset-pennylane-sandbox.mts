// Resetup propre d'une connexion Pennylane sandbox pour un user donné :
// 1. Crée une connection Firestore (token chiffré, providerSub=pennylane_company)
// 2. Lance un sync initial sur la fenêtre 36 mois → persiste les entités
// 3. Construit l'AnalysisRecord (trial_balance + entries → mappedData → KPI)
// 4. Affiche un rapport lisible des KPIs résultants
//
// Pré-requis : avoir purgé l'utilisateur via purge-user-firestore.mts (sinon
// createConnection refuse avec ConnectionAlreadyExistsError).
//
// Usage : npx tsx --env-file=.env scripts/reset-pennylane-sandbox.mts <userId>

const [, , userId] = process.argv;
if (!userId) {
  console.error("Usage : reset-pennylane-sandbox.mts <userId>");
  process.exit(1);
}
const TOKEN = process.env.PENNYLANE_TEST_TOKEN;
if (!TOKEN) {
  console.error("PENNYLANE_TEST_TOKEN absent (lance avec --env-file=.env).");
  process.exit(1);
}

async function loadCjs<T>(path: string): Promise<T> {
  const m = (await import(path)) as Record<string, unknown> & { default?: T };
  return (m.default ?? (m as unknown as T));
}

const authM = await loadCjs<{
  buildCompanyTokenAuth: (params: { accessToken: string }) => Promise<{
    mode: "company_token";
    accessToken: string;
    externalCompanyId: string;
  }>;
}>("../services/integrations/adapters/pennylane/auth");

const storeM = await loadCjs<{
  createConnection: (input: {
    userId: string;
    provider: "pennylane";
    providerSub: string;
    auth: { mode: "company_token"; accessToken: string; externalCompanyId: string };
  }) => Promise<{ id: string }>;
}>("../services/integrations/storage/connectionStore");

const orchestratorM = await loadCjs<{
  runSync: (params: {
    userId: string;
    connectionId: string;
    options?: { mode?: "initial" | "incremental" };
  }) => Promise<{ entities: Array<Record<string, unknown>>; failedEntities?: Array<Record<string, unknown>> }>;
  DEFAULT_INITIAL_PERIOD_MONTHS: number;
}>("../services/integrations/sync/syncOrchestrator");

const builderM = await loadCjs<{
  buildAndPersistAnalysisFromSync: (params: {
    userId: string;
    connectionId: string;
    periodStart: Date;
    periodEnd: Date;
  }) => Promise<{ analysisId: string; fiscalYear: number | null; trialBalanceUsed: boolean }>;
}>("../services/integrations/sync/buildAnalysisFromSync");

const fmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const eur = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${fmt.format(v)} €`;

(async () => {
  console.log("═".repeat(78));
  console.log(`Reset Pennylane sandbox — userId=${userId}`);
  console.log("═".repeat(78));

  // ─── 1. Connect ─────────────────────────────────────────────────────────
  console.log("\n[1/4] Création de la connexion Pennylane...");
  const auth = await authM.buildCompanyTokenAuth({ accessToken: TOKEN! });
  const connection = await storeM.createConnection({
    userId,
    provider: "pennylane",
    providerSub: "pennylane_company",
    auth,
  });
  console.log(`  connectionId : ${connection.id}`);
  console.log(`  externalCompanyId : ${auth.externalCompanyId || "(résolu via /me)"}`);

  // ─── 2. Sync ────────────────────────────────────────────────────────────
  const months = orchestratorM.DEFAULT_INITIAL_PERIOD_MONTHS;
  console.log(`\n[2/4] runSync (initial, ${months} mois)...`);
  const t0 = Date.now();
  const report = await orchestratorM.runSync({
    userId,
    connectionId: connection.id,
    options: { mode: "initial" },
  });
  console.log(`  durée : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  entités reportées :`);
  for (const e of report.entities) {
    const name = (e.collection ?? e.entity ?? "(?)") as string;
    const count = (e.itemsPersisted ?? e.persisted ?? e.count ?? "?") as number | string;
    console.log(`    ${String(name).padEnd(22)} ${String(count).padStart(5)}`);
  }
  if (report.failedEntities && report.failedEntities.length > 0) {
    console.log(`  ⚠ failed: ${JSON.stringify(report.failedEntities)}`);
  }

  // ─── 3. Build Analysis ──────────────────────────────────────────────────
  console.log("\n[3/4] buildAndPersistAnalysisFromSync...");
  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setMonth(periodStart.getMonth() - months);
  const t1 = Date.now();
  const analysis = await builderM.buildAndPersistAnalysisFromSync({
    userId,
    connectionId: connection.id,
    periodStart,
    periodEnd,
  });
  console.log(`  durée : ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  console.log(`  analysisId       : ${analysis.analysisId}`);
  console.log(`  fiscalYear       : ${analysis.fiscalYear}`);
  console.log(`  trialBalanceUsed : ${analysis.trialBalanceUsed}`);

  // ─── 4. KPI report ──────────────────────────────────────────────────────
  console.log("\n[4/4] Rapport KPIs (lecture Firestore)");
  const fbAdmin = await import("firebase-admin/app");
  const fbStore = await import("firebase-admin/firestore");
  if (fbAdmin.getApps().length === 0) {
    fbAdmin.initializeApp({
      credential: fbAdmin.cert({
        projectId: process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      }),
    });
  }
  const db = fbStore.getFirestore();
  const doc = await db.collection("analyses").doc(analysis.analysisId).get();
  const d = doc.data() as Record<string, unknown>;
  const k = (d.kpis as Record<string, number | null>) ?? {};
  const m = (d.mappedData as Record<string, number | null>) ?? {};
  const daily = (d.dailyAccounting as Array<{ date: string }>) ?? [];

  console.log(`\n${"═".repeat(78)}\nKPIs financiers\n${"═".repeat(78)}`);
  const lines: Array<[string, string]> = [
    ["CA", eur(k.ca)],
    ["VA", eur(k.va)],
    ["EBITDA", eur(k.ebitda)],
    ["Résultat net", eur(k.resultat_net)],
    ["BFR", eur(k.bfr)],
    ["DSO (jours)", k.dso === null || k.dso === undefined ? "—" : `${k.dso!.toFixed(1)} j`],
    ["DPO (jours)", k.dpo === null || k.dpo === undefined ? "—" : `${k.dpo!.toFixed(1)} j`],
    ["Solvabilité (CP/Passif)", k.solvabilite === null || k.solvabilite === undefined ? "—" : k.solvabilite!.toFixed(2)],
    ["Disponibilités", eur(k.disponibilites)],
    ["Emprunts", eur(m.emprunts)],
    ["Total actif", eur(m.total_actif)],
    ["Total passif", eur(m.total_passif)],
    ["Total CP", eur(m.total_cp)],
    ["Health score (/100)", k.healthScore === null || k.healthScore === undefined ? "—" : String(k.healthScore)],
  ];
  for (const [label, val] of lines) {
    console.log(`  ${label.padEnd(28)} ${val.padStart(20)}`);
  }
  console.log();

  // ─── Couverture pour les 4 onglets ──────────────────────────────────────
  console.log(`${"═".repeat(78)}\nCouverture écrans (présence des données minimum requises)\n${"═".repeat(78)}`);
  const checks: Array<[string, boolean, string]> = [
    ["Création de valeur", k.ca !== null && k.ebe !== null, "ca + ebe + tcam"],
    ["Investissement", m.total_actif !== null && k.bfr !== null && k.dso !== null, "total_actif + bfr + dso/dpo"],
    ["Financement", m.emprunts !== null && k.solvabilite !== null && m.total_cp !== null, "emprunts + solvabilité + total_cp"],
    ["Rentabilité", k.roe !== null && k.roce !== null, "roe + roce"],
  ];
  for (const [name, ok, requires] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${name.padEnd(20)} (${requires})`);
  }

  console.log(`\ndailyAccounting : ${daily.length} jours non vides`);
  if (daily.length > 0) {
    const dates = daily.map((x) => x.date).sort();
    console.log(`Plage : ${dates[0]} → ${dates[dates.length - 1]}`);
  }

  // ─── Vérification unicité ───────────────────────────────────────────────
  const allAnalyses = await db.collection("analyses").where("userId", "==", userId).get();
  const allConnections = await db.collection("connections").where("userId", "==", userId).get();
  console.log(`\n${"═".repeat(78)}\nUnicité Firestore (post-sync)\n${"═".repeat(78)}`);
  console.log(`  analyses pour cet UID    : ${allAnalyses.size}`);
  console.log(`  connections pour cet UID : ${allConnections.size}`);
  if (allAnalyses.size === 1 && allConnections.size === 1) {
    console.log("  ✓ État propre — 1 analyse + 1 connexion.");
  } else {
    console.log("  ⚠ Doublons détectés.");
  }
})().catch((e) => {
  console.error("\n[ERROR]", e);
  process.exit(1);
});
