// File: components/dashboard/navigation/DashboardFinancialTestMenu.tsx
// Role: menu horizontal des sections financières du Tableau de bord. Combine
// les 5 sous-onglets fixes (Création de valeur, Investissement, Financement,
// Rentabilité, Trésorerie conditionnel) et — Phase 4 — les dashboards
// custom de l'utilisateur, accessibles à droite avec un bouton "+ Nouveau".
"use client";

import type { ReactNode } from "react";
import { Plus, X } from "lucide-react";
import type { CustomDashboardSummary } from "@/hooks/useUserDashboards";

// L'id d'un onglet peut être l'un des 5 ids fixes OU "custom:<uuid>" pour
// les dashboards créés par l'utilisateur. Garde un type discriminé pour la
// lisibilité des call-sites (DashboardFinancialTestContent dispatch dessus).
export type DashboardTestTabId =
  | "creation-valeur"
  | "investissement-bfr"
  | "financement"
  | "rentabilite"
  | "tresorerie"
  | `custom:${string}`;

const FIXED_TABS: Array<{ id: DashboardTestTabId; label: string }> = [
  { id: "creation-valeur", label: "Création de valeur" },
  { id: "investissement-bfr", label: "Investissement" },
  { id: "financement", label: "Financement" },
  { id: "rentabilite", label: "Rentabilité" },
  // L'onglet Trésorerie n'apparaît que quand Bridge est connecté
  // (cf. `showTresorerie` ci-dessous). Sinon il est masqué entièrement.
  { id: "tresorerie", label: "Trésorerie" }
];

type DashboardFinancialTestMenuProps = {
  activeTab: DashboardTestTabId | null;
  onChange: (tab: DashboardTestTabId) => void;
  /** Quand `false`, l'onglet Trésorerie est masqué. Par défaut `false`
   *  (on n'affiche que si Bridge est connecté côté parent). */
  showTresorerie?: boolean;
  /** Liste des dashboards custom de l'utilisateur (Phase 4). */
  customDashboards?: CustomDashboardSummary[];
  /** Callback pour ouvrir la modal de création d'un nouveau dashboard. */
  onCreateDashboard?: () => void;
  /** Callback pour supprimer un dashboard custom. Affiche un X au survol. */
  onDeleteDashboard?: (id: string) => void;
  /** Slot rendu à droite du menu (ex : bouton "Télécharger le rapport"). */
  rightSlot?: ReactNode;
};

export function DashboardFinancialTestMenu({
  activeTab,
  onChange,
  showTresorerie = false,
  customDashboards = [],
  onCreateDashboard,
  onDeleteDashboard,
  rightSlot
}: DashboardFinancialTestMenuProps) {
  const visibleFixed = showTresorerie
    ? FIXED_TABS
    : FIXED_TABS.filter((t) => t.id !== "tresorerie");

  return (
    <nav
      className="precision-card rounded-2xl p-2"
      aria-label="Navigation des sections financières"
      data-tour-id="analysis-tabs-menu"
    >
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <ul className="flex flex-wrap items-center gap-2">
          {visibleFixed.map((tab) => {
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

          {/* Séparateur visuel entre tabs fixes et custom */}
          {customDashboards.length > 0 ? (
            <li aria-hidden="true" className="mx-1 h-6 w-px bg-white/10" />
          ) : null}

          {customDashboards.map((dashboard) => {
            const isActive = dashboard.id === activeTab;
            return (
              <li key={dashboard.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onChange(dashboard.id as DashboardTestTabId)}
                  className={`rounded-xl px-4 py-2 pr-8 text-sm font-medium transition-colors ${
                    isActive
                      ? "btn-gold-premium"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                  aria-pressed={isActive}
                >
                  {dashboard.name}
                </button>
                {onDeleteDashboard ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Supprimer "${dashboard.name}" ?`)) {
                        onDeleteDashboard(dashboard.id);
                      }
                    }}
                    aria-label={`Supprimer ${dashboard.name}`}
                    title={`Supprimer "${dashboard.name}"`}
                    className={`absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md transition ${
                      isActive
                        ? "text-black/55 hover:bg-black/15 hover:text-black"
                        : "text-white/45 hover:bg-rose-500/20 hover:text-rose-300"
                    }`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </li>
            );
          })}

          {/* Bouton "+ Nouveau" en fin de liste */}
          {onCreateDashboard ? (
            <li>
              <button
                type="button"
                onClick={onCreateDashboard}
                className="inline-flex items-center gap-1 rounded-xl border border-dashed border-white/20 px-3 py-2 text-xs font-medium text-white/60 hover:border-quantis-gold/40 hover:bg-quantis-gold/5 hover:text-quantis-gold"
              >
                <Plus className="h-3.5 w-3.5" />
                Nouveau tableau
              </button>
            </li>
          ) : null}
        </ul>
        {rightSlot ? <div className="flex items-center self-start xl:self-auto">{rightSlot}</div> : null}
      </div>
    </nav>
  );
}

function getTourTabTargetId(tabId: DashboardTestTabId): string {
  if (tabId === "creation-valeur") return "tour-tab-valeur";
  if (tabId === "investissement-bfr") return "tour-tab-investissement";
  if (tabId === "financement") return "tour-tab-financement";
  if (tabId === "tresorerie") return "tour-tab-tresorerie";
  if (tabId === "rentabilite") return "tour-tab-rentabilite";
  return `tour-tab-${tabId}`;
}