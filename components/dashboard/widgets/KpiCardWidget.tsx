// File: components/dashboard/widgets/KpiCardWidget.tsx
// Role: widget "valeur unique" — adapte KpiCardLayout pour le système de
// dashboards personnalisables. Lit le KPI dans le registre, formate selon
// son `unit`, propage les props standard (kpiId / value / previousValue)
// vers le layout commun.
"use client";

import { Bell, Target as TargetIcon } from "lucide-react";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatMonths,
  INSUFFICIENT_DATA_LABEL
} from "@/components/dashboard/formatting";
import { KpiCardLayout } from "@/components/kpi/KpiCardLayout";
import { getKpiDefinition, type KpiUnit } from "@/lib/kpi/kpiRegistry";
import type { CalculatedKpis } from "@/types/analysis";
import type { KpiAlert, KpiObjective } from "@/types/kpiTargets";

type KpiCardWidgetProps = {
  kpiId: string;
  kpis: CalculatedKpis;
  previousKpis?: CalculatedKpis | null;
  /** Si défini, la carte devient cliquable et affiche un anneau or quand
   *  sélectionnée — utilisée par les onglets dashboard pour piloter le
   *  graphique d'évolution top via clic sur card. */
  onSelect?: () => void;
  isSelected?: boolean;
  /** Mode édition : masque les overlays (tooltip ✨ + indicateur benchmark)
   *  pour ne pas distraire pendant la manipulation drag/resize. */
  isEditing?: boolean;
  /** Alertes définies par l'utilisateur sur ce KPI. Utilisées pour afficher
   *  un badge si une alerte est déclenchée. */
  alerts?: KpiAlert[];
  /** Objectifs définis par l'utilisateur sur ce KPI. Affiche une barre
   *  de progression sous la valeur. */
  objectives?: KpiObjective[];
};

export function KpiCardWidget({
  kpiId, kpis, previousKpis, onSelect, isSelected, isEditing,
  alerts = [], objectives = [],
}: KpiCardWidgetProps) {
  const definition = getKpiDefinition(kpiId);
  const value = readKpiValue(kpis, kpiId);
  const previousValue = previousKpis ? readKpiValue(previousKpis, kpiId) : null;

  const formatted = formatByUnit(value, definition?.unit ?? "currency");
  const title = definition?.shortLabel ?? kpiId;
  const tag = definition?.label ?? kpiId;

  // ── Évaluation des cibles utilisateur ──
  // Une alerte est déclenchée si la valeur actuelle franchit son seuil
  // dans le sens demandé. Pour les objectifs, on prend la 1re cible (V1
  // mono-objectif par KPI ; V2 pourrait afficher plusieurs barres).
  const triggeredAlert = value !== null
    ? alerts.find((a) =>
        a.condition === "above" ? value > a.threshold : value < a.threshold,
      )
    : undefined;
  const primaryObjective = objectives[0];
  const objectiveProgress = primaryObjective && value !== null
    ? computeObjectiveProgress(primaryObjective, value)
    : null;

  // Barre d'objectif passée via le slot `bottomChrome` du KpiCardLayout :
  // elle est rendue À L'INTÉRIEUR de l'article (qui a `overflow: hidden` +
  // `rounded-2xl`), donc clippée naturellement aux coins arrondis du card.
  // Au lieu d'un overlay sibling qui débordait visuellement.
  const objectiveBar = objectiveProgress && primaryObjective && value !== null ? (
    <ObjectiveEdgeBar
      progress={objectiveProgress}
      objective={primaryObjective}
      currentValue={value}
      unit={definition?.unit ?? "currency"}
    />
  ) : null;

  return (
    <div className="relative h-full">
      <KpiCardLayout
        kpiId={kpiId}
        fullName={tag}
        title={title}
        value={value}
        previousValue={previousValue}
        formattedValue={formatted}
        onSelect={onSelect}
        isSelected={isSelected}
        disableTooltip={isEditing}
        bottomChrome={objectiveBar}
      />

      {/* Badge alerte — coin haut-gauche, animation pulse pour signaler. */}
      {triggeredAlert ? (
        <div
          title={triggeredAlert.label ?? `Seuil ${triggeredAlert.condition === "above" ? ">" : "<"} ${triggeredAlert.threshold}`}
          className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-300 backdrop-blur"
        >
          <Bell className="h-3 w-3 animate-pulse" strokeWidth={2.5} />
          Alerte
        </div>
      ) : null}
    </div>
  );
}

