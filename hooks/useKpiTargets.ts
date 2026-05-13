// File: hooks/useKpiTargets.ts
// Role: hook React qui charge les alertes + objectifs de l'utilisateur,
// expose des helpers add/update/delete, et fournit les fonctions
// d'évaluation (alert triggered ?  objective reached ? progress ratio).
//
// Le hook fait du chargement initial puis garde les données en mémoire ;
// les modifs sont réévaluées en local (optimistic update) puis persistées
// en Firestore. Pas de subscription temps réel pour V1 — un reload manuel
// suffit si l'utilisateur édite depuis 2 onglets.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteAlert as fbDeleteAlert,
  deleteObjective as fbDeleteObjective,
  listAlerts, listObjectives,
  saveAlert as fbSaveAlert,
  saveObjective as fbSaveObjective,
} from "@/services/kpiTargetsStore";
import type {
  AlertEvaluation, KpiAlert, KpiObjective, ObjectiveProgress,
} from "@/types/kpiTargets";

export type UseKpiTargetsResult = {
  alerts: KpiAlert[];
  objectives: KpiObjective[];
  isLoading: boolean;
  /** Recherche les alertes / objectifs définis pour un kpiId donné. */
  alertsForKpi: (kpiId: string) => KpiAlert[];
  objectivesForKpi: (kpiId: string) => KpiObjective[];
  /** Évalue une alerte vs la valeur courante (true si déclenchée). */
  evaluateAlert: (alert: KpiAlert, currentValue: number | null) => AlertEvaluation;
  /** Évalue un objectif vs la valeur courante (ratio + reached). */
  evaluateObjective: (objective: KpiObjective, currentValue: number | null) => ObjectiveProgress;
  /** Enregistre une alerte (création ou mise à jour) avec optimistic update. */
  saveAlert: (alert: Omit<KpiAlert, "id"> & { id?: string }) => Promise<KpiAlert>;
  saveObjective: (objective: Omit<KpiObjective, "id"> & { id?: string }) => Promise<KpiObjective>;
  removeAlert: (id: string) => Promise<void>;
  removeObjective: (id: string) => Promise<void>;
};

export function useKpiTargets(userId: string | null): UseKpiTargetsResult {
  const [alerts, setAlerts] = useState<KpiAlert[]>([]);
  const [objectives, setObjectives] = useState<KpiObjective[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Initial load
  useEffect(() => {
    if (!userId) {
      setAlerts([]);
      setObjectives([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const [a, o] = await Promise.all([listAlerts(userId), listObjectives(userId)]);
        if (cancelled) return;
        setAlerts(a);
        setObjectives(o);
      } catch (err) {
        console.warn("[kpi-targets] load failed", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const alertsForKpi = useCallback(
    (kpiId: string) => alerts.filter((a) => a.kpiId === kpiId && a.enabled),
    [alerts],
  );

  const objectivesForKpi = useCallback(
    (kpiId: string) => objectives.filter((o) => o.kpiId === kpiId && o.enabled),
    [objectives],
  );

  const evaluateAlert = useCallback((alert: KpiAlert, currentValue: number | null): AlertEvaluation => {
    if (currentValue === null || !Number.isFinite(currentValue)) {
      return { alert, currentValue, triggered: false };
    }
    const triggered = alert.condition === "above"
      ? currentValue > alert.threshold
      : currentValue < alert.threshold;
    return { alert, currentValue, triggered };
  }, []);

  const evaluateObjective = useCallback((objective: KpiObjective, currentValue: number | null): ObjectiveProgress => {
    if (currentValue === null || !Number.isFinite(currentValue)) {
      return { objective, currentValue, ratio: null, reached: false };
    }
    if (objective.direction === "max") {
      const ratio = objective.target !== 0 ? currentValue / objective.target : 0;
      return { objective, currentValue, ratio, reached: currentValue >= objective.target };
    }
    // "min" : on veut être SOUS la cible (ex. dette < 100k)
    // ratio = inverse — on est à 100% quand value <= target.
    const ratio = currentValue <= objective.target
      ? 1
      : objective.target !== 0 ? Math.max(0, 1 - (currentValue - objective.target) / Math.abs(objective.target)) : 0;
    return { objective, currentValue, ratio, reached: currentValue <= objective.target };
  }, []);

  const saveAlert = useCallback(async (alert: Omit<KpiAlert, "id"> & { id?: string }) => {
    if (!userId) throw new Error("Pas de userId");
    const saved = await fbSaveAlert(userId, alert);
    setAlerts((prev) => {
      const without = prev.filter((a) => a.id !== saved.id);
      return [...without, saved];
    });
    return saved;
  }, [userId]);

  const saveObjective = useCallback(async (objective: Omit<KpiObjective, "id"> & { id?: string }) => {
    if (!userId) throw new Error("Pas de userId");
    const saved = await fbSaveObjective(userId, objective);
    setObjectives((prev) => {
      const without = prev.filter((o) => o.id !== saved.id);
      return [...without, saved];
    });
    return saved;
  }, [userId]);

  const removeAlert = useCallback(async (id: string) => {
    if (!userId) return;
    await fbDeleteAlert(userId, id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, [userId]);

  const removeObjective = useCallback(async (id: string) => {
    if (!userId) return;
    await fbDeleteObjective(userId, id);
    setObjectives((prev) => prev.filter((o) => o.id !== id));
  }, [userId]);

  return useMemo(() => ({
    alerts, objectives, isLoading,
    alertsForKpi, objectivesForKpi,
    evaluateAlert, evaluateObjective,
    saveAlert, saveObjective, removeAlert, removeObjective,
  }), [
    alerts, objectives, isLoading,
    alertsForKpi, objectivesForKpi,
    evaluateAlert, evaluateObjective,
    saveAlert, saveObjective, removeAlert, removeObjective,
  ]);
}
