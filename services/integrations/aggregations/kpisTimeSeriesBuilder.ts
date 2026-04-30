// Construit une série temporelle de KPI mensuels à partir des écritures comptables.
// Pour chaque mois de la période, on rejoue : entries → ParsedFinancialData → MappedFinancialData → KPI.
//
// Le pcgAggregator gère déjà le cumul jusqu'à la fin de période demandée, donc à chaque mois
// on relance avec un nouveau periodEnd glissant. Les KPI mensuels reflètent ainsi à la fois
// le P&L du mois (mouvement) et le bilan à la fin du mois (cumul).
//
// Note : la limitation "pas d'à-nouveau" du pcgAggregator se propage ici. Les KPI bilan
// mensuels seront approximatifs jusqu'à ce qu'on ingère une balance d'ouverture.

import { computeKpis } from "@/services/kpiEngine";
import { mapParsedFinancialDataToMappedFinancialData } from "@/services/mapping/parsedFinancialDataBridge";
import { aggregateEntriesToParsedFinancialData } from "@/services/integrations/aggregations/pcgAggregator";
import type { AccountingEntry, KpiTimeSeriesEntry } from "@/types/connectors";

export type KpisTimeSeriesBuilderOptions = {
  periodStart: Date;
  periodEnd: Date;
};

export function buildKpisTimeSeries(params: {
  entries: AccountingEntry[];
  options: KpisTimeSeriesBuilderOptions;
}): KpiTimeSeriesEntry[] {
  const { entries, options } = params;
  const months = enumerateMonthBoundaries(options.periodStart, options.periodEnd);
  const series: KpiTimeSeriesEntry[] = [];

  for (const { monthStart, monthEnd, label } of months) {
    const parsed = aggregateEntriesToParsedFinancialData(entries, {
      periodStart: monthStart,
      periodEnd: monthEnd,
    });
    const mappedData = mapParsedFinancialDataToMappedFinancialData(parsed);
    const kpis = computeKpis(mappedData);

    series.push({
      periodStart: monthStart.toISOString(),
      periodEnd: monthEnd.toISOString(),
      label,
      granularity: "month",
      mappedData,
      kpis,
    });
  }

  return series;
}

// Découpe une période en mois calendaires complets.
// Le premier mois part de periodStart, le dernier va jusqu'à periodEnd.
function enumerateMonthBoundaries(
  start: Date,
  end: Date
): Array<{ monthStart: Date; monthEnd: Date; label: string }> {
  const result: Array<{ monthStart: Date; monthEnd: Date; label: string }> = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 0, 0, 0, 0);
  while (cursor <= end) {
    const monthStart = new Date(cursor);
    const monthEndCandidate = new Date(
      cursor.getFullYear(),
      cursor.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );
    const monthEnd = monthEndCandidate > end ? end : monthEndCandidate;
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    result.push({
      monthStart,
      monthEnd,
      label: `${y}-${m}`,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
}
