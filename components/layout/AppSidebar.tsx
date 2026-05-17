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
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  Briefcase,
  ChevronDown,
  FileText,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Receipt,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  readSidebarCollapsedPreference,
  writeSidebarCollapsedPreference,
} from "@/lib/ui/sidebarPreference";
import { LegalFooter } from "@/components/layout/LegalFooter";
import { useAccountType } from "@/hooks/useAccountType";

export type SidebarRoute =
  | "synthese"
  | "analysis"
  | "etats-financiers"
  | "documents"
  | "assistant-ia"
  | "cabinet-portefeuille";

type NavItem = {
  id: SidebarRoute;
  label: string;
  icon: LucideIcon;
  href: string;
  /** Visible uniquement pour ce type de compte. Undefined = visible pour tous. */
  onlyFor?: "firm_member" | "company_owner";
};

const PRIMARY_NAV: NavItem[] = [
  { id: "cabinet-portefeuille", label: "Portefeuille", icon: Briefcase, href: "/cabinet/portefeuille", onlyFor: "firm_member" },
  { id: "synthese", label: "Synthèse", icon: Sparkles, href: "/synthese" },
  { id: "analysis", label: "Tableau de bord", icon: LayoutDashboard, href: "/analysis" },
  { id: "assistant-ia", label: "Assistant IA", icon: Bot, href: "/assistant-ia" },
  { id: "etats-financiers", label: "États financiers", icon: Receipt, href: "/etats-financiers" },
  { id: "documents", label: "Documents", icon: FileText, href: "/documents" },
];

// Sous-item rendu sous "Tableau de bord" quand le sous-menu est expandable.
// Le `kind` permet de distinguer les onglets fixes des dashboards custom
// (pour afficher le bouton de suppression uniquement sur les custom).
export type DashboardSubmenuItem = {
  id: string;
  label: string;
  kind: "fixed" | "custom";
};

// Sous-onglets fixes du Tableau de bord — source unique référencée par la
// sidebar quand la page courante ne fournit pas son propre `dashboardSubmenu`
// (ex: depuis Documents, Synthèse, Assistant IA, États financiers).
// L'onglet Trésorerie n'est PAS inclus ici : sa visibilité dépend d'une
// connexion Bridge active, ce que seul le parent /analysis sait évaluer.
const DASHBOARD_FIXED_TABS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "creation-valeur", label: "Création de valeur" },
  { id: "investissement-bfr", label: "Investissement" },
  { id: "financement", label: "Financement" },
  { id: "rentabilite", label: "Rentabilité" },
];

// Sous-pages des États financiers — brief 09/06/2026 : la page unifiée a
// été scindée en deux documents séparés (Bilan = comptes 1-5, CDR = 6-7).
const FINANCIAL_DOCS: ReadonlyArray<{ id: string; label: string; href: string }> = [
  { id: "bilan", label: "Bilan", href: "/etats-financiers/bilan" },
  { id: "cdr", label: "Compte de résultat", href: "/etats-financiers/compte-de-resultat" },
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
  /**
   * Sous-menu expandable rendu sous l'item "Tableau de bord" quand fourni.
   * Liste les onglets fixes (Création de valeur, Investissement…) + les
   * dashboards custom de l'utilisateur, avec un bouton "+ Nouveau" en fin.
   * Le sous-menu n'est rendu que sur la route `analysis`.
   */
  dashboardSubmenu?: {
    items: DashboardSubmenuItem[];
    activeId?: string;
    onSelectItem: (id: string) => void;
    onCreate?: () => void;
    onDelete?: (id: string) => void;
  };
};

