// File: components/layout/AppHeader.tsx
// Role: header global unifié — visible identiquement sur toutes les pages
// principales (Synthèse, Tableau de bord, États financiers, Documents,
// Assistant IA). Refonte 09/05/2026 selon le brief "Header unifié sur
// toute l'app" :
//
// - Suppression de la barre de recherche globale partout.
// - Suppression des bandeaux meta dupliqués (ANTOINEC / Analyse du… /
//   ANALYSE DYNAMIQUE / 32 jours avec écritures) — l'info source est
//   désormais portée uniquement par le contextBadge en ligne 1.
// - Deux variantes :
//     • "data"   : ligne 1 (identité + source) + ligne 2 (TemporalityBar
//                  + actions Simuler/Exporter/Personnaliser).
//                  Pour Synthèse, Tableau de bord, États financiers.
//     • "simple" : ligne 1 seule. Pour Assistant IA, Documents, Settings.
//
// Conventions :
//   - "use client" (useRouter + handlers async).
//   - Toutes les couleurs via CSS vars (--app-text-*, --app-border-*, etc.)
//     pour un flip auto dark/light.
//   - Aucune route hardcodée — la prop `variant` est explicite (testable).
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, LogOut, Settings, UserCircle2 } from "lucide-react";
import { VyzorLogo } from "@/components/ui/VyzorLogo";
import { NotificationsBell } from "@/components/layout/NotificationsBell";
import { CompanySelector } from "@/components/cabinet/CompanySelector";
import { firebaseAuthGateway } from "@/services/auth";
import type { ReactNode } from "react";

export type AppHeaderVariant = "data" | "simple";

export type AppHeaderProps = {
  /** Variante d'affichage. "data" = 2 lignes (identité + temporalité/actions),
   *  "simple" = ligne 1 seule. Défaut "simple". */
  variant?: AppHeaderVariant;
  /** Nom de l'entreprise affiché en haut à gauche. Défaut "Vyzor". */
  companyName?: string;
  /** Sous-titre adapté à la page :
   *   - "Plateforme financière"          (Synthèse / Tableau de bord)
   *   - "Posez vos questions sur vos KPIs" (Assistant IA)
   *   - "Gestion de vos documents"       (Documents)
   *   - "États financiers détaillés"     (États financiers)
   *   etc. */
  subtitle?: string;
  /** Slot optionnel à droite du sous-titre, typiquement
   *  `<ActiveSourceBadge analysis={…} />` sur les pages d'analyse. */
  contextBadge?: ReactNode;
  /** Slot optionnel rendu dans la ligne 2 (à gauche). Typiquement la
   *  TemporalityBar globale. Visible uniquement pour variant="data". */
  temporalityBar?: ReactNode;
  /** Slot optionnel rendu dans la ligne 2 (à droite). Typiquement les
   *  boutons "Simuler / Exporter / Personnaliser". Visible uniquement
   *  pour variant="data". */
  headerActions?: ReactNode;
  /** Actions supplémentaires sur la ligne 1 (juste avant les utilitaires).
   *  Compat avec l'ancienne API — utilisé pour les pages spécifiques
   *  (ex. bouton "+ Nouvelle analyse" sur Documents). */
  actionSlot?: ReactNode;
};

