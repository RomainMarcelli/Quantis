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

import { useRouter } from "next/navigation";
import { Lock, LogOut, Settings, UserCircle2 } from "lucide-react";
import { VyzorLogo } from "@/components/ui/VyzorLogo";
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

  async function onLogout() {
    await firebaseAuthGateway.signOut();
    router.replace("/");
  }

  return (
    <header className="precision-card overflow-hidden rounded-2xl">
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
          {actionSlot}
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
