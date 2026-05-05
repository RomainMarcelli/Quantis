// File: components/layout/AppHeader.tsx
// Role: header global unifié — visible identiquement sur toutes les pages
// principales (Synthèse, Analyse, États financiers, Documents, Assistant IA,
// Trésorerie). Un seul composant = un seul point de mise à jour pour les
// boutons (paramètres, compte, logout) + la barre de recherche.
//
// Avant : chaque page rendait son propre header avec des variations (taille
// du logo, ordre des boutons, présence de la barre de recherche, label
// "Plateforme financière" vs autre). Maintenance incohérente.
//
// Conventions :
//   - Le composant est `"use client"` (utilise useRouter + handlers async)
//   - Les props sont MINIMALES : juste le nom de l'entreprise et le badge
//     de source active (uniquement les pages qui en ont un sens). Tout le
//     reste est intrinsèque (logo, search, boutons).
//   - La barre de recherche mobile passe sous le header en dessous de md.
"use client";

import { useRouter } from "next/navigation";
import { Lock, LogOut, Settings, UserCircle2 } from "lucide-react";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar";
import { firebaseAuthGateway } from "@/services/auth";
import type { ReactNode } from "react";

export type AppHeaderProps = {
  /** Nom de l'entreprise affiché en haut à gauche. Défaut "Quantis". */
  companyName?: string;
  /** Sous-titre affiché sous le nom (ex. "Plateforme financière",
   *  "Cockpit financier", "Documents", etc.). Défaut "Plateforme financière". */
  subtitle?: string;
  /** Slot optionnel à droite du nom de l'entreprise (typiquement
   *  `<ActiveSourceBadge analysis={…} />` sur les pages d'analyse). */
  contextBadge?: ReactNode;
  /** Placeholder de la barre de recherche. Défaut adapté aux KPIs. */
  searchPlaceholder?: string;
  /** Désactive entièrement la barre de recherche pour les pages où elle
   *  n'a pas de sens (login, error, etc.). Défaut false. */
  hideSearch?: boolean;
  /** Actions spécifiques à la page (ex. "Nouvelle analyse" sur Documents).
   *  Insérées avant le bloc des boutons utilitaires (paramètres, compte…). */
  actionSlot?: ReactNode;
};

export function AppHeader({
  companyName = "Quantis",
  subtitle = "Plateforme financière",
  contextBadge,
  searchPlaceholder = "Rechercher un KPI, une alerte ou une section...",
  hideSearch = false,
  actionSlot,
}: AppHeaderProps) {
  const router = useRouter();

  async function onLogout() {
    await firebaseAuthGateway.signOut();
    router.replace("/");
  }

  return (
    <>
      <header className="precision-card flex items-center justify-between gap-3 rounded-2xl px-5 py-3">
        {/* Bloc gauche — logo + nom d'entreprise + sous-titre + badge contextuel */}
        <div className="flex min-w-0 items-center gap-3">
          <QuantisLogo withText={false} size={28} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{companyName}</p>
            <p className="truncate text-xs text-white/55">{subtitle}</p>
          </div>
          {contextBadge ? <div className="ml-2 hidden lg:block">{contextBadge}</div> : null}
        </div>

        {/* Bloc centre — barre de recherche desktop */}
        {!hideSearch ? (
          <div className="hidden min-w-[320px] flex-1 px-4 md:block">
            <GlobalSearchBar placeholder={searchPlaceholder} />
          </div>
        ) : null}

        {/* Bloc droit — actions spécifiques (slot) puis boutons utilitaires */}
        <div className="flex flex-shrink-0 items-center gap-2">
          {actionSlot}
          <button
            type="button"
            onClick={() => router.push("/settings")}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
            aria-label="Paramètres"
            title="Paramètres"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => router.push("/pricing")}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
            aria-label="Offres"
            title="Offre Free (verrouillée)"
          >
            <Lock className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => router.push("/account")}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
            aria-label="Compte"
            title="Compte"
          >
            <UserCircle2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
            aria-label="Se déconnecter"
            title="Se déconnecter"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Barre de recherche mobile — affichée sous le header en dessous de md */}
      {!hideSearch ? (
        <div className="md:hidden">
          <GlobalSearchBar placeholder="Rechercher..." />
        </div>
      ) : null}
    </>
  );
}
