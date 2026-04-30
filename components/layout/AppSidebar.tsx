// File: components/layout/AppSidebar.tsx
// Role: sidebar unique, partagée entre toutes les pages principales de
// l'app (Synthèse, Tableau de bord, États financiers, Documents,
// Assistant IA).
//
// DA volontairement alignée sur la sidebar historique de Synthèse /
// Tableau de bord :
//   - bouton replier en haut à droite
//   - nav primaire ; en mode replié les icônes sont dans une boîte
//     bordée (look "framed" historique)
//   - slot contextuel (sélecteur d'année, dossier actif…)
//   - bloc Compte en bas : avatar + nom + plan, clic = /account
//
// Les actions utilitaires (Réglages, Premium, Déconnexion) restent
// dans l'en-tête de chaque page comme avant — elles n'ont jamais été
// dans la sidebar.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  FileText,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  readSidebarCollapsedPreference,
  writeSidebarCollapsedPreference,
} from "@/lib/ui/sidebarPreference";

export type SidebarRoute =
  | "synthese"
  | "analysis"
  | "etats-financiers"
  | "documents"
  | "assistant-ia";

type NavItem = {
  id: SidebarRoute;
  label: string;
  icon: LucideIcon;
  href: string;
};

const PRIMARY_NAV: NavItem[] = [
  { id: "synthese", label: "Synthèse", icon: Sparkles, href: "/synthese" },
  { id: "analysis", label: "Tableau de bord", icon: LayoutDashboard, href: "/analysis" },
  { id: "etats-financiers", label: "États financiers", icon: Receipt, href: "/etats-financiers" },
  { id: "documents", label: "Documents", icon: FileText, href: "/documents" },
  { id: "assistant-ia", label: "Assistant IA", icon: Bot, href: "/assistant-ia" },
];

type AppSidebarProps = {
  activeRoute: SidebarRoute;
  /**
   * Slot optionnel rendu sous la nav primaire et au-dessus du bloc Compte
   * — pour les widgets contextuels (sélecteur d'année sur Synthèse,
   * dossier actif sur Documents…). Caché quand la sidebar est repliée.
   */
  contextSlot?: React.ReactNode;
  /**
   * Affichage du bloc Compte en bas. L'appelant fournit le prénom
   * (calculé selon ses propres règles : displayName, profileFirstName,
   * email…) pour rester cohérent avec l'en-tête de la page.
   * Si non fourni, on n'affiche pas le bloc.
   */
  accountFirstName?: string;
  /** Plan affiché sous le prénom (par défaut "Free"). */
  accountPlan?: string;
};

export function AppSidebar({
  activeRoute,
  contextSlot,
  accountFirstName,
  accountPlan = "Free",
}: AppSidebarProps) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCollapsed(readSidebarCollapsedPreference());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    writeSidebarCollapsedPreference(collapsed);
  }, [collapsed, ready]);

  return (
    <aside
      data-scroll-reveal-ignore
      className={`precision-card relative h-fit rounded-2xl lg:sticky lg:top-4 ${
        collapsed ? "p-3" : "p-4"
      }`}
    >
      {/* Bouton replier — historiquement à droite. */}
      <div className={`mb-2 flex ${collapsed ? "justify-center" : "justify-end"}`}>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white/85 transition hover:border-quantis-gold/60 hover:bg-black/80"
          aria-label={collapsed ? "Ouvrir le menu latéral" : "Réduire le menu latéral"}
          title={collapsed ? "Ouvrir le menu latéral" : "Réduire le menu latéral"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Nav primaire. */}
      <nav className="space-y-1 text-sm" data-tour-id="app-sidebar-nav">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeRoute;
          return (
            <NavRow
              key={item.id}
              icon={<Icon className="h-4 w-4" />}
              active={active}
              collapsed={collapsed}
              onClick={active ? undefined : () => router.push(item.href)}
            >
              {item.label}
            </NavRow>
          );
        })}
      </nav>

      {/* Slot contextuel (year selector, dossier actif…). */}
      {!collapsed && contextSlot ? <div className="mt-4">{contextSlot}</div> : null}

      {/* Bloc Compte — clic = /account. Conserve le style historique
          (avatar avec initiale en haut quand replié, carte avec nom + plan
          quand déplié). */}
      {accountFirstName ? (
        <button
          type="button"
          onClick={() => router.push("/account?from=app")}
          className={`mt-4 rounded-xl border border-white/10 bg-black/20 transition-colors hover:bg-white/10 ${
            collapsed ? "flex w-full justify-center p-2" : "w-full p-3 text-left"
          }`}
          aria-label="Ouvrir mon compte"
          title="Mon compte"
        >
          {collapsed ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm font-semibold text-white">
              {accountFirstName.charAt(0).toUpperCase()}
            </span>
          ) : (
            <>
              <p className="text-[11px] uppercase tracking-wide text-white/50">Compte</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm font-semibold text-white">
                  {accountFirstName.charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-medium text-white">{accountFirstName}</p>
                  <p className="text-xs text-white/55">{accountPlan}</p>
                </div>
              </div>
            </>
          )}
        </button>
      ) : null}
    </aside>
  );
}

// ─── NavRow (ancien style "framed icon" en mode replié) ────────────────

function NavRow({
  children,
  icon,
  active,
  collapsed,
  onClick,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  active?: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const label = typeof children === "string" ? children : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={`flex w-full items-center rounded-xl transition-colors ${
        collapsed ? "group justify-center px-2 py-2" : "gap-2 px-3 py-2 text-left"
      } ${
        active
          ? "bg-white/10 text-white"
          : "text-white/75 hover:bg-white/10 hover:text-white"
      }`}
    >
      {collapsed ? (
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
            active
              ? "border-quantis-gold/60 bg-quantis-gold/15 text-quantis-gold"
              : "border-white/15 bg-white/5 text-white/80 group-hover:border-white/30 group-hover:bg-white/10 group-hover:text-white"
          }`}
        >
          {icon}
        </span>
      ) : (
        icon
      )}
      {!collapsed ? <span>{children}</span> : null}
    </button>
  );
}
