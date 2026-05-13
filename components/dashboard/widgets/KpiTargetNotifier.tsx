// File: components/dashboard/widgets/KpiTargetNotifier.tsx
// Role: surveille les KPIs vs alertes/objectifs définis et déclenche
// des toasts quand un seuil est franchi ou un objectif atteint. Les
// triggers sont persistés via `lastTriggeredAt` / `lastReachedAt` côté
// Firestore pour ne pas re-notifier sur chaque render.
//
// V1 : toast in-app simple avec auto-dismiss après 6 s. Pas de push
// browser ni email — c'est un terrain V2.

"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, CheckCircle, X } from "lucide-react";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import type { CalculatedKpis } from "@/types/analysis";
import type { KpiAlert, KpiObjective } from "@/types/kpiTargets";

type ToastEntry = {
  id: string;
  kind: "alert" | "objective";
  title: string;
  message: string;
};

type Props = {
  kpis: CalculatedKpis;
  alerts: KpiAlert[];
  objectives: KpiObjective[];
  /** Persistance des triggers — évite de re-notifier au prochain render. */
  onAlertTriggered?: (alert: KpiAlert) => void;
  onObjectiveReached?: (objective: KpiObjective) => void;
};

const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 h entre 2 notifs sur la même cible

function readKpi(kpis: CalculatedKpis, kpiId: string): number | null {
  const v = (kpis as unknown as Record<string, number | null | undefined>)[kpiId];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function recentlyTriggered(iso: string | undefined): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < COOLDOWN_MS;
}

export function KpiTargetNotifier({
  kpis, alerts, objectives, onAlertTriggered, onObjectiveReached,
}: Props) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Évalue alertes + objectifs à chaque changement de kpis.
  useEffect(() => {
    const newToasts: ToastEntry[] = [];

    for (const a of alerts) {
      if (!a.enabled) continue;
      if (recentlyTriggered(a.lastTriggeredAt)) continue;
      const value = readKpi(kpis, a.kpiId);
      if (value === null) continue;
      const triggered = a.condition === "above"
        ? value > a.threshold
        : value < a.threshold;
      if (!triggered) continue;
      const def = getKpiDefinition(a.kpiId);
      newToasts.push({
        id: `alert-${a.id}-${Date.now()}`,
        kind: "alert",
        title: a.label ?? `Alerte sur ${def?.shortLabel ?? a.kpiId}`,
        message: `${def?.label ?? a.kpiId} ${a.condition === "above" ? ">" : "<"} ${a.threshold} (valeur : ${value}).`,
      });
      onAlertTriggered?.(a);
    }

    for (const o of objectives) {
      if (!o.enabled) continue;
      if (recentlyTriggered(o.lastReachedAt)) continue;
      const value = readKpi(kpis, o.kpiId);
      if (value === null) continue;
      const reached = o.direction === "max"
        ? value >= o.target
        : value <= o.target;
      if (!reached) continue;
      const def = getKpiDefinition(o.kpiId);
      newToasts.push({
        id: `obj-${o.id}-${Date.now()}`,
        kind: "objective",
        title: o.label ?? `Objectif atteint : ${def?.shortLabel ?? o.kpiId}`,
        message: `${def?.label ?? o.kpiId} ${o.direction === "max" ? "≥" : "≤"} ${o.target} (valeur : ${value}).`,
      });
      onObjectiveReached?.(o);
    }

    if (newToasts.length === 0) return;
    setToasts((prev) => [...prev, ...newToasts]);

    // Auto-dismiss après 6 s.
    const timers = newToasts.map((t) =>
      window.setTimeout(() => dismiss(t.id), 6000),
    );
    return () => { timers.forEach((id) => window.clearTimeout(id)); };
  }, [kpis, alerts, objectives, onAlertTriggered, onObjectiveReached, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-2xl backdrop-blur ${
            t.kind === "alert"
              ? "border-rose-500/40 bg-rose-950/80 text-rose-100"
              : "border-emerald-500/40 bg-emerald-950/80 text-emerald-100"
          }`}
        >
          {t.kind === "alert" ? (
            <Bell className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold">{t.title}</p>
            <p className="mt-0.5 text-[11px] opacity-85">{t.message}</p>
          </div>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Fermer"
            className="shrink-0 rounded p-1 opacity-60 hover:bg-white/10 hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
