// File: components/simulation/SimulationWidget.tsx
// Role: widget de simulation What-If branché sur lib/simulation/simulationEngine.
// Affiche les leviers visibles d'un scénario sous forme de sliders, recalcule
// les KPIs en temps réel via runSimulation, et présente avant/après.
//
// Découplage : reçoit `mappedData` + `scenarioId` en props. Aucune connaissance
// du contexte parent (synthese vs analysis vs autre). L'ouverture/fermeture
// est gérée par le parent (modal, panneau latéral, page dédiée — au choix).
"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, X } from "lucide-react";
import {
  clampLeverDelta,
  computeDynamicLeverBounds,
  getSimulationScenario,
  runSimulation,
  SIMULATION_SCENARIOS,
  type LeverBounds,
  type SimulationLever,
} from "@/lib/simulation/simulationEngine";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import type { MappedFinancialData } from "@/types/analysis";

type SimulationWidgetProps = {
  mappedData: MappedFinancialData;
  /** Scénario à charger ; si absent, propose le sélecteur. */
  initialScenarioId?: string;
  /** Si présent : rend un bouton de fermeture. */
  onClose?: () => void;
};

const fmtCurrency = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function formatKpiValue(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (unit === "currency") return fmtCurrency.format(value);
  if (unit === "percent") return `${value.toFixed(1)} %`;
  if (unit === "days") return `${Math.round(value)} j`;
  if (unit === "ratio") return value.toFixed(2);
  if (unit === "score") return String(Math.round(value));
  return String(value);
}

function formatLeverValue(lever: SimulationLever, value: number): string {
  if (lever.type === "percent") return `${value > 0 ? "+" : ""}${value} %`;
  return `${value > 0 ? "+" : ""}${fmtCurrency.format(value)}`;
}

