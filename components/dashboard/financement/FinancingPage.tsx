// File: components/dashboard/financement/FinancingPage.tsx
// Role: assemble la section Financement (capacité, sécurité liquidité, CAF, levier et cash flow net).
"use client";

import { CAFCard } from "@/components/dashboard/financement/CAFCard";
import { CashFlowCard } from "@/components/dashboard/financement/CashFlowCard";
import { DebtCapacityCard } from "@/components/dashboard/financement/DebtCapacityCard";
import { LeverageCard } from "@/components/dashboard/financement/LeverageCard";
import { LiquidityCard } from "@/components/dashboard/financement/LiquidityCard";
import { buildCashFlowSeries, buildLiquidityIndicators } from "@/lib/dashboard/financement/financingViewModel";
import type { CalculatedKpis } from "@/types/analysis";

type FinancingPageProps = {
  kpis: CalculatedKpis;
};

export function FinancingPage({ kpis }: FinancingPageProps) {
  // Mapping explicite des KPI existants vers les champs demandés côté section Financement.
  const debtCapacityYears = kpis.capacite_remboursement_annees;
  const liquiditeGenerale = kpis.liq_gen;
  const liquiditeReduite = kpis.liq_red;
  const liquiditeImmediate = kpis.liq_imm;
  const caf = kpis.caf;
  const leverage = kpis.effet_levier;
  const cashFlowNet = kpis.fte;

  // Les indicateurs/series sont calculés dans un module pur pour rester testables et maintenables.
  const liquidityIndicators = buildLiquidityIndicators({
    liquiditeGenerale,
    liquiditeReduite,
    liquiditeImmediate
  });
  const cashFlowSeries = buildCashFlowSeries(cashFlowNet);

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_1.9fr]">
        <DebtCapacityCard debtCapacityYears={debtCapacityYears} />
        <LiquidityCard indicators={liquidityIndicators} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <CAFCard caf={caf} />
        <LeverageCard leverage={leverage} />
      </div>

      <CashFlowCard cashFlow={cashFlowNet} series={cashFlowSeries} />
    </section>
  );
}
