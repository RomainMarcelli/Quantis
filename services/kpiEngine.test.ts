import { describe, expect, it } from "vitest";
import { computeKpis } from "@/services/kpiEngine";

describe("computeKpis", () => {
  it("computes core KPIs from complete financial facts", () => {
    const result = computeKpis({
      revenue: 3500000,
      expenses: 2100000,
      payroll: 700000,
      treasury: 145000,
      receivables: 205000,
      payables: 107000,
      inventory: 142000
    });

    expect(result.grossMarginRate).toBeCloseTo(40, 1);
    expect(result.netProfit).toBe(700000);
    expect(result.workingCapital).toBe(240000);
    expect(result.monthlyBurnRate).toBe(0);
    expect(result.cashRunwayMonths).toBeNull();
    expect(result.healthScore).not.toBeNull();
  });

  it("returns burn rate and runway when net profit is negative", () => {
    const result = computeKpis({
      revenue: 100000,
      expenses: 120000,
      payroll: 40000,
      treasury: 120000,
      receivables: 0,
      payables: 0,
      inventory: 0
    });

    expect(result.netProfit).toBe(-60000);
    expect(result.monthlyBurnRate).toBe(5000);
    expect(result.cashRunwayMonths).toBe(24);
  });
});