// ─── Barre d'objectif au bord bas + tooltip survol ─────────────────────
// Rendue par le slot `bottomChrome` du KpiCardLayout — donc À L'INTÉRIEUR
// de l'article (qui a `overflow: hidden` + `rounded-2xl`). Le wrapper du
// slot applique le positionnement absolu ; ici on ne fait que peindre la
// barre + le tooltip dans un conteneur `relative` standard.
//
// Hauteur visuelle : 3 px (trait collé au bord). Zone de hover élargie à
// 12 px (`h-3 flex items-end`) pour faciliter le survol. États couleur :
//   - émeraude : objectif atteint (ratio ≥ 1)
//   - or       : en cours (ratio dans 0..1)
//   - gris     : ratio < 0 — la valeur est repartie en arrière vs baseline.
//                On évite le rouge qui dramatise — un gris doux suffit pour
//                dire "objectif défini, mais pas encore enclenché".
function ObjectiveEdgeBar({
  progress, objective, currentValue, unit,
}: {
  progress: { ratio: number; reached: boolean };
  objective: KpiObjective;
  currentValue: number;
  unit: KpiUnit;
}) {
  // Ratio négatif : on remplit la barre entièrement en gris doux —
  // signale "objectif défini mais valeur passée sous la baseline" sans
  // dramatiser. La distance numérique exacte reste dans le tooltip.
  const isNegative = !progress.reached && progress.ratio < 0;
  const fillPct = isNegative ? 100 : Math.min(100, Math.max(0, progress.ratio * 100));

  let fillColor: string;
  let glow: string;
  if (progress.reached) {
    fillColor = "bg-emerald-400";
    glow = "0 0 12px rgba(52, 211, 153, 0.7), 0 0 4px rgba(52, 211, 153, 0.95)";
  } else if (isNegative) {
    fillColor = "bg-white/35";
    glow = "0 0 6px rgba(255, 255, 255, 0.18)";
  } else {
    fillColor = "bg-quantis-gold";
    glow = "0 0 12px rgba(240, 201, 73, 0.7), 0 0 4px rgba(240, 201, 73, 0.95)";
  }

  const distance = computeDistance(currentValue, objective);
  const baselineLabel = typeof objective.baselineValue === "number"
    ? formatByUnit(objective.baselineValue, unit)
    : null;
  const targetLabel = formatByUnit(objective.target, unit);
  const distanceLabel = distance === null ? null : formatByUnit(Math.abs(distance), unit);

  return (
    <div className="group/objective relative flex h-3 items-end">
      {/* Track 3 px collée au bord. L'overflow-hidden + rounded-2xl du
          parent <article> gomme automatiquement les coins de la barre — on
          n'a donc PAS besoin de rounded-b-2xl sur la barre elle-même. */}
      <div className="h-[3px] w-full bg-white/10">
        <div
          className={`h-full transition-all duration-700 ${fillColor}`}
          style={{ width: `${fillPct}%`, boxShadow: glow }}
        />
      </div>

      {/* Tooltip — apparait au survol de la zone (12 px) ou de la barre.
          `pointer-events-none` quand invisible (sinon la zone fantôme du
          tooltip déclencherait l'apparition sans hover sur la barre).
          `pointer-events-auto` au hover → le curseur peut entrer dessus
          sans perdre l'état group-hover (sinon flicker au passage). */}
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-3 right-3 z-20 min-w-[210px] rounded-lg border border-white/10 bg-quantis-base/95 px-3 py-2 text-[11px] opacity-0 shadow-2xl backdrop-blur transition-opacity duration-150 group-hover/objective:pointer-events-auto group-hover/objective:opacity-100"
      >
        <div className="flex items-center gap-1.5">
          <TargetIcon className="h-3 w-3 text-quantis-gold" strokeWidth={2.5} />
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-quantis-gold">
            Objectif
          </span>
        </div>
        {objective.label ? (
          <p className="mt-1 font-semibold text-white">{objective.label}</p>
        ) : null}
        <p className="mt-1 text-white/85">
          Cible <span className="text-white/55">{objective.direction === "max" ? "≥" : "≤"}</span>{" "}
          <span className="tnum font-medium">{targetLabel}</span>
        </p>
        {baselineLabel ? (
          <p className="mt-0.5 text-[10px] text-white/45">
            Départ : <span className="tnum text-white/65">{baselineLabel}</span>
          </p>
        ) : null}
        {distance !== null && distanceLabel ? (
          <p className={`mt-0.5 text-[10px] ${
            progress.reached ? "text-emerald-300" : "text-white/55"
          }`}>
            {progress.reached
              ? `Atteint · +${distanceLabel}`
              : objective.direction === "max"
                ? `Reste ${distanceLabel} à atteindre`
                : `Dépassement de ${distanceLabel}`}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// Distance signée vers la cible — positive si on est "au-delà", négative
// si on est "en deçà". Pour l'affichage on utilise `Math.abs` + un libellé
// qui précise le sens.
function computeDistance(currentValue: number, objective: KpiObjective): number | null {
  if (!Number.isFinite(currentValue)) return null;
  if (objective.direction === "max") {
    return currentValue - objective.target;
  }
  return objective.target - currentValue;
}

// Calcule la progression de l'objectif relativement à sa baseline (valeur
// du KPI à l'instant T de la création de l'objectif). Sémantique unifiée :
//   ratio = (current − baseline) / (target − baseline)
//
// La même formule fonctionne pour les directions "max" (target > baseline,
// dénominateur > 0) et "min" (target < baseline, dénominateur < 0).
//   - 0   = on est à la baseline (point de départ)
//   - 1   = on a atteint la cible
//   - >1  = on a dépassé la cible
//   - <0  = on est reparti dans le mauvais sens vs baseline
//
// Backward-compat : si pas de baseline (objectifs créés avant le feature),
// on retombe sur 0 — ce qui reproduit le legacy `current/target` pour les
// directions "max".
function computeObjectiveProgress(
  obj: KpiObjective, currentValue: number,
): { ratio: number; reached: boolean } {
  const reached = obj.direction === "max"
    ? currentValue >= obj.target
    : currentValue <= obj.target;

  const baseline = typeof obj.baselineValue === "number" && Number.isFinite(obj.baselineValue)
    ? obj.baselineValue
    : 0;

  const denom = obj.target - baseline;
  if (denom === 0) {
    return { ratio: reached ? 1 : 0, reached };
  }
  const ratio = (currentValue - baseline) / denom;
  return { ratio, reached };
}

function readKpiValue(kpis: CalculatedKpis | null | undefined, kpiId: string): number | null {
  if (!kpis) return null;
  const value = (kpis as unknown as Record<string, number | null | undefined>)[kpiId];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatByUnit(value: number | null, unit: KpiUnit): string {
  if (value === null) return INSUFFICIENT_DATA_LABEL;
  switch (unit) {
    case "currency":
      return formatCurrency(value);
    case "percent":
      return formatPercent(value);
    case "days":
      return `${formatNumber(value, 1)} j`;
    case "ratio":
      return formatNumber(value, 2);
    case "score":
      return `${formatNumber(value, 0)} / 100`;
    default:
      // Fallback : si on rencontre une unit "mois" ou autre dans le registre,
      // on tombe sur formatMonths quand c'est cohérent. Sinon nombre simple.
      return unit === ("months" as KpiUnit) ? formatMonths(value) : formatNumber(value);
  }
}
