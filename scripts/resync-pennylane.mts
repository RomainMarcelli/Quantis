// Re-sync Pennylane pour un user + connectionId donnés, en passant directement
// par `runSync` puis `buildAndPersistAnalysisFromSync` avec une fenêtre alignée
// sur `DEFAULT_INITIAL_PERIOD_MONTHS` (36 mois).
//
// Usage : npx tsx --env-file=.env scripts/resync-pennylane.mts <userId> <connectionId>

const [, , userId, connectionId] = process.argv;
if (!userId || !connectionId) {
  console.error("Usage : resync-pennylane.mts <userId> <connectionId>");
  process.exit(1);
}

async function loadCjs<T>(path: string): Promise<T> {
  const m = (await import(path)) as Record<string, unknown> & { default?: T };
  return (m.default ?? (m as unknown as T));
}

const orchestratorM = await loadCjs<{
  runSync: (params: {
    userId: string;
    connectionId: string;
    options?: { mode?: "initial" | "incremental"; periodStart?: Date; periodEnd?: Date };
  }) => Promise<{
    entities: Array<Record<string, unknown>>;
    failedEntities?: Array<Record<string, unknown>>;
  }>;
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

const { runSync, DEFAULT_INITIAL_PERIOD_MONTHS } = orchestratorM;
const { buildAndPersistAnalysisFromSync } = builderM;

const periodEnd = new Date();
const periodStart = new Date();
periodStart.setMonth(periodStart.getMonth() - DEFAULT_INITIAL_PERIOD_MONTHS);

console.log(`Re-sync Pennylane`);
console.log(`  user         : ${userId}`);
console.log(`  connection   : ${connectionId}`);
console.log(`  fenêtre      : ${periodStart.toISOString().slice(0, 10)} → ${periodEnd.toISOString().slice(0, 10)} (${DEFAULT_INITIAL_PERIOD_MONTHS} mois)`);
console.log();

const t0 = Date.now();
console.log("[1/2] runSync (fetch Pennylane → persist entités Firestore)...");
const report = await runSync({
  userId,
  connectionId,
  options: { mode: "initial", periodStart, periodEnd },
});
console.log(`  durée : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  ${report.entities.length} entité(s) reportée(s) :`);
for (const e of report.entities) {
  console.log(`    ${JSON.stringify(e)}`);
}
if (report.failedEntities && report.failedEntities.length > 0) {
  console.log(`  ⚠ entités en échec :`);
  for (const f of report.failedEntities) console.log(`    ${JSON.stringify(f)}`);
}

console.log("\n[2/2] buildAndPersistAnalysisFromSync (agrégation → AnalysisRecord)...");
const t1 = Date.now();
const analysis = await buildAndPersistAnalysisFromSync({
  userId,
  connectionId,
  periodStart,
  periodEnd,
});
console.log(`  durée : ${((Date.now() - t1) / 1000).toFixed(1)}s`);
console.log(`  analysisId       : ${analysis.analysisId}`);
console.log(`  fiscalYear       : ${analysis.fiscalYear}`);
console.log(`  trialBalanceUsed : ${analysis.trialBalanceUsed}`);
console.log("\nDone. Relance scripts/inspect-pennylane-analysis.mts pour vérifier.");
