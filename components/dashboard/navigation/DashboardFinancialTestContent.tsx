// File: components/dashboard/navigation/DashboardFinancialTestContent.tsx
// Role: route le rendu des onglets du menu de test vers des vues alternatives isolées.
"use client";

import { FinancingTest } from "@/components/dashboard/navigation/FinancingTest";
import { InvestmentTest } from "@/components/dashboard/navigation/InvestmentTest";
import { RentabilityTest } from "@/components/dashboard/navigation/RentabilityTest";
import { ValueCreationTest } from "@/components/dashboard/navigation/ValueCreationTest";
import type { DashboardTestTabId } from "@/components/dashboard/navigation/DashboardFinancialTestMenu";
import type { CalculatedKpis, MappedFinancialData } from "@/types/analysis";

type DashboardFinancialTestContentProps = {
  activeTab: DashboardTestTabId;
  kpis: CalculatedKpis;
  mappedData: MappedFinancialData;
  previousKpis?: CalculatedKpis | null;
};

export function DashboardFinancialTestContent({
  activeTab,
  kpis,
  mappedData,
  previousKpis = null
}: DashboardFinancialTestContentProps) {
  if (activeTab === "creation-valeur") {
    return <ValueCreationTest kpis={kpis} mappedData={mappedData} previousKpis={previousKpis} />;
  }

  if (activeTab === "investissement-bfr") {
    return <InvestmentTest kpis={kpis} previousKpis={previousKpis} />;
  }

  if (activeTab === "financement") {
    return <FinancingTest kpis={kpis} previousKpis={previousKpis} />;
  }

  if (activeTab === "rentabilite") {
    return <RentabilityTest kpis={kpis} previousKpis={previousKpis} />;
  }

  return (
    <TestPlaceholderCard
      title="Rentabilité"
      description="Cette section n'est pas encore intégrée."
    />
  );
}

function TestPlaceholderCard({ title, description }: { title: string; description: string }) {
  return (
    <section className="precision-card rounded-2xl p-5">
      <p className="text-xs uppercase tracking-[0.14em] text-quantis-gold/80">Navigation financière</p>
      <h3 className="mt-2 text-xl font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-white/70">{description}</p>
    </section>
  );
}
