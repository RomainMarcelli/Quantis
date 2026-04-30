// File: components/kpi/KpiCardLayout.tsx
// Role: layout uniforme des cartes KPI sur tout le dashboard. Source unique
// pour : header (nom complet uppercase + KpiTooltip), titre vulgarisé,
// valeur principale, ligne de variation période-vs-période, badge de
// diagnostic conditionnel.
//
// Spec visuelle (haut → bas, espacements demandés en commentaire) :
//   1. Header :
//       gauche  : nom complet UPPERCASE — 10 px / letter-spacing 0.05 em /
//                 #9CA3AF
//       droite  : KpiTooltip ✨ (existant)
//   2. (gap 4 px) Titre vulgarisé — 16 px / bold / #FFFFFF
//   3. (gap 8 px) Valeur principale — 32 px / bold / #FFFFFF
//   4. (gap 4 px) Variation conditionnelle — flèche + % + couleur selon sens
//                 (n'apparaît que si previousValue dispo et != 0)
//   5. (gap 8 px) Badge de statut conditionnel — uniquement si diagnostic
//                 = "good" ou "danger" (zone intermédiaire warning / neutral
//                 = pas de badge)
//
// L'idée : la carte se contracte naturellement quand les éléments
// conditionnels ne s'affichent pas — pas de placeholder vide.
//
// Convention d'usage : ce composant est appelé par KPIBlock, KPIWide et
// les MetricCard de chaque onglet. Le contenu spécifique à une carte
// (jauge de progression EBE, badge de tendance custom, etc.) est passé
// via le slot `extra` qui se rend SOUS le badge de statut.
"use client";

import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import {
  getKpiDiagnostic,
  isHigherBetter,
  type KpiDiagnostic,
} from "@/lib/kpi/kpiDiagnostic";
import { KpiTooltip } from "@/components/kpi/KpiTooltip";

export type KpiCardLayoutProps = {
  /** Identifiant du KPI dans le registre — pilote tooltip + diagnostic + nom complet. */
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
   * Valeur du même KPI sur la période précédente. Si fournie ET non-nulle
   * ET non-zéro, on affiche la ligne de variation. Sinon, ligne masquée.
   */
  previousValue?: number | null;
  /**
   * Slot optionnel rendu SOUS le badge de statut (ex. jauge de progression
   * EBE dans KPIWide, sparkline custom, barre actif/passif…). Hérite du
   * gap de 8 px par défaut.
   */
  extra?: ReactNode;
  /** ID pour la barre de recherche globale. */
  searchId?: string;
  /** Classe CSS additionnelle pour ajuster la taille de la card. */
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
const COLOR_GREY = "#6B7280";

const BADGE_MAX_LENGTH = 40;

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

  // ─── Variation période-vs-période ───────────────────────────────────
  // On masque si previousValue n'est pas exploitable (null / undefined /
  // 0 / NaN). 0 est traité comme absent : un % de variation depuis 0 est
  // mathématiquement infini, sans valeur informative pour le dirigeant.
  const variation =
    typeof value === "number" &&
    Number.isFinite(value) &&
    typeof previousValue === "number" &&
    Number.isFinite(previousValue) &&
    previousValue !== 0
      ? computeVariation(value, previousValue, definition?.thresholds)
      : null;

  // ─── Badge de statut ────────────────────────────────────────────────
  const diagnostic: KpiDiagnostic = getKpiDiagnostic(value, definition?.thresholds);
  const badge = buildStatusBadge(diagnostic, definition);

  return (
    <article
      className={`precision-card group fade-up flex flex-col rounded-2xl p-6 ${className ?? ""}`}
      data-search-id={searchId}
    >
      {/* Ligne 1 — Header : nom complet uppercase + tooltip ✨ */}
      <div className="flex items-start justify-between">
        <span className="font-mono uppercase" style={HEADER_NAME_STYLE}>
          {resolvedFullName || " "}
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

      {/* Ligne 4 — Variation conditionnelle (4 px sous valeur) */}
      {variation ? (
        <div
          className="flex items-center gap-1.5 font-medium"
          style={{ ...VARIATION_STYLE, marginTop: "4px", color: variation.color }}
        >
          {variation.direction === "up" ? (
            <TrendingUp className="h-4 w-4" />
          ) : variation.direction === "down" ? (
            <TrendingDown className="h-4 w-4" />
          ) : (
            <span aria-hidden>—</span>
          )}
          <span>{variation.label}</span>
        </div>
      ) : null}

      {/* Ligne 5 — Badge de statut conditionnel (8 px sous variation) */}
      {badge ? (
        <div
          className="self-start"
          style={{
            marginTop: "8px",
            padding: "4px 8px",
            borderRadius: "4px",
            fontSize: "11px",
            color: badge.color,
            backgroundColor: badge.background,
          }}
        >
          {badge.message}
        </div>
      ) : null}

      {/* Slot extra — rendu sous le badge (8 px) si fourni. Sert aux
          cards qui ont du contenu spécifique (jauge EBE, sparkline…). */}
      {extra ? <div style={{ marginTop: "8px" }}>{extra}</div> : null}
    </article>
  );
}

// ─── Helpers internes ────────────────────────────────────────────────

type Variation = { label: string; color: string; direction: "up" | "down" | "flat" };

function computeVariation(
  current: number,
  previous: number,
  thresholds: ReturnType<typeof getKpiDefinition> extends infer T
    ? T extends { thresholds?: infer U }
      ? U
      : undefined
    : undefined
): Variation {
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  // Format : +12,3% ou -8,1%, virgule décimale FR, signe + explicite pour positifs
  const rounded = Math.abs(pct) < 0.05 ? 0 : pct;
  const formatted = `${rounded >= 0 ? "+" : ""}${rounded.toFixed(1).replace(".", ",")}%`;

  // Direction visuelle (flèche).
  const direction: "up" | "down" | "flat" =
    rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";

  // Couleur selon sens KPI : si "plus grand = mieux" et delta > 0 → vert.
  // Si "plus petit = mieux" et delta < 0 → vert. Sinon rouge. delta nul → gris.
  if (rounded === 0) return { label: formatted, color: COLOR_GREY, direction };

  const higherBetter = isHigherBetter(thresholds);
  if (higherBetter === null) {
    // Convention d'incertitude : on n'attribue pas de jugement faute de
    // référence ; affichage gris pour rester neutre.
    return { label: formatted, color: COLOR_GREY, direction };
  }
  const goingRightWay =
    higherBetter ? rounded > 0 : rounded < 0;
  return {
    label: formatted,
    color: goingRightWay ? COLOR_GREEN : COLOR_RED,
    direction,
  };
}

type StatusBadge = { message: string; color: string; background: string };

function buildStatusBadge(
  diagnostic: KpiDiagnostic,
  definition: ReturnType<typeof getKpiDefinition>
): StatusBadge | null {
  if (!definition) return null;
  if (diagnostic === "good") {
    return {
      message: truncate(definition.tooltip.goodSign, BADGE_MAX_LENGTH),
      color: COLOR_GREEN,
      background: "rgba(34,197,94,0.1)",
    };
  }
  if (diagnostic === "danger") {
    return {
      message: truncate(definition.tooltip.badSign, BADGE_MAX_LENGTH),
      color: COLOR_RED,
      background: "rgba(239,68,68,0.1)",
    };
  }
  // Zone intermédiaire (warning / neutral) → pas de badge, carte clean.
  return null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  // On coupe sur un espace si possible pour éviter de casser un mot.
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd() + "…";
}
