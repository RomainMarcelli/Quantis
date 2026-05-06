// File: components/kpi/KpiCardLayout.tsx
// Role: layout uniforme des cartes KPI sur tout le dashboard.
//
// Spec visuelle (haut → bas, espacements en commentaire) :
//   1. Header : nom complet UPPERCASE 10 px / letter-spacing 0.05 em /
//               #9CA3AF à gauche + KpiTooltip ✨ à droite.
//   2. (gap 4 px) Titre vulgarisé — 16 px / bold / #FFFFFF.
//   3. (gap 8 px) Valeur principale — 32 px / bold / #FFFFFF.
//   4. (gap 4 px) Variation conditionnelle — flèche + % en couleur
//                  intuitive (haut = vert, bas = rouge, plat = "=" gris).
//                  Ligne masquée si pas de previousValue exploitable.
//   5. (gap 8 px) Badge de statut conditionnel — uniquement si diagnostic
//                  = "good" (✓) ou "danger" (⚠). Format compact "icône +
//                  label court" pour ne pas saturer la card avec un
//                  message verbeux ; les détails sont dans le tooltip ✨.
//   6. Slot `extra` rendu sous le badge si fourni (jauge d'objectif EBE,
//      sparkline custom…).
//
// Convention de couleur des variations :
// - Choix produit : vue "intuitive". Up = vert, down = rouge, flat = gris.
//   Indépendant du sens "higher is better / lower is better" du KPI :
//   un dirigeant lit l'évolution comme un signal directionnel et ne veut
//   pas avoir à se demander si "DSO en baisse en rouge" est positif.
//   Le tooltip ✨ donne la lecture qualitative (good/badSign) si besoin.
"use client";

import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import { KpiTooltip } from "@/components/kpi/KpiTooltip";
import { KpiBenchmarkAutoIndicator } from "@/components/synthese/KpiBenchmarkAutoIndicator";

export type KpiCardLayoutProps = {
  /** Identifiant du KPI dans le registre — pilote tooltip + diagnostic. */
  kpiId?: string;
  /** Nom officiel à afficher en uppercase sur la ligne 1.
      Si absent et `kpiId` fourni, on utilise `kpiRegistry[kpiId].label`. */
  fullName?: string;
  /** Titre vulgarisé sur la ligne 2 (ex. "Ce qui rentre"). */
  title: string;
  /** Valeur formatée affichée en grand sur la ligne 3 (ex. "222 262 €"). */
  formattedValue: ReactNode;
  /** Valeur numérique brute — sert au tooltip et au diagnostic. */
  value: number | null | undefined;
  /**
   * Valeur du même KPI sur la période précédente. Si fournie ET non-nulle,
   * on affiche la ligne de variation. Sinon, ligne masquée (pas de
   * placeholder, pas de "N/D").
   * 0 = traité comme absent : un % de variation depuis 0 est mathématiquement
   * infini, sans valeur informative.
   */
  previousValue?: number | null;
  /**
   * Slot optionnel rendu SOUS le badge de statut (jauge EBE, sparkline,
   * barre actif/passif…). Utilisé par KPIWide. Hérite du gap 8 px par défaut.
   */
  extra?: ReactNode;
  /** ID pour la barre de recherche globale. */
  searchId?: string;
  /** Classe CSS additionnelle pour ajuster la card. */
  className?: string;
  /**
   * Callback déclenché au clic sur la card. Sert à piloter le graphique
   * d'évolution en haut des onglets dashboard (clic sur un KPI → courbe
   * affichée pour ce KPI). Quand fourni, l'article devient un bouton.
   */
  onSelect?: () => void;
  /**
   * État sélectionné — affiche un anneau or autour de la card pour signaler
   * que c'est ce KPI qui est tracé dans le graphique d'évolution top.
   */
  isSelected?: boolean;
  /**
   * Si true : on masque le KpiTooltip ✨ et le KpiBenchmarkAutoIndicator.
   * Utilisé en mode édition du dashboard customizable — l'utilisateur veut
   * un canevas neutre pour drag/drop/resize, pas de popup informatif au
   * survol qui distrait du chrome d'édition.
   */
  disableTooltip?: boolean;
};

const HEADER_NAME_STYLE: React.CSSProperties = {
  fontSize: "10px",
  letterSpacing: "0.05em",
  color: "#9CA3AF",
};

const TITLE_STYLE: React.CSSProperties = {
  fontSize: "16px",
  color: "#FFFFFF",
};

const VALUE_STYLE: React.CSSProperties = {
  fontSize: "32px",
  color: "#FFFFFF",
};

const VARIATION_STYLE: React.CSSProperties = {
  fontSize: "14px",
};

const COLOR_GREEN = "#22C55E";
const COLOR_RED = "#EF4444";
const COLOR_GREY = "#9CA3AF";

