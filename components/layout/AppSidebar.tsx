// File: components/layout/AppSidebar.tsx
// Role: sidebar unique, partagée entre toutes les pages principales de
// l'app (Synthèse, Tableau de bord, États financiers, Documents,
// Assistant IA). Source unique pour : ordre des entrées, libellés,
// icônes, état replié, items de bas (réglages, premium, compte,
// logout).
//
// Pourquoi un composant partagé : avant cette extraction, chaque page
// dupliquait le même JSX → quand on ajoutait une entrée, il fallait la
// répéter dans 4 fichiers (et facile d'en oublier un). Ici une seule
// source.
//
// Convention :
//   - L'appelant passe `activeRoute` pour signaler la page courante.
//   - Le composant gère son état replié via le helper localStorage.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  FileText,
  LayoutDashboard,
  Lock,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  Sparkles,
  UserCircle2,
  type LucideIcon,
} from "lucide-react";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
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
   * Slot optionnel rendu sous la nav primaire et au-dessus des items de
   * bas — pour les widgets contextuels (sélecteur d'année sur Synthèse,
   * dossier actif sur Documents…). Caché quand la sidebar est repliée.
   */
  contextSlot?: React.ReactNode;
};

export function AppSidebar({ activeRoute, contextSlot }: AppSidebarProps) {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Synchronisation avec localStorage : lecture au mount, écriture à
  // chaque changement (après le premier render pour ne pas écraser).
  useEffect(() => {
    setIsCollapsed(readSidebarCollapsedPreference());
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    writeSidebarCollapsedPreference(isCollapsed);
  }, [isCollapsed, isReady]);

  async function handleLogout() {
    const { firebaseAuthGateway } = await import("@/services/auth");
    await firebaseAuthGateway.signOut();
    router.replace("/");
  }

  return (
    <aside
      className={`precision-card flex flex-col rounded-2xl p-4 transition-[width] ${
        isCollapsed ? "w-[68px]" : "w-[220px]"
      }`}
    >
      {/* En-tête : logo + bouton replier */}
      <div className="mb-4 flex items-center justify-between">
        {!isCollapsed ? <QuantisLogo withText={false} size={28} /> : null}
        <button
          type="button"
          onClick={() => setIsCollapsed((v) => !v)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
          aria-label={isCollapsed ? "Déplier le menu" : "Replier le menu"}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation principale */}
      <nav className="space-y-1 text-sm" data-tour-id="app-sidebar-nav">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeRoute;
          return (
            <NavRow
              key={item.id}
              icon={<Icon className="h-4 w-4" />}
              active={active}
              onClick={active ? undefined : () => router.push(item.href)}
              collapsed={isCollapsed}
            >
              {item.label}
            </NavRow>
          );
        })}
      </nav>

      {/* Slot contextuel (dropdown année, dossier actif, etc.) */}
      {!isCollapsed && contextSlot ? <div className="mt-4">{contextSlot}</div> : null}

      {/* Bas : items utilitaires */}
      <div className="mt-auto space-y-1 pt-4 text-sm">
        <NavRow
          icon={<Settings className="h-4 w-4" />}
          onClick={() => router.push("/settings")}
          collapsed={isCollapsed}
        >
          Réglages
        </NavRow>
        <NavRow
          icon={<Lock className="h-4 w-4" />}
          onClick={() => router.push("/pricing")}
          collapsed={isCollapsed}
        >
          Offre Premium
        </NavRow>
        <NavRow
          icon={<UserCircle2 className="h-4 w-4" />}
          onClick={() => router.push("/account?from=app")}
          collapsed={isCollapsed}
        >
          Mon compte
        </NavRow>
        <NavRow
          icon={<LogOut className="h-4 w-4" />}
          onClick={() => void handleLogout()}
          collapsed={isCollapsed}
        >
          Se déconnecter
        </NavRow>
      </div>
    </aside>
  );
}

// ─── NavRow (centralisé ici — supprime les copies dans chaque vue) ─────

function NavRow({
  icon,
  active = false,
  onClick,
  collapsed,
  children,
}: {
  icon: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${
        active
          ? "bg-quantis-gold/10 text-quantis-gold"
          : "text-white/70 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="flex h-6 w-6 items-center justify-center">{icon}</span>
      {!collapsed && <span className="text-xs font-medium">{children}</span>}
    </button>
  );
}