export function SimulationWidget({ mappedData, initialScenarioId, onClose }: SimulationWidgetProps) {
  const [scenarioId, setScenarioId] = useState<string>(
    initialScenarioId ?? SIMULATION_SCENARIOS[0]!.id
  );
  const scenario = getSimulationScenario(scenarioId);

  // Deltas par variableCode (visibles ET cachés). Initialisés depuis defaultDelta
  // de chaque levier au montage / changement de scénario.
  const [deltas, setDeltas] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    if (scenario) {
      for (const lever of scenario.levers) init[lever.variableCode] = lever.defaultDelta;
    }
    return init;
  });

  // Switch de scénario → réinitialise les deltas aux valeurs par défaut.
  function changeScenario(nextId: string) {
    const next = getSimulationScenario(nextId);
    if (!next) return;
    const init: Record<string, number> = {};
    for (const lever of next.levers) init[lever.variableCode] = lever.defaultDelta;
    setScenarioId(nextId);
    setDeltas(init);
  }

  // Si un levier est marqué hidden ET partage le defaultDelta avec un levier
  // visible (cf. cascade total_prod_expl dans hausse_prix), on synchronise leurs
  // deltas pour que le slider visible pilote bien tous les codes en cascade.
  function setLeverDelta(code: string, value: number) {
    setDeltas((prev) => {
      const next = { ...prev, [code]: value };
      if (!scenario) return next;
      // Sync : tout levier hidden qui a le même defaultDelta initial qu'un
      // levier visible suit la valeur du levier visible. C'est la convention
      // cascade utilisée par le moteur.
      const visible = scenario.levers.find((l) => l.variableCode === code && !l.hidden);
      if (visible) {
        for (const cascade of scenario.levers) {
          if (cascade.hidden && cascade.defaultDelta === visible.defaultDelta) {
            next[cascade.variableCode] = value;
          }
        }
      }
      return next;
    });
  }

  const result = useMemo(() => {
    if (!scenario) return null;
    return runSimulation(scenario, mappedData, deltas);
  }, [scenario, mappedData, deltas]);

  const visibleLevers = scenario?.levers.filter((l) => !l.hidden) ?? [];

  return (
    <div className="precision-card rounded-2xl border border-quantis-gold/20 bg-[#0e0e15] p-6 shadow-2xl">
      {/* Header — titre + bouton fermer */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-quantis-gold/70">Simulation What-If</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{scenario?.label ?? "Choisir un scénario"}</h3>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la simulation"
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-white/60 hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Sélecteur de scénario */}
      <div className="mb-4 flex flex-wrap gap-2">
        {SIMULATION_SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => changeScenario(s.id)}
            className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
              s.id === scenarioId
                ? "border-quantis-gold bg-quantis-gold text-black"
                : "border-white/10 bg-white/5 text-white/70 hover:border-quantis-gold/30 hover:bg-quantis-gold/10 hover:text-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Intro vulgarisée — explication du scénario en français simple, lue
          depuis simulationEngine.SimulationScenario.description. Donne le
          contexte avant que l'utilisateur touche aux sliders. */}
      {scenario ? (
        <div className="mb-5 rounded-xl border-l-2 border-l-quantis-gold/60 bg-quantis-gold/[0.04] px-4 py-3">
          <p className="text-[13px] leading-relaxed text-white/85">{scenario.description}</p>
        </div>
      ) : null}

      {/* Sliders des leviers visibles */}
      {scenario ? (
        <div className="grid gap-4 md:grid-cols-2">
          {visibleLevers.map((lever) => {
            const current = deltas[lever.variableCode] ?? lever.defaultDelta;
            // Bornes dynamiques calées sur la valeur réelle du mappedData :
            // pour un levier `absolute`, l'amplitude utile dépend de l'échelle
            // de l'entreprise. Pour un `percent`, on garde les bornes statiques.
            const baseValue = mappedData[lever.variableCode] as number | null;
            const bounds: LeverBounds = computeDynamicLeverBounds(lever, baseValue);
            const clampedCurrent = clampLeverDelta(current, bounds);
            // Estimation de l'impact monétaire du delta pour le sous-texte.
            const equivalentEur =
              lever.type === "percent" && typeof baseValue === "number"
                ? (baseValue * clampedCurrent) / 100
                : null;
            return (
              <div
                key={lever.variableCode}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`lever-${lever.variableCode}`}
                    className="text-xs font-medium text-white/85"
                  >
                    {lever.label}
                  </label>
                  <span className="font-mono text-[13px] font-semibold text-quantis-gold">
                    {formatLeverValue(lever, clampedCurrent)}
                  </span>
                </div>
                <input
                  id={`lever-${lever.variableCode}`}
                  type="range"
                  min={bounds.min}
                  max={bounds.max}
                  step={bounds.step}
                  value={clampedCurrent}
                  onChange={(e) => setLeverDelta(lever.variableCode, Number(e.target.value))}
                  className="w-full accent-[#C5A059]"
                />
                <div className="mt-1 flex justify-between font-mono text-[10px] text-white/35">
                  <span>{formatLeverValue(lever, bounds.min)}</span>
                  <span>{formatLeverValue(lever, bounds.max)}</span>
                </div>
                {/* Sous-texte explicatif : valeur de base + équivalent monétaire
                    de la variation. Aide à comprendre l'impact concret du slider. */}
                <p className="mt-2 font-mono text-[10px] leading-relaxed text-white/45">
                  Valeur actuelle :{" "}
                  <span className="text-white/70">
                    {typeof baseValue === "number" ? fmtCurrency.format(baseValue) : "—"}
                  </span>
                  . Variation simulée :{" "}
                  <span className="text-white/70">{formatLeverValue(lever, clampedCurrent)}</span>
                  {equivalentEur !== null ? (
                    <>
                      {" "}
                      ({equivalentEur >= 0 ? "+" : ""}
                      {fmtCurrency.format(equivalentEur)})
                    </>
                  ) : null}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Résultats — KPIs avant / après */}
      {result ? (
        <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-4">
          <p className="mb-3 text-[10px] font-mono uppercase tracking-wider text-white/45">
            Impact estimé sur les KPIs
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {result.diffs.map((diff) => {
              const def = getKpiDefinition(diff.kpi);
              if (!def) return null;
              const isImprovement =
                diff.deltaAbsolute === null
                  ? null
                  : isHigherBetter(def.id) ? diff.deltaAbsolute > 0 : diff.deltaAbsolute < 0;
              const arrow =
                isImprovement === null ? <ArrowRight className="h-3.5 w-3.5 text-white/40" /> : isImprovement ? (
                  <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5 text-rose-400" />
                );
              const color =
                isImprovement === null ? "text-white" : isImprovement ? "text-emerald-400" : "text-rose-400";
              return (
                <div key={String(diff.kpi)} className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[11px] uppercase tracking-wider text-white/55">
                      {def.shortLabel}
                    </p>
                    <div className="mt-0.5 flex items-baseline gap-2 text-sm">
                      <span className="text-white/60">{formatKpiValue(diff.before, def.unit)}</span>
                      {arrow}
                      <span className={`font-semibold ${color}`}>{formatKpiValue(diff.after, def.unit)}</span>
                    </div>
                  </div>
                  {diff.deltaPercent !== null && Number.isFinite(diff.deltaPercent) ? (
                    <span className={`font-mono text-[11px] ${color}`}>
                      {diff.deltaPercent > 0 ? "+" : ""}
                      {diff.deltaPercent.toFixed(1)} %
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] italic text-white/35">
            Les variations sont calculées avec les mêmes formules que le dashboard (zéro nouvelle hypothèse). Cf. lib/simulation/simulationEngine.ts pour les limites connues.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// Convention "plus grand = mieux" pour la majorité des KPIs flux ; les KPIs
// délais (DSO, DPO, point_mort) ou de dette (gearing) sont "plus petit = mieux".
// On lit cette intuition directement depuis les seuils du registre quand ils
// existent ; à défaut on suppose ascendant.
function isHigherBetter(kpiId: string): boolean {
  const def = getKpiDefinition(kpiId);
  if (!def?.thresholds) return true;
  const t = def.thresholds;
  if (t.danger !== undefined && t.warning !== undefined && t.good !== undefined) {
    return t.danger <= t.warning && t.warning <= t.good;
  }
  // Si seul `danger` est fourni (ex. EBITDA, CAF avec danger=0), c'est un seuil
  // bas → plus grand = mieux.
  return true;
}

/**
 * Bouton compact qui ouvre le widget en panneau modal. Pratique à câbler
 * dans la page Synthèse ou Tableau de bord.
 */
export function SimulationToggleButton({
  mappedData,
  initialScenarioId,
}: {
  mappedData: MappedFinancialData;
  initialScenarioId?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-quantis-gold/30 bg-quantis-gold/10 px-4 py-2 text-xs font-semibold text-quantis-gold transition hover:bg-quantis-gold/20"
      >
        <span aria-hidden>✨</span>
        Simuler un scénario
      </button>
    );
  }
  return (
    <SimulationWidget
      mappedData={mappedData}
      initialScenarioId={initialScenarioId}
      onClose={() => setOpen(false)}
    />
  );
}

// Helpers exposés pour les tests d'affichage (le moteur de calcul est déjà
// couvert par lib/simulation/simulationEngine.test.ts — 16 tests).
export const __testHelpers = {
  formatKpiValue,
  formatLeverValue,
  isHigherBetter,
};
