// File: types/kpiTargets.ts
// Role: schémas des cibles utilisateur sur les KPIs — alertes (seuils
// de vigilance qui déclenchent une notif quand franchis) et objectifs
// (cibles à atteindre, avec une barre de progression).

/** Sens de la condition pour une alerte. */
export type KpiAlertCondition = "above" | "below";

/**
 * Alerte sur un KPI : déclenche une notification quand la valeur
 * courante franchit le seuil (above = devient supérieure, below = devient
 * inférieure). Une alerte = un KPI = un seuil — pour deux alertes sur le
 * même KPI, deux entrées distinctes.
 */
export type KpiAlert = {
  id: string;
  /** id du KPI dans le registre (lib/kpi/kpiRegistry.ts). */
  kpiId: string;
  condition: KpiAlertCondition;
  /** Seuil exprimé dans l'unité du KPI (€, %, ratio…). */
  threshold: number;
  /** Libellé court affiché dans la notif. Optionnel. */
  label?: string;
  enabled: boolean;
  /** ISO timestamp — last time the alert was triggered (anti-spam). */
  lastTriggeredAt?: string;
  createdAt?: string;
};

/** Sens d'optimisation pour un objectif. */
export type KpiObjectiveDirection = "max" | "min";

/**
 * Objectif sur un KPI : cible chiffrée à atteindre. La progression est
 * affichée via une barre qui se remplit jusqu'à la valeur courante.
 *  - direction "max" : on veut value >= target (ex. CA, EBE, marge)
 *  - direction "min" : on veut value <= target (ex. dette, DSO)
 */
export type KpiObjective = {
  id: string;
  kpiId: string;
  target: number;
  direction: KpiObjectiveDirection;
  label?: string;
  /** Date butoir optionnelle (YYYY-MM-DD). */
  deadline?: string;
  enabled: boolean;
  /** ISO timestamp — last time the objective was reached. */
  lastReachedAt?: string;
  createdAt?: string;
  /**
   * Valeur du KPI au moment où l'objectif a été défini. Sert de point
   * de départ ("baseline") pour la barre de progression : 0 % = baseline,
   * 100 % = target. Sans cette valeur, on retombe sur le legacy (baseline
   * implicite à 0). Définie une seule fois à la création — ne bouge pas
   * quand la valeur courante change.
   */
  baselineValue?: number;
};

/** Résultat de l'évaluation d'un objectif vs la valeur courante. */
export type ObjectiveProgress = {
  objective: KpiObjective;
  /** Valeur courante du KPI. null si indisponible. */
  currentValue: number | null;
  /** Ratio 0..1 (peut dépasser 1 si l'objectif est dépassé). */
  ratio: number | null;
  reached: boolean;
};

/** Évaluation d'une alerte : a-t-elle été franchie ? */
export type AlertEvaluation = {
  alert: KpiAlert;
  currentValue: number | null;
  triggered: boolean;
};
