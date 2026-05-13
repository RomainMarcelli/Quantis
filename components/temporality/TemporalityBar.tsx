// File: components/temporality/TemporalityBar.tsx
// Role: barre de filtre temporel placée en sommet de page. Permet de choisir une granularité
// (jour / semaine / mois / trimestre / année) et de naviguer entre les périodes adjacentes.
// Le state est partagé via TemporalityProvider, donc tous les graphes/KPI de la page réagissent.
"use client";

import { ChevronLeft, ChevronRight, Calendar, AlertCircle } from "lucide-react";
import {
  GRANULARITY_LABEL,
  useTemporality,
  type Granularity,
} from "@/lib/temporality/temporalityContext";

const GRANULARITIES: Granularity[] = ["day", "week", "month", "quarter", "year"];

type TemporalityBarProps = {
  /**
   * Si true, la barre est affichée en mode compact (utilisée dans un header dense).
   */
  compact?: boolean;
  /**
   * Légende optionnelle à droite (ex. "Données dynamiques" / "Source statique").
   */
  rightLabel?: string;
  /**
   * Plage [minDate, maxDate] (ISO YYYY-MM-DD) des écritures disponibles dans
   * `dailyAccounting`. Quand fournie, on désactive les flèches qui pointeraient
   * en dehors de cette plage et on affiche un message "Aucune donnée" si la
   * période courante n'intersecte plus la plage.
   */
  availableRange?: { minDate: string; maxDate: string } | null;
  /**
   * Nombre de jours avec écritures dans la période courante. Sert à détecter
   * une période vide même quand elle est dans la plage globale (gap de données).
   */
  daysInPeriod?: number | null;
  /**
   * Brief 09/06/2026 : quand la barre est rendue à l'intérieur du AppHeader
   * (ligne 2 sticky), on supprime l'enveloppe `precision-card` pour éviter
   * l'effet "card dans card" (visuellement écrasé/entassé). La carte
   * extérieure du header fournit déjà le chrome.
   */
  flat?: boolean;
};

export function TemporalityBar({ compact = false, rightLabel, availableRange, daysInPeriod, flat = false }: TemporalityBarProps) {
  const t = useTemporality();

  // Bornes de navigation : si la période courante touche déjà la borne min/max
  // disponible, on désactive la flèche correspondante. Comparaison ISO string =
  // ordre lexicographique = ordre chronologique pour YYYY-MM-DD.
  const canGoPrevious =
    !availableRange || t.periodStart > availableRange.minDate;
  const canGoNext =
    !availableRange || t.periodEnd < availableRange.maxDate;

  // Période vide = on a une plage de données et la période sélectionnée est en
  // dehors (pas d'intersection) OU le compteur de jours actifs est 0.
  const isOutsideRange =
    !!availableRange &&
    (t.periodEnd < availableRange.minDate || t.periodStart > availableRange.maxDate);
  const hasNoData = isOutsideRange || daysInPeriod === 0;

  return (
    <div
      className={`flex flex-wrap items-center gap-3 ${
        flat
          ? compact
            ? "px-0 py-0"
            : "px-0 py-0"
          : `precision-card rounded-2xl ${compact ? "px-3 py-2" : "px-4 py-3"}`
      }`}
      data-scroll-reveal-ignore
    >
      <div className="flex items-center gap-2 text-white/60">
        <Calendar className="h-4 w-4" />
        <span className="text-xs uppercase tracking-wider">Période</span>
      </div>

      {/* Sélecteur de granularité */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
        {GRANULARITIES.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => t.setGranularity(g)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              t.granularity === g
                ? "bg-quantis-gold text-black"
                : "text-white/70 hover:bg-white/5"
            }`}
          >
            {GRANULARITY_LABEL[g]}
          </button>
        ))}
      </div>

      {/* Navigation entre périodes */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={canGoPrevious ? t.goPrevious : undefined}
          disabled={!canGoPrevious}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 ${
            canGoPrevious
              ? "bg-white/5 text-white/80 hover:bg-white/10"
              : "cursor-not-allowed bg-white/[0.02] text-white/25"
          }`}
          aria-label="Période précédente"
          title={canGoPrevious ? "Période précédente" : "Pas de données antérieures"}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={t.goToCurrent}
          className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
          title={`${t.periodStart} → ${t.periodEnd}`}
        >
          {t.periodLabel}
        </button>
        <button
          type="button"
          onClick={canGoNext ? t.goNext : undefined}
          disabled={!canGoNext}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 ${
            canGoNext
              ? "bg-white/5 text-white/80 hover:bg-white/10"
              : "cursor-not-allowed bg-white/[0.02] text-white/25"
          }`}
          aria-label="Période suivante"
          title={canGoNext ? "Période suivante" : "Pas de données ultérieures"}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Avertissement période sans données — prend la priorité visuelle sur la
          légende standard à droite, pour qu'un dirigeant ne lise pas des zéros
          comme une réalité. */}
      {hasNoData ? (
        <div className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">
          <AlertCircle className="h-3.5 w-3.5" />
          Aucune donnée sur cette période
        </div>
      ) : (
        rightLabel && <div className="ml-auto text-xs text-white/50">{rightLabel}</div>
      )}
    </div>
  );
}
