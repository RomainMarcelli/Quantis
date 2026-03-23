// File: components/dashboard/test/DashboardFinancialTestMenu.tsx
// Role: affiche un menu horizontal de test sous le menu principal pour tester des variantes de rendu.
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

export function DashboardFinancialTestMenu({ activeTab, onChange }: DashboardFinancialTestMenuProps) {
  return (
    <nav className="precision-card rounded-2xl p-2" aria-label="Menu de test des sections financières">
      <div className="flex items-center justify-between gap-3">
        <p className="px-2 text-xs uppercase tracking-[0.16em] text-quantis-gold/85">Menu de test</p>
        <p className="hidden text-[11px] text-white/45 md:block">Version design alternative</p>
      </div>

      <ul className="mt-2 flex flex-wrap gap-2">
        {TEST_TABS.map((tab) => {
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
    </nav>
  );
}

