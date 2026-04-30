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
import {
  getKpiDiagnostic,
  type KpiDiagnostic,
} from "@/lib/kpi/kpiDiagnostic";
import { KpiTooltip } from "@/components/kpi/KpiTooltip";

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

  // ─── Badge de statut ─────────────────────────────────────────────────
  const diagnostic: KpiDiagnostic = getKpiDiagnostic(value, definition?.thresholds);
  const badge = buildStatusBadge(diagnostic);

  return (
    <article
      className={`precision-card group fade-up flex flex-col rounded-2xl p-6 ${className ?? ""}`}
      data-search-id={searchId}
    >
      {/* Ligne 1 — Header : nom complet uppercase + tooltip ✨ */}
      <div className="flex items-start justify-between">
        <span className="font-mono uppercase" style={HEADER_NAME_STYLE}>
          {resolvedFullName || " "}
        </span>
        {kpiId ? <KpiTooltip kpiId={kpiId} value={value} /> : null}
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

      {/* Ligne 5 — Badge de statut conditionnel (8 px sous variation).
          Format compact : icône + label court. Le détail textuel vit dans
          le KpiTooltip ✨ pour ne pas saturer la card. */}
      {badge ? (
        <div
          className="self-start"
          style={{
            marginTop: "8px",
            padding: "4px 8px",
            borderRadius: "4px",
            fontSize: "11px",
            fontWeight: 500,
            color: badge.color,
            backgroundColor: badge.background,
          }}
        >
          {badge.icon} {badge.label}
        </div>
      ) : null}

      {/* Slot extra — rendu sous le badge si fourni (jauge EBE, sparkline). */}
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

type StatusBadge = { label: string; icon: string; color: string; background: string };

/**
 * Badge compact selon le diagnostic. On affiche uniquement les statuts
 * extrêmes (good / danger) — la zone warning et neutral ne déclenchent
 * pas de badge pour garder la card propre.
 *
 * Le label est volontairement court et générique (Excellent / Critique)
 * — l'explication détaillée vit dans le KpiTooltip ✨ accessible au
 * survol. Évite la confusion "le badge dit < 0.15 mais ma valeur est 4 ?"
 * en supprimant la friction de la valeur de seuil dans le badge lui-même.
 */
function buildStatusBadge(diagnostic: KpiDiagnostic): StatusBadge | null {
  if (diagnostic === "good") {
    return {
      label: "Excellent",
      icon: "✓",
      color: COLOR_GREEN,
      background: "rgba(34,197,94,0.1)",
    };
  }
  if (diagnostic === "danger") {
    return {
      label: "Critique",
      icon: "⚠",
      color: COLOR_RED,
      background: "rgba(239,68,68,0.1)",
    };
  }
  // Zone intermédiaire (warning / neutral) → pas de badge.
  return null;
}
