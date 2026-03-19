import type { CalculatedKpis, FinancialFacts } from "@/types/analysis";

export function computeKpis(facts: FinancialFacts): CalculatedKpis {
  const revenue = valueOrZero(facts.revenue);
  const expenses = valueOrZero(facts.expenses);
  const payroll = valueOrZero(facts.payroll);
  const treasury = valueOrZero(facts.treasury);
  const receivables = valueOrZero(facts.receivables);
  const payables = valueOrZero(facts.payables);
  const inventory = valueOrZero(facts.inventory);

  const grossMarginRate = revenue > 0 ? round(((revenue - expenses) / revenue) * 100) : null;
  const netProfit = revenue > 0 ? round(revenue - expenses - payroll) : null;
  const workingCapital = facts.receivables !== null || facts.inventory !== null || facts.payables !== null
    ? round(receivables + inventory - payables)
    : null;

  const monthlyBurnRate = netProfit !== null && netProfit < 0 ? round(Math.abs(netProfit) / 12) : 0;
  const cashRunwayMonths =
    monthlyBurnRate && monthlyBurnRate > 0 && facts.treasury !== null
      ? round(treasury / monthlyBurnRate)
      : null;

  return {
    grossMarginRate,
    netProfit,
    workingCapital,
    monthlyBurnRate,
    cashRunwayMonths,
    healthScore: scoreHealth({
      grossMarginRate,
      netProfit,
      workingCapital,
      cashRunwayMonths
    })
  };
}

function scoreHealth({
  grossMarginRate,
  netProfit,
  workingCapital,
  cashRunwayMonths
}: {
  grossMarginRate: number | null;
  netProfit: number | null;
  workingCapital: number | null;
  cashRunwayMonths: number | null;
}): number | null {
  let score = 0;
  let weights = 0;

  if (grossMarginRate !== null) {
    score += normalize(grossMarginRate, 20, 60) * 35;
    weights += 35;
  }
  if (netProfit !== null) {
    score += (netProfit > 0 ? 1 : 0) * 30;
    weights += 30;
  }
  if (workingCapital !== null) {
    score += (workingCapital >= 0 ? 1 : 0) * 20;
    weights += 20;
  }
  if (cashRunwayMonths !== null) {
    score += normalize(cashRunwayMonths, 2, 12) * 15;
    weights += 15;
  }

  if (weights === 0) {
    return null;
  }

  return round((score / weights) * 100);
}

function normalize(value: number, low: number, high: number): number {
  if (value <= low) {
    return 0;
  }
  if (value >= high) {
    return 1;
  }
  return (value - low) / (high - low);
}

function valueOrZero(value: number | null): number {
  return value ?? 0;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

