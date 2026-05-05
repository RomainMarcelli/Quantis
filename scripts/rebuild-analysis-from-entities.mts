// Rebuild d'AnalysisRecord à partir des entités déjà persistées en Firestore
// (sans appeler Pennylane). Utile quand on a déjà fait runSync mais qu'on veut
// rejouer l'agrégation avec une fenêtre différente.
//
// Usage : npx tsx --env-file=.env scripts/rebuild-analysis-from-entities.mts <userId> <connectionId> [periodMonths=36]

const [, , userId, connectionId, monthsArg] = process.argv;
if (!userId || !connectionId) {
  console.error("Usage : <userId> <connectionId> [periodMonths]");
  process.exit(1);
}
const months = monthsArg ? Number(monthsArg) : 36;

async function loadCjs<T>(path: string): Promise<T> {
  const m = (await import(path)) as Record<string, unknown> & { default?: T };
  return (m.default ?? (m as unknown as T));
}

const builderM = await loadCjs<{
  buildAndPersistAnalysisFromSync: (params: {
    userId: string;
    connectionId: string;
    periodStart: Date;
    periodEnd: Date;
  }) => Promise<{ analysisId: string; fiscalYear: number | null; trialBalanceUsed: boolean }>;
}>("../services/integrations/sync/buildAnalysisFromSync");

const periodEnd = new Date();
const periodStart = new Date();
periodStart.setMonth(periodStart.getMonth() - months);

console.log(`Rebuild AnalysisRecord — fenêtre ${periodStart.toISOString().slice(0, 10)} → ${periodEnd.toISOString().slice(0, 10)} (${months} mois)`);

const t0 = Date.now();
const result = await builderM.buildAndPersistAnalysisFromSync({
  userId,
  connectionId,
  periodStart,
  periodEnd,
});
console.log(`durée : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`analysisId       : ${result.analysisId}`);
console.log(`fiscalYear       : ${result.fiscalYear}`);
console.log(`trialBalanceUsed : ${result.trialBalanceUsed}`);
