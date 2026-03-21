import type { CalculatedKpis, MappedFinancialData } from "@/types/analysis";

export function getNonNullMappedEntries(
  data: MappedFinancialData
): Array<{ key: string; value: number }> {
  return Object.entries(data)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => ({ key, value: value as number }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function getNonNullKpiEntries(kpis: CalculatedKpis): Array<{ key: string; value: number }> {
  return Object.entries(kpis)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => ({ key, value: value as number }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export type KpiComparisonEntry = {
  key: keyof CalculatedKpis;
  stored: number | null;
  recalculated: number | null;
  matches: boolean;
};

export function compareStoredAndRecalculatedKpis(
  stored: CalculatedKpis,
  recalculated: CalculatedKpis
): KpiComparisonEntry[] {
  return (Object.keys(recalculated) as Array<keyof CalculatedKpis>)
    .map((key) => {
      const storedValue = stored[key];
      const recalculatedValue = recalculated[key];
      return {
        key,
        stored: storedValue,
        recalculated: recalculatedValue,
        matches: areClose(storedValue, recalculatedValue)
      };
    })
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

function areClose(left: number | null, right: number | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return Math.abs(left - right) < 0.01;
}
