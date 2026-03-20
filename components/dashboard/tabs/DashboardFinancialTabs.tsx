// File: components/dashboard/tabs/DashboardFinancialTabs.tsx
// Role: fournit le sous-menu horizontal du dashboard et pilote le rendu dynamique des sections financières.
"use client";

import type {
  AnalysisDashboardViewModel,
  DashboardMetricFormat,
  DashboardSection,
  DashboardSeverity
} from "@/lib/dashboard/analysisDashboardViewModel";
import { FinancingPage } from "@/components/dashboard/financement/FinancingPage";
import { InvestmentPage } from "@/components/dashboard/investment/InvestmentPage";
import { RentabilityPage } from "@/components/dashboard/rentabilite/RentabilityPage";
import { ValueCreation } from "@/components/dashboard/tabs/ValueCreation";
import type { CalculatedKpis } from "@/types/analysis";

export type DashboardTabId =
  | "creation-valeur"
  | "investissement-bfr"
  | "financement"
  | "rentabilite";

const DASHBOARD_TABS: Array<{ id: DashboardTabId; label: string }> = [
  { id: "creation-valeur", label: "Création de valeur" },
  { id: "investissement-bfr", label: "Investissement" },
  { id: "financement", label: "Financement" },
  { id: "rentabilite", label: "Rentabilité" }
];

type DashboardFinancialTabsMenuProps = {
  activeTab: DashboardTabId | null;
  onChange: (tab: DashboardTabId) => void;
  yearOptions?: Array<{ value: string; label: string }>;
  selectedYear?: string;
  onYearChange?: (value: string) => void;
};

export function DashboardFinancialTabsMenu({
  activeTab,
  onChange,
  yearOptions,
  selectedYear,
  onYearChange
}: DashboardFinancialTabsMenuProps) {
  const hasYearSelector =
    Array.isArray(yearOptions) &&
    yearOptions.length > 0 &&
    typeof selectedYear === "string" &&
    typeof onYearChange === "function";

  return (
    <nav className="precision-card rounded-2xl p-2" aria-label="Navigation des sections financières">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <ul className="flex flex-wrap gap-2">
          {DASHBOARD_TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => onChange(tab.id)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-quantis-gold/25 text-quantis-gold shadow-[inset_0_-2px_0_#d4af37]"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                  aria-pressed={isActive}
                >
                  {tab.label}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Selecteur de période: permet d'analyser une année précise sans quitter le dashboard. */}
        {hasYearSelector ? (
          <div className="flex items-center gap-2 self-start xl:self-auto">
            <label htmlFor="dashboard-year-select" className="text-xs uppercase tracking-[0.12em] text-white/50">
              Période
            </label>
            <select
              id="dashboard-year-select"
              value={selectedYear}
              onChange={(event) => onYearChange(event.target.value)}
              className="rounded-lg border border-white/20 bg-black/35 px-3 py-2 text-sm text-white outline-none transition focus:border-quantis-gold/70"
            >
              {yearOptions.map((option) => (
                <option key={option.value} value={option.value} className="bg-[#10141f] text-white">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    </nav>
  );
}

type DashboardFinancialTabContentProps = {
  activeTab: DashboardTabId | null;
  kpis: CalculatedKpis;
  viewModel: AnalysisDashboardViewModel;
};

export function DashboardFinancialTabContent({
  activeTab,
  kpis,
  viewModel
}: DashboardFinancialTabContentProps) {
  // Comportement demandé: arrivée sur le dashboard => contenu initial.
  if (activeTab === null) {
    return <LegacyDashboardOverview viewModel={viewModel} />;
  }

  if (activeTab === "creation-valeur") {
    return <ValueCreation kpis={kpis} />;
  }

  if (activeTab === "investissement-bfr") {
    return <InvestmentPage kpis={kpis} />;
  }

  if (activeTab === "financement") {
    return <FinancingPage kpis={kpis} />;
  }

  if (activeTab === "rentabilite") {
    return <RentabilityPage kpis={kpis} />;
  }

  const activeSection = resolveSectionByTab(viewModel.sections, activeTab);
  return <SectionMetricsPanel section={activeSection} />;
}

function LegacyDashboardOverview({ viewModel }: { viewModel: AnalysisDashboardViewModel }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <article className="precision-card rounded-2xl p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-white/60">Alertes</p>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-white">
            {viewModel.alerts.count}
          </span>
        </div>

        {viewModel.alerts.items.length === 0 ? (
          <p className="mt-3 rounded-xl border border-emerald-200/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            Aucune anomalie détectée.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {viewModel.alerts.items.map((alert) => (
              <li
                key={alert.id}
                className={`rounded-xl border-l-4 px-3 py-2 ${alertContainerClass(alert.severity)}`}
              >
                <p className={`text-sm font-medium ${alertColorClass(alert.severity)}`}>{alert.title}</p>
                <p className="text-xs text-white/65">{alert.description}</p>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="precision-card rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-white">KPI par blocs métier</h2>
        <div className="mt-3 grid gap-2">
          {viewModel.sections.map((section) => (
            <div key={section.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/60">{section.title}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {section.metrics.map((metric) => (
                  <div key={String(metric.key)} className="rounded-lg border border-white/10 px-2 py-1.5">
                    <p className="text-[11px] text-white/55">{metric.label}</p>
                    <p className="text-xs font-semibold text-white">
                      {formatMetricValue(metric.value, metric.format)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

function resolveSectionByTab(
  sections: DashboardSection[],
  tab: DashboardTabId
): DashboardSection | undefined {
  return sections.find((section) => section.id === tab);
}

function SectionMetricsPanel({ section }: { section?: DashboardSection }) {
  if (!section) {
    return (
      <article className="precision-card rounded-2xl p-5">
        <p className="text-sm text-white/70">Section indisponible pour le moment.</p>
      </article>
    );
  }

  return (
    <article className="precision-card rounded-2xl p-5">
      <h3 className="text-lg font-semibold text-white">{section.title}</h3>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {section.metrics.map((metric) => (
          <div key={String(metric.key)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            {/* Chaque carte explicite un KPI de la section active pour une lecture non-expert. */}
            <p className="text-xs uppercase tracking-wide text-white/50">{metric.label}</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {formatMetricValue(metric.value, metric.format)}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}

function formatMetricValue(value: number | null, format: DashboardMetricFormat): string {
  if (value === null) {
    return "N/D";
  }

  if (format === "currency") {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0
    }).format(value);
  }

  if (format === "percent") {
    const normalized = Math.abs(value) <= 1 ? value * 100 : value;
    return `${normalized.toFixed(1)}%`;
  }

  if (format === "days") {
    return `${value.toFixed(0)} j`;
  }

  if (format === "years") {
    return `${value.toFixed(1)} ans`;
  }

  if (format === "months") {
    return `${value.toFixed(1)} mois`;
  }

  if (format === "ratio") {
    return value.toFixed(2);
  }

  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
}

function alertColorClass(severity: Exclude<DashboardSeverity, "neutral">): string {
  if (severity === "red") {
    return "text-rose-300";
  }
  if (severity === "orange") {
    return "text-amber-300";
  }
  return "text-emerald-300";
}

function alertContainerClass(severity: Exclude<DashboardSeverity, "neutral">): string {
  if (severity === "red") {
    return "border-rose-500/70 bg-rose-500/10";
  }
  if (severity === "orange") {
    return "border-amber-500/60 bg-amber-500/10";
  }
  return "border-emerald-500/60 bg-emerald-500/10";
}