export function KpiCardLayout({
  kpiId,
  fullName,
  title,
  formattedValue,
  value,
  previousValue,
  extra,
  searchId,
  className,
  onSelect,
  isSelected = false,
  disableTooltip = false,
}: KpiCardLayoutProps) {
  const definition = kpiId ? getKpiDefinition(kpiId) : null;
  const resolvedFullName = (fullName ?? definition?.label ?? "").toUpperCase();

  // ─── Variation période-vs-période ────────────────────────────────────
  // Convention : on ne calcule la variation que si previousValue est
  // exploitable (non-null, non-zéro, fini).
  const variation =
    typeof value === "number" &&
    Number.isFinite(value) &&
    typeof previousValue === "number" &&
    Number.isFinite(previousValue) &&
    previousValue !== 0
      ? computeVariation(value, previousValue)
      : null;

  // Selectability : si onSelect est fourni, l'article devient cliquable +
  // focusable. Anneau or quand `isSelected` pour signaler que cette carte
  // pilote le graphique d'évolution en haut de la page.
  const interactiveProps = onSelect
    ? {
        role: "button" as const,
        tabIndex: 0,
        onClick: onSelect,
        onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }
      }
    : {};
  const selectionClass = onSelect
    ? isSelected
      ? "ring-2 ring-quantis-gold/70 cursor-pointer"
      : "cursor-pointer hover:ring-1 hover:ring-white/20"
    : "";

  return (
    <article
      className={`precision-card group fade-up flex h-full flex-col rounded-2xl p-6 transition ${selectionClass} ${className ?? ""}`}
      data-search-id={searchId}
      {...interactiveProps}
    >
      {/* Ligne 1 — Header : nom complet uppercase + tooltip ✨ */}
      <div className="flex items-start justify-between">
        <span className="font-mono uppercase" style={HEADER_NAME_STYLE}>
          {resolvedFullName || " "}
        </span>
        {kpiId && !disableTooltip ? <KpiTooltip kpiId={kpiId} value={value} /> : null}
      </div>

      {/* Ligne 2 — Titre vulgarisé (4 px sous header) */}
      <h3 className="font-bold" style={{ ...TITLE_STYLE, marginTop: "4px" }}>
        {title}
      </h3>

      {/* Ligne 3 — Valeur principale (8 px sous titre) */}
      <div
        className="tnum data-react font-bold leading-none tracking-tight"
        style={{ ...VALUE_STYLE, marginTop: "8px" }}
      >
        {formattedValue}
      </div>

      {/* Ligne 4 — Variation conditionnelle (4 px sous valeur).
          Ligne entière masquée si pas de previousValue exploitable. */}
      {variation ? (
        <div
          className="flex items-center gap-1.5 font-medium"
          style={{ ...VARIATION_STYLE, marginTop: "4px", color: variation.color }}
        >
          {variation.direction === "up" ? (
            <TrendingUp className="h-4 w-4" />
          ) : variation.direction === "down" ? (
            <TrendingDown className="h-4 w-4" />
          ) : null}
          <span>{variation.label}</span>
        </div>
      ) : null}

      {/* Ligne 5 — Indicateur de benchmark Vyzor (3 cercles horizontaux + label
          de position). Auto-résolu via le `kpiId` quand un mapping Vyzor existe
          pour ce KPI ; rien rendu sinon (graceful — KPIs banking, point_mort,
          healthScore...). Voir lib/benchmark/kpiMapping.ts pour la couverture.
          Le badge "Excellent / Critique" basé sur les seuils Quantis a été
          retiré : sa lecture entre en conflit avec la position marché (un KPI
          peut être "Excellent" sur les seuils internes mais "Médiane" sur le
          marché — confusion). Le tooltip ✨ continue d'expliquer le diagnostic
          textuellement si besoin. */}
      {kpiId && !disableTooltip ? (
        <div style={{ marginTop: "8px" }}>
          <KpiBenchmarkAutoIndicator kpiId={kpiId} value={value} kpiLabel={title} />
        </div>
      ) : null}

      {/* Slot extra — rendu sous le benchmark si fourni (jauge EBE, sparkline). */}
      {extra ? <div style={{ marginTop: "8px" }}>{extra}</div> : null}
    </article>
  );
}

// ─── Helpers internes ────────────────────────────────────────────────

type Variation = { label: string; color: string; direction: "up" | "down" | "flat" };

/**
 * Calcule la variation en % entre la valeur courante et la précédente.
 *
 * Convention de couleur (choix produit "vue intuitive") :
 *   - hausse → vert  (up)
 *   - baisse → rouge (down)
 *   - stable → gris  (flat, label "=")
 *
 * On NE prend PAS en compte le sens "higher is better / lower is better"
 * du KPI : la couleur suit la flèche, point. Le tooltip ✨ donne la
 * lecture qualitative si besoin (un DSO en baisse rouge = bonne nouvelle
 * malgré la couleur, le tooltip l'explique).
 */
function computeVariation(current: number, previous: number): Variation {
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  // Arrondi à 0 si la variation est inférieure à 0,05 % (rounding visible
  // sur 1 décimale). Évite de montrer "+0,0%" qui n'a aucune valeur info.
  const rounded = Math.abs(pct) < 0.05 ? 0 : pct;

  if (rounded === 0) {
    // Stable : juste le sigle "=" en couleur de base, pas de %.
    return { label: "=", color: COLOR_GREY, direction: "flat" };
  }

  const formatted = `${rounded > 0 ? "+" : ""}${rounded.toFixed(1).replace(".", ",")}%`;
  return {
    label: formatted,
    color: rounded > 0 ? COLOR_GREEN : COLOR_RED,
    direction: rounded > 0 ? "up" : "down",
  };
}

