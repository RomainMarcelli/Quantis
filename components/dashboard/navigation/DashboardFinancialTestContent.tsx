// File: components/dashboard/navigation/DashboardFinancialTestContent.tsx
// Role: route le rendu des onglets du menu de test vers des vues alternatives isolées.
"use client";

import { FinancingTest } from "@/components/dashboard/navigation/FinancingTest";
import { InvestmentTest } from "@/components/dashboard/navigation/InvestmentTest";
import { RentabilityTest } from "@/components/dashboard/navigation/RentabilityTest";
import { ValueCreationTest } from "@/components/dashboard/navigation/ValueCreationTest";
import { TreasuryTab } from "@/components/banking/TreasuryTab";
import { TreasuryEmptyState } from "@/components/banking/TreasuryEmptyState";
import { CustomizableDashboard } from "@/components/dashboard/widgets/CustomizableDashboard";
import type { DashboardTestTabId } from "@/components/dashboard/navigation/DashboardFinancialTestMenu";
import type { CustomDashboardSummary } from "@/hooks/useUserDashboards";
import type { AnalysisRecord, CalculatedKpis, MappedFinancialData } from "@/types/analysis";
import type { BankingSummary } from "@/types/banking";
import type { DashboardLayout } from "@/types/dashboard";

type DashboardFinancialTestContentProps = {
  activeTab: DashboardTestTabId;
  kpis: CalculatedKpis;
  mappedData: MappedFinancialData;
  previousKpis?: CalculatedKpis | null;
  /** Summary Bridge si l'utilisateur a une connexion bancaire active. Null
   *  quand l'onglet Trésorerie est masqué de toute façon. */
  bankingSummary?: BankingSummary | null;
  /** Historique du dossier — alimente la courbe d'évolution KPI top de chaque onglet. */
  analyses?: AnalysisRecord[];
  /** Analyse courante — son `dailyAccounting` alimente le mode mensuel. */
  currentAnalysis?: AnalysisRecord | null;
  /** Libellé de mode "Analyse dynamique / statique" affiché dans chaque onglet. */
  analysisModeLabel?: string | null;
  /** UID Firebase pour persister les layouts. Null = mode invité (no save). */
  userId?: string | null;
  /** Liste des dashboards custom — utilisée pour résoudre le `name` quand
   *  l'utilisateur clique sur un onglet custom (`custom:<uuid>`). */
  customDashboards?: CustomDashboardSummary[];
};

export function DashboardFinancialTestContent({
  activeTab,
  kpis,
  mappedData,
  previousKpis = null,
  bankingSummary = null,
  analyses = [],
  currentAnalysis = null,
  analysisModeLabel = null,
  userId = null,
  customDashboards = []
}: DashboardFinancialTestContentProps) {
  // Props partagés entre les 4 onglets KPI : identiques pour tous, on les
  // factorise ici pour éviter la duplication de 12 lignes.
  const sharedTabProps = {
    previousKpis,
    analyses,
    currentAnalysis,
    analysisModeLabel
  } as const;

  if (activeTab === "creation-valeur") {
    return <ValueCreationTest kpis={kpis} mappedData={mappedData} {...sharedTabProps} />;
  }

  if (activeTab === "investissement-bfr") {
    return <InvestmentTest kpis={kpis} {...sharedTabProps} />;
  }

  if (activeTab === "financement") {
    return <FinancingTest kpis={kpis} {...sharedTabProps} />;
  }

  if (activeTab === "rentabilite") {
    return <RentabilityTest kpis={kpis} {...sharedTabProps} />;
  }

  if (activeTab === "tresorerie") {
    if (!bankingSummary) {
      // Empty state contextuel (pas connecté vs connecté en attente de sync).
      return <TreasuryEmptyState />;
    }
    return <TreasuryTab summary={bankingSummary} />;
  }

  // Phase 4 — onglet custom : `custom:<uuid>`. Rend un CustomizableDashboard
  // 100% libre (pas de lockedCategory) avec persistance Firestore.
  if (activeTab.startsWith("custom:")) {
    const dashboard = customDashboards.find((d) => d.id === activeTab);
    const defaultLayout: DashboardLayout = {
      id: activeTab,
      name: dashboard?.name,
      widgets: []
    };
    return (
      <section className="space-y-4">
        {/* Titre du dashboard custom supprimé — désormais mergé dans le
            titre principal du AppHeader ("Tableau de bord - <nom>"). */}
        <CustomizableDashboard
          userId={userId}
          layoutId={activeTab}
          defaultLayout={defaultLayout}
          kpis={kpis}
          previousKpis={previousKpis}
          analyses={analyses}
          currentAnalysis={currentAnalysis}
          mappedData={mappedData}
        />
      </section>
    );
  }

  return (
    <TestPlaceholderCard
      title="Section inconnue"
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