export function AppHeader({
  variant = "simple",
  companyName = "Vyzor",
  subtitle = "Plateforme financière",
  contextBadge,
  temporalityBar,
  headerActions,
  actionSlot,
}: AppHeaderProps) {
  const router = useRouter();

  // Brief 09/06/2026 : on toggle une classe "scrolled" dès que l'utilisateur
  // a quitté le top de la page. Ça permet d'afficher une bordure basse +
  // ombre subtile pour bien séparer visuellement le header sticky du
  // contenu qui défile en dessous (effet "frozen row" Excel).
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function onLogout() {
    await firebaseAuthGateway.signOut();
    router.replace("/");
  }

  return (
    <header
      // Brief 09/06/2026 : header figé en haut d'écran (style Excel) —
      // wrapper sticky qui héberge un halo de flou (extension verticale
      // au-dessus et en-dessous du card visible) + le card lui-même.
      // Le wrapper N'A PAS de precision-card / overflow:hidden — sinon le
      // halo serait clippé. Le wrapper page (<main>) ne doit PAS avoir
      // d'overflow-hidden non plus (sinon création d'un scroll container
      // qui empêche sticky de s'attacher au viewport).
      style={{
        position: "sticky",
        // Padding visuel au-dessus du header sticky pour préserver la
        // respiration de la mise en page (cf. capture user — petits
        // traits rouges au-dessus des cards). 1rem = équivalent au gap
        // entre header et sidebar (`space-y-4`).
        top: "1rem",
        zIndex: 50,
      }}
    >
      {/* Halo de flou : surface semi-transparente + backdrop-filter qui
          s'étend de quelques pixels AU-DESSUS et EN-DESSOUS du card
          visible (brief 09/06/2026 — l'utilisateur veut le flou qui
          dépasse pour un effet "verre dépoli" plus enveloppant). Affiché
          uniquement quand `scrolled` (sinon transparent au top de page). */}
      {scrolled ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0"
          style={{
            top: "-12px",
            bottom: "-12px",
            zIndex: -1,
            // 17 px = +20 % par rapport aux 14 px précédents (brief user).
            backdropFilter: "blur(17px) saturate(140%)",
            WebkitBackdropFilter: "blur(17px) saturate(140%)",
            backgroundColor: "rgb(var(--app-card-bg-rgb, 15 15 18) / 45%)",
            borderRadius: "1.25rem",
          }}
        />
      ) : null}

      <div
        className="precision-card overflow-hidden rounded-2xl"
        style={{
          transition:
            "box-shadow 200ms ease, border-color 200ms ease, background-color 200ms ease, backdrop-filter 200ms ease",
          ...(scrolled
            ? {
                // Card lui-même également semi-transparent + blur pour la
                // continuité visuelle avec le halo. WebkitBackdropFilter
                // pour Safari.
                backgroundColor: "rgb(var(--app-card-bg-rgb, 15 15 18) / 72%)",
                backdropFilter: "blur(17px) saturate(140%)",
                WebkitBackdropFilter: "blur(17px) saturate(140%)",
                borderBottom: "1px solid var(--app-border-strong)",
                boxShadow: "0 4px 16px rgb(0 0 0 / 18%)",
              }
            : {}),
        }}
      >
      {/* ─── Ligne 1 — Identité + source + utilitaires ─────────────── */}
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <VyzorLogo withText={false} size={28} />
          <div className="min-w-0">
            <p
              className="truncate text-sm font-semibold"
              style={{ color: "var(--app-text-primary)" }}
            >
              {companyName}
            </p>
            <p
              className="truncate text-xs"
              style={{ color: "var(--app-text-tertiary)" }}
            >
              {subtitle}
            </p>
          </div>
          {contextBadge ? (
            <div className="ml-2 hidden lg:block">{contextBadge}</div>
          ) : null}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <CompanySelector />
          {actionSlot}
          <NotificationsBell />
          <UtilityButton
            ariaLabel="Paramètres"
            onClick={() => router.push("/settings")}
          >
            <Settings className="h-4 w-4" />
          </UtilityButton>
          <UtilityButton
            ariaLabel="Offres"
            title="Offre Free (verrouillée)"
            onClick={() => router.push("/pricing")}
          >
            <Lock className="h-4 w-4" />
          </UtilityButton>
          <UtilityButton
            ariaLabel="Compte"
            onClick={() => router.push("/account")}
          >
            <UserCircle2 className="h-4 w-4" />
          </UtilityButton>
          <UtilityButton ariaLabel="Se déconnecter" onClick={() => void onLogout()}>
            <LogOut className="h-4 w-4" />
          </UtilityButton>
        </div>
      </div>

      {/* ─── Ligne 2 — Temporalité + actions (variant="data" uniquement) ── */}
      {variant === "data" && (temporalityBar || headerActions) ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-2"
          style={{
            borderTop: "1px solid var(--app-border)",
            backgroundColor: "var(--app-surface-soft)",
          }}
        >
          <div className="min-w-0 flex-1">{temporalityBar}</div>
          {headerActions ? (
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
              {headerActions}
            </div>
          ) : null}
        </div>
      ) : null}
      </div>
    </header>
  );
}

// ─── Bouton utilitaire (cog / lock / profile / logout) ──────────────
function UtilityButton({
  children,
  ariaLabel,
  title,
  onClick,
}: {
  children: ReactNode;
  ariaLabel: string;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      className="rounded-xl p-2 transition"
      style={{
        border: "1px solid var(--app-border)",
        backgroundColor: "var(--app-surface-soft)",
        color: "var(--app-text-secondary)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--app-surface-medium)";
        e.currentTarget.style.color = "var(--app-text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "var(--app-surface-soft)";
        e.currentTarget.style.color = "var(--app-text-secondary)";
      }}
    >
      {children}
    </button>
  );
}
