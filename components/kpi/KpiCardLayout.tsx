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
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
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
  /**
   * Décoration au bord BAS de la card, rendue à l'intérieur de l'article
   * pour bénéficier du `overflow: hidden` + `rounded-2xl` (la barre épouse
   * automatiquement les coins arrondis). Utilisé par la barre de progression
   * d'objectif sur KpiCardWidget. Le wrapper applique le positionnement
   * absolu via inline style — l'inline style écrase la règle globale
   * `.precision-card > * { position: relative }` qui sinon casserait le
   * layout (children forcés en relative).
   */
  bottomChrome?: ReactNode;
};

// Couleurs sourcées des CSS vars sémantiques (cf. app/globals.css) pour
// que ces inline styles flip automatiquement entre dark et light. Sans ça
// les hex hardcodés #FFFFFF restaient blancs sur fond clair = illisibles.
//
// Hiérarchie visuelle :
//   - KICKER_STYLE  : nom officiel complet en haut (ex. "Excédent brut
//                     d'exploitation"). Mono UPPERCASE 10 px gris secondaire,
//                     joue le rôle de kicker / sur-titre. Truncate + tooltip
//                     natif au survol pour les noms longs ("Capacité de
//                     remboursement", "Excédent brut d'exploitation"…).
//   - HEADING_STYLE : acronyme court juste en dessous (ex. "EBE"). Gras
//                     blanc 16 px, c'est le focal point visuel. Court par
//                     définition → ne déborde jamais.
//   - Si nom officiel == acronyme (cas DSO/DSO, ROE/ROE…), on n'affiche que
//     l'acronyme (pas de doublon kicker).
const KICKER_STYLE: React.CSSProperties = {
  fontSize: "10px",
  letterSpacing: "0.05em",
  color: "var(--app-text-secondary)",
};

const HEADING_STYLE: React.CSSProperties = {
  fontSize: "16px",
  color: "var(--app-text-primary)",
};

const VALUE_STYLE: React.CSSProperties = {
  fontSize: "32px",
  color: "var(--app-text-primary)",
};

const VARIATION_STYLE: React.CSSProperties = {
  fontSize: "14px",
};

// Couleurs sémantiques liées aux CSS vars : flip automatique entre dark
// (#22C55E vif) et light (#16A34A profond) sans dupliquer la logique.
const COLOR_GREEN = "var(--app-success)";
const COLOR_RED = "var(--app-danger)";
const COLOR_GREY = "var(--app-text-tertiary)";

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
  bottomChrome,
}: KpiCardLayoutProps) {
  const definition = kpiId ? getKpiDefinition(kpiId) : null;
  // Nom officiel complet — joue le rôle de kicker (sur-titre gris en haut).
  // Affiché en mono UPPERCASE pour rester aligné sur le langage typo Vyzor
  // (le mono uppercase fonctionne bien à 10 px comme étiquette discrète).
  const resolvedFullName = (fullName ?? definition?.label ?? "").trim();
  const acronym = (title ?? "").trim();
  // Kicker masqué si l'acronyme est strictement identique au nom officiel
  // (case-insensitive, ex. "DSO" / "DSO" ou "ROE" / "ROE"). Sinon doublon
  // visuel inutile — l'acronyme bold suffit.
  const showKicker =
    resolvedFullName.length > 0 &&
    resolvedFullName.toLowerCase() !== acronym.toLowerCase();

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
      data-kpi-id={kpiId}
      {...interactiveProps}
    >
      {/* Ligne 1 — Kicker (nom officiel mono UPPERCASE 10 px gris) + tooltip ✨.
          Forcé en mono-ligne avec ellipsis : "Excédent brut d'exploitation",
          "Capacité de remboursement"… seraient sinon sur 2 lignes sur les
          cards étroites. Le `title` natif fait office de tooltip pour révéler
          le nom complet ; le KpiTooltip ✨ donne aussi la définition complète. */}
      <div className="flex items-start justify-between gap-2">
        <span
          className="min-w-0 flex-1 truncate font-mono uppercase"
          style={KICKER_STYLE}
          title={showKicker ? resolvedFullName : undefined}
        >
          {showKicker ? resolvedFullName : " "}
        </span>
        {kpiId && !disableTooltip ? <KpiTooltip kpiId={kpiId} value={value} /> : null}
      </div>

      {/* Ligne 2 — Acronyme (gras blanc 16 px). Court par construction → pas
          de risque de débordement. C'est le focal point visuel de la card. */}
      <h3
        className="font-bold leading-tight"
        style={{ ...HEADING_STYLE, marginTop: "4px" }}
      >
        {acronym}
      </h3>

      {/* Ligne 3 — Valeur principale (8 px sous titre) */}
      <div
        className="tnum data-react font-bold leading-none tracking-tight"
        style={{ ...VALUE_STYLE, marginTop: "8px" }}
      >
        {formattedValue}
      </div>

      {/* Ligne 4 — Variation conditionnelle (4 px sous valeur), rendue
          comme un pill/chip outline avec fond légèrement teinté de la
          couleur sémantique (vert / rouge / gris). Flèche diagonale style
          ↗ / ↘ au lieu du trend-line — visuellement plus iOS / Linear.
          `self-start` empêche le flex-col parent de l'étirer en pleine
          largeur. Ligne entière masquée si pas de previousValue exploitable. */}
      {variation ? (
        <div
          className="inline-flex items-center gap-1 self-start rounded-full border px-2 py-0.5 font-medium"
          style={{
            ...VARIATION_STYLE,
            fontSize: "12px",
            marginTop: "4px",
            color: variation.color,
            borderColor: `color-mix(in srgb, ${variation.color} 32%, transparent)`,
            backgroundColor: `color-mix(in srgb, ${variation.color} 9%, transparent)`,
          }}
        >
          {variation.direction === "up" ? (
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} />
          ) : variation.direction === "down" ? (
            <ArrowDownRight className="h-3.5 w-3.5" strokeWidth={2.25} />
          ) : null}
          <span>{variation.label}</span>
        </div>
      ) : null}

      {/* Ligne 5 — Indicateur de benchmark Vyzor (3 cercles horizontaux + label
          de position). Auto-résolu via le `kpiId` quand un mapping Vyzor existe
          pour ce KPI ; rien rendu sinon (graceful — KPIs banking, point_mort,
          healthScore...). Voir lib/benchmark/kpiMapping.ts pour la couverture.
          Le badge "Excellent / Critique" basé sur les seuils Vyzor a été
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

      {/* Décoration au bord bas — positionnée absolument à l'intérieur de
          l'article. L'inline style passe outre la règle globale
          `.precision-card > * { position: relative }` (cf. globals.css).
          Le `overflow: hidden` de l'article clippe automatiquement le contenu
          aux coins arrondis du `rounded-2xl`. */}
      {bottomChrome ? (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 2 }}>
          {bottomChrome}
        </div>
      ) : null}
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

