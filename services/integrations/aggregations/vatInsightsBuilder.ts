// Construit les insights TVA depuis les lignes d'écriture sur les comptes 4456*/4457*/4455*.
// Détection de périodicité heuristique : par défaut "monthly", "quarterly" si <= 4 périodes
// non vides sur 12 mois, "annual" si <= 1.
//
// Phase 1 — pas d'info "déclaré / payé" depuis Pennylane direct → on laisse à false.
// L'utilisateur pourra annoter ça plus tard depuis le front.

import type { AccountingEntry, VatInsights, VatPeriodEntry, VatPeriodicity } from "@/types/connectors";

export type VatInsightsBuilderOptions = {
  periodStart: Date;
  periodEnd: Date;
};

const VAT_COLLECTED_PREFIXES = ["44571", "4457"]; // 4457 = TVA collectée
const VAT_DEDUCTIBLE_PREFIXES = ["44562", "44566", "44567"]; // déductible immo / ABS / crédit
const VAT_DUE_PREFIXES = ["44551", "4455"]; // TVA à décaisser

export function buildVatInsights(params: {
  entries: AccountingEntry[];
  options: VatInsightsBuilderOptions;
}): VatInsights {
  const { entries, options } = params;
  const periodStartMs = options.periodStart.getTime();
  const periodEndMs = options.periodEnd.getTime();

  // Agrégation par mois.
  const months = enumerateMonths(options.periodStart, options.periodEnd);
  const monthMap = new Map<
    string,
    { collected: number; deductible: number; due: number }
  >();
  for (const m of months) {
    monthMap.set(m.label, { collected: 0, deductible: 0, due: 0 });
  }

  for (const entry of entries) {
    const t = new Date(entry.date).getTime();
    if (Number.isNaN(t) || t < periodStartMs || t > periodEndMs) continue;
    const monthLabel = entry.date.slice(0, 7);
    const bucket = monthMap.get(monthLabel);
    if (!bucket) continue;

    for (const line of entry.lines) {
      const account = line.accountNumber || "";
      if (matchesPrefix(account, VAT_COLLECTED_PREFIXES)) {
        bucket.collected += line.credit - line.debit;
      } else if (matchesPrefix(account, VAT_DEDUCTIBLE_PREFIXES)) {
        bucket.deductible += line.debit - line.credit;
      } else if (matchesPrefix(account, VAT_DUE_PREFIXES)) {
        bucket.due += line.credit - line.debit;
      }
    }
  }

  const periods: VatPeriodEntry[] = months.map((m) => {
    const agg = monthMap.get(m.label) ?? { collected: 0, deductible: 0, due: 0 };
    const collected = roundMoney(agg.collected);
    const deductible = roundMoney(agg.deductible);
    const due = roundMoney(agg.due !== 0 ? agg.due : collected - deductible);
    return {
      periodStart: m.start.toISOString(),
      periodEnd: m.end.toISOString(),
      label: m.label,
      collected,
      deductible,
      due,
      declared: false,
      paid: false,
    };
  });

  const totalCollected = roundMoney(periods.reduce((s, p) => s + p.collected, 0));
  const totalDeductible = roundMoney(periods.reduce((s, p) => s + p.deductible, 0));
  const totalDue = roundMoney(periods.reduce((s, p) => s + p.due, 0));
  const outstandingDue = roundMoney(
    periods.filter((p) => !p.paid).reduce((s, p) => s + Math.max(0, p.due), 0)
  );

  return {
    periodicity: detectPeriodicity(periods),
    periods,
    totalCollected,
    totalDeductible,
    totalDue,
    outstandingDue,
  };
}

function detectPeriodicity(periods: VatPeriodEntry[]): VatPeriodicity {
  const nonEmptyMonths = periods.filter(
    (p) => p.collected !== 0 || p.deductible !== 0 || p.due !== 0
  ).length;
  if (nonEmptyMonths === 0) return "unknown";
  if (nonEmptyMonths <= 1) return "annual";
  if (nonEmptyMonths <= 4) return "quarterly";
  return "monthly";
}

function matchesPrefix(account: string, prefixes: string[]): boolean {
  return prefixes.some((p) => account.startsWith(p));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function enumerateMonths(start: Date, end: Date): Array<{ start: Date; end: Date; label: string }> {
  const result: Array<{ start: Date; end: Date; label: string }> = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(
      cursor.getFullYear(),
      cursor.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    result.push({
      start: monthStart,
      end: monthEnd > end ? end : monthEnd,
      label: `${y}-${m}`,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
}
