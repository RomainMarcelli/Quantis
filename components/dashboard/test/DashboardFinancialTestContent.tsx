// File: components/dashboard/test/DashboardFinancialTestContent.tsx
// Role: route le rendu des onglets du menu de test vers des vues alternatives isolées.
"use client";

import { FinancingTest } from "@/components/dashboard/test/FinancingTest";
import { InvestmentTest } from "@/components/dashboard/test/InvestmentTest";
import { RentabilityTest } from "@/components/dashboard/test/RentabilityTest";
import { ValueCreationTest } from "@/components/dashboard/test/ValueCreationTest";
import type { DashboardTestTabId } from "@/components/dashboard/test/DashboardFinancialTestMenu";
import type { CalculatedKpis } from "@/types/analysis";

type DashboardFinancialTestContentProps = {
  activeTab: DashboardTestTabId;
  kpis: CalculatedKpis;
};

export function DashboardFinancialTestContent({ activeTab, kpis }: DashboardFinancialTestContentProps) {
  if (activeTab === "creation-valeur") {
    return <ValueCreationTest kpis={kpis} />;
  }

  if (activeTab === "investissement-bfr") {
    return <InvestmentTest kpis={kpis} />;
  }

  if (activeTab === "financement") {
    return <FinancingTest kpis={kpis} />;
  }

  if (activeTab === "rentabilite") {
    return <RentabilityTest kpis={kpis} />;
  }

  return (
    <TestPlaceholderCard
      title="Rentabilité (test)"
      description="La version de test de cette section n'est pas encore intégrée."
    />
  );
}

function TestPlaceholderCard({ title, description }: { title: string; description: string }) {
  return (
    <section className="precision-card rounded-2xl p-5">
      <p className="text-xs uppercase tracking-[0.14em] text-quantis-gold/80">Menu de test</p>
      <h3 className="mt-2 text-xl font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-white/70">{description}</p>
    </section>
  );
}
