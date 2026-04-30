// Dump le contenu de kpiRegistry + simulationEngine en JSON sur stdout.
// Consommé par scripts/build-kpi-review-xlsx.py.
//
// Usage : npx tsx scripts/dump-kpi-data.mts > /tmp/kpi-data.json

async function loadCjs<T>(path: string): Promise<T> {
  const m = (await import(path)) as Record<string, unknown> & { default?: T };
  return (m.default ?? (m as unknown as T));
}

const registryM = await loadCjs<{
  KPI_REGISTRY: Record<string, unknown>;
}>("../lib/kpi/kpiRegistry");

const simulationM = await loadCjs<{
  SIMULATION_SCENARIOS: unknown[];
}>("../lib/simulation/simulationEngine");

const payload = {
  kpis: Object.values(registryM.KPI_REGISTRY),
  scenarios: simulationM.SIMULATION_SCENARIOS,
};

process.stdout.write(JSON.stringify(payload, null, 2));
