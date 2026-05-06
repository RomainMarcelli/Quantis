// File: components/dashboard/widgets/AlertsWidget.tsx
// Role: widget "Alertes" — liste les alertes du SyntheseViewModel avec un
// code couleur par sévérité. Reprend la mise en page de l'ancienne section
// "Alertes" du cockpit.
"use client";

import { AlertTriangle } from "lucide-react";
import type { SyntheseAlert } from "@/lib/synthese/syntheseViewModel";

type AlertsWidgetProps = {
  alerts: SyntheseAlert[];
};

function severityClass(severity: SyntheseAlert["severity"]): string {
  if (severity === "high") {
    return "border-rose-400/35 bg-rose-500/15 text-rose-100";
  }
  if (severity === "medium") {
    return "border-amber-300/35 bg-amber-500/15 text-amber-100";
  }
  return "border-emerald-300/35 bg-emerald-500/15 text-emerald-100";
}

export function AlertsWidget({ alerts }: AlertsWidgetProps) {
  return (
    <article className="precision-card fade-up h-full rounded-2xl p-5">
      <div className="card-header flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-300" />
        <h2 className="text-xl font-semibold text-white">Alertes</h2>
      </div>
      {alerts.length === 0 ? (
        <p className="mt-3 text-xs text-white/55">Aucune alerte sur la période.</p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className={`rounded-xl border px-3 py-2 text-sm ${severityClass(alert.severity)}`}
            >
              {alert.label}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
