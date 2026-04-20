// File: components/dashboard/navigation/DashboardFinancialTestMenu.tsx
// Role: affiche le menu horizontal principal des sections financières (version design alternative).
"use client";

export type DashboardTestTabId =
  | "creation-valeur"
  | "investissement-bfr"
  | "financement"
  | "rentabilite";

const TEST_TABS: Array<{ id: DashboardTestTabId; label: string }> = [
  { id: "creation-valeur", label: "Création de valeur" },
  { id: "investissement-bfr", label: "Investissement" },
  { id: "financement", label: "Financement" },
  { id: "rentabilite", label: "Rentabilité" }
];

type DashboardFinancialTestMenuProps = {
  activeTab: DashboardTestTabId | null;
  onChange: (tab: DashboardTestTabId) => void;
};

export function DashboardFinancialTestMenu({
  activeTab,
  onChange
}: DashboardFinancialTestMenuProps) {
  return (
    <nav
      className="precision-card rounded-2xl p-2"
      aria-label="Navigation des sections financières"
      data-tour-id="analysis-tabs-menu"
    >
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <ul className="flex flex-wrap gap-2">
          {TEST_TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <li key={tab.id}>
                <button
                  id={getTourTabTargetId(tab.id)}
                  data-tour-id={getTourTabTargetId(tab.id)}
                  type="button"
                  onClick={() => onChange(tab.id)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "btn-gold-premium"
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
      </div>
    </nav>
  );
}

function getTourTabTargetId(tabId: DashboardTestTabId): string {
  if (tabId === "creation-valeur") {
    return "tour-tab-valeur";
  }
  if (tabId === "investissement-bfr") {
    return "tour-tab-investissement";
  }
  if (tabId === "financement") {
    return "tour-tab-financement";
  }
  return "tour-tab-rentabilite";
}