export function AppSidebar({
  activeRoute,
  contextSlot,
  accountFirstName,
  accountPlan = "Free",
  dashboardSubmenu,
}: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { accountType } = useAccountType();
  const visibleNav = PRIMARY_NAV.filter((item) => !item.onlyFor || item.onlyFor === accountType);
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);
  // L'AppSidebar est rendue À L'INTÉRIEUR de chaque page (pas dans un
  // layout partagé Next.js), elle remonte donc à chaque navigation. Pour
  // éviter que le dropdown se ferme à chaque clic sur un sous-onglet, on
  // dérive l'état initial du pathname : ouvert si on est déjà sur une
  // sous-route. L'utilisateur peut ensuite toggle librement — la fermeture
  // explicite ne sera pas conservée entre 2 navigations, mais c'est OK :
  // le cas typique est "j'ouvre le menu, je clique un sous-item, je veux
  // voir les autres options à proximité après navigation".
  const [dashboardSubmenuOpen, setDashboardSubmenuOpen] = useState(
    () => pathname?.startsWith("/analysis") ?? false,
  );
  const [financialSubmenuOpen, setFinancialSubmenuOpen] = useState(
    () => pathname?.startsWith("/etats-financiers/") ?? false,
  );

  // Quand le pathname change pendant la session (navigation client-side),
  // on ouvre le dropdown correspondant si l'utilisateur arrive sur une
  // sous-route. On NE FERME pas l'autre — l'user peut avoir voulu garder
  // un dropdown ouvert visuellement même en quittant sa zone.
  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/etats-financiers/")) setFinancialSubmenuOpen(true);
    if (pathname.startsWith("/analysis")) setDashboardSubmenuOpen(true);
  }, [pathname]);

  // Items rendus sous "Tableau de bord" :
  //   - Si la page courante a fourni son propre `dashboardSubmenu` (cas de
  //     /analysis qui connaît les dashboards custom + tresorerie + state
  //     d'onglet actif), on l'utilise tel quel.
  //   - Sinon, on rend les onglets fixes (DASHBOARD_FIXED_TABS) avec une
  //     navigation vers `/analysis?tab=<id>`. Les dashboards custom et
  //     l'onglet Trésorerie n'apparaissent pas ici (info non disponible
  //     hors de la page analysis).
  const effectiveDashboardSubmenu = dashboardSubmenu ?? {
    items: DASHBOARD_FIXED_TABS.map((t) => ({ ...t, kind: "fixed" as const })),
    activeId: undefined,
    onSelectItem: (id: string) => router.push(`/analysis?tab=${encodeURIComponent(id)}`),
  };

  // Active sub-id pour États financiers — dérivé du pathname courant.
  const financialActiveId = pathname?.startsWith("/etats-financiers/compte-de-resultat")
    ? "cdr"
    : pathname?.startsWith("/etats-financiers")
      ? "bilan"
      : undefined;

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
      data-sidebar-shell
      // Brief 09/06/2026 : sidebar figée comme l'en-tête — `lg:!sticky` avec
      // un offset qui passe SOUS le header sticky (top: 1rem + hauteur
      // header ~108 px data variant + 16 px de gap visuel) ≈ 9rem (144 px).
      // `max-h-[calc(100vh-9.5rem)]` + scroll interne pour ne jamais
      // dépasser le viewport sur les écrans courts. Le `!` est requis car
      // `.precision-card` (définie après @tailwind utilities) impose
      // `position: relative` et écraserait `sticky`.
      className={`precision-card h-fit rounded-2xl lg:!sticky lg:top-36 lg:max-h-[calc(100vh-9.5rem)] lg:overflow-y-auto ${
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
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeRoute;
          // Brief 09/06/2026 : sous-menus toujours visibles peu importe la
          // page courante. Tableau de bord ET États financiers exposent
          // leur sous-arborescence depuis n'importe quelle route. Caché
          // en mode replié (réapparaît en dépliant la sidebar).
          const submenuKind: "dashboard" | "financial" | null =
            !collapsed
              ? item.id === "analysis"
                ? "dashboard"
                : item.id === "etats-financiers"
                  ? "financial"
                  : null
              : null;
          const submenuOpen =
            submenuKind === "dashboard"
              ? dashboardSubmenuOpen
              : submenuKind === "financial"
                ? financialSubmenuOpen
                : false;
          const toggleSubmenu = () => {
            if (submenuKind === "dashboard") setDashboardSubmenuOpen((v) => !v);
            else if (submenuKind === "financial") setFinancialSubmenuOpen((v) => !v);
          };

          return (
            <div key={item.id}>
              {/* Rangée avec sous-menu : 2 boutons FRÈRES (jamais imbriqués,
                  sinon HTML invalide → écran noir sous React 19). Clic
                  zone principale = navigation ; clic flèche = toggle. */}
              {submenuKind ? (
                <div
                  data-sidebar-link
                  data-active={active ? "true" : "false"}
                  className={`flex w-full items-center gap-1 rounded-xl transition-colors ${
                    active
                      ? "bg-white/10 text-white"
                      : "text-white/75 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={active ? undefined : () => router.push(item.href)}
                    className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                  </button>
                  <button
                    type="button"
                    onClick={toggleSubmenu}
                    aria-label={submenuOpen ? "Replier le sous-menu" : "Déplier le sous-menu"}
                    className="mr-1 inline-flex h-6 w-6 items-center justify-center rounded text-white/45 hover:bg-white/10 hover:text-white/80"
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${
                        submenuOpen ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                  </button>
                </div>
              ) : (
                <NavRow
                  icon={<Icon className="h-4 w-4" />}
                  active={active}
                  collapsed={collapsed}
                  onClick={active ? undefined : () => router.push(item.href)}
                >
                  {item.label}
                </NavRow>
              )}

              {submenuKind === "dashboard" && submenuOpen ? (
                <DashboardSubmenuList submenu={effectiveDashboardSubmenu} />
              ) : null}
              {submenuKind === "financial" && submenuOpen ? (
                <FinancialSubmenuList
                  activeId={financialActiveId}
                  onSelect={(href) => router.push(href)}
                />
              ) : null}
            </div>
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

      {/* Liens légaux : visibles uniquement en mode déplié, en bas de la
          sidebar avec un séparateur fin. Masqués en mode replié pour
          économiser la verticalité — ils restent accessibles via le footer
          de la page d'auth ou directement par URL (/cgu, /privacy). */}
      {!collapsed ? (
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <LegalFooter variant="stacked" tone="subtle" showCopyright />
        </div>
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
      data-sidebar-link
      data-active={active ? "true" : "false"}
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
      {!collapsed ? <span className="flex-1">{children}</span> : null}
    </button>
  );
}

// ─── Sous-menu Tableau de bord (Phase 4) ───────────────────────────────

function DashboardSubmenuList({
  submenu,
}: {
  submenu: NonNullable<AppSidebarProps["dashboardSubmenu"]>;
}) {
  return (
    <ul className="ml-2 mt-1 space-y-0.5 border-l border-white/10 pl-3">
      {submenu.items.map((item) => {
        const isActive = item.id === submenu.activeId;
        return (
          <li key={item.id} className="group relative">
            <button
              type="button"
              onClick={() => submenu.onSelectItem(item.id)}
              className={`flex w-full items-center rounded-md px-2 py-1.5 pr-7 text-left text-[13px] transition-colors ${
                isActive
                  ? "bg-quantis-gold/10 text-quantis-gold"
                  : "text-white/65 hover:bg-white/5 hover:text-white"
              }`}
              aria-pressed={isActive}
            >
              <span className="truncate">{item.label}</span>
            </button>
            {item.kind === "custom" && submenu.onDelete ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Supprimer "${item.label}" ?`)) {
                    submenu.onDelete?.(item.id);
                  }
                }}
                aria-label={`Supprimer ${item.label}`}
                title={`Supprimer "${item.label}"`}
                className="absolute right-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-white/40 transition hover:bg-rose-500/20 hover:text-rose-300"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </li>
        );
      })}

      {submenu.onCreate ? (
        <li>
          <button
            type="button"
            onClick={submenu.onCreate}
            className="inline-flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] text-white/55 transition-colors hover:bg-quantis-gold/5 hover:text-quantis-gold"
          >
            <Plus className="h-3 w-3" />
            <span>Nouveau tableau</span>
          </button>
        </li>
      ) : null}
    </ul>
  );
}

// ─── Sous-menu États financiers (brief 09/06/2026) ─────────────────────

function FinancialSubmenuList({
  activeId,
  onSelect,
}: {
  activeId: string | undefined;
  onSelect: (href: string) => void;
}) {
  return (
    <ul className="ml-2 mt-1 space-y-0.5 border-l border-white/10 pl-3">
      {FINANCIAL_DOCS.map((doc) => {
        const isActive = doc.id === activeId;
        return (
          <li key={doc.id}>
            <button
              type="button"
              onClick={() => onSelect(doc.href)}
              className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
                isActive
                  ? "bg-quantis-gold/10 text-quantis-gold"
                  : "text-white/65 hover:bg-white/5 hover:text-white"
              }`}
              aria-pressed={isActive}
            >
              <span className="truncate">{doc.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
