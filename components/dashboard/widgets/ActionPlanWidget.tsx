// File: components/dashboard/widgets/ActionPlanWidget.tsx
// Role: widget "Plan d'action détaillé" — liste les actions du SyntheseViewModel.
// Reprend l'ancienne section "Plan d'action détaillé" du cockpit synthese.
"use client";

import { Lightbulb } from "lucide-react";

type ActionPlanWidgetProps = {
  actions: string[];
};

export function ActionPlanWidget({ actions }: ActionPlanWidgetProps) {
  return (
    <article className="precision-card fade-up h-full rounded-2xl p-5">
      <div className="card-header flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-quantis-gold" />
        <h2 className="text-xl font-semibold text-white">Plan d&apos;action détaillé</h2>
      </div>
      {actions.length === 0 ? (
        <p className="mt-3 text-xs text-white/55">
          Aucune action recommandée — la trajectoire actuelle est saine.
        </p>
      ) : (
        <ul className="space-y-2">
          {actions.map((action, index) => (
            <li
              key={`${action}-${index}`}
              className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/80"
            >
              {action}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
