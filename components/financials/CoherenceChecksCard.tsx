// File: components/financials/CoherenceChecksCard.tsx
// Role: carte de cohérence — réconciliation entre les états financiers
// affichés et les KPIs calculés en aval. Conçue pour l'expert-comptable :
// pictogramme + libellé + écart, sans surenchère de couleurs.
//
// Convention :
//   - statut "ok"      : check mark gris (réussite silencieuse — pas de
//     vert qui crierait "tout va bien" alors qu'on est juste cohérent)
//   - statut "warning" : ⚠ ambre (écart < 1% : arrondi, à connaître)
//   - statut "error"   : ✕ rose (écart > 1% : à investiguer)
//   - statut "na"      : tiret discret (donnée manquante)
"use client";

import { Check, Minus, AlertTriangle, X } from "lucide-react";
import type { CoherenceCheck } from "@/lib/financials/types";
import { formatAmount } from "@/components/financials/FinancialsCommon";

const STATUS_META: Record<
  CoherenceCheck["status"],
  { color: string; icon: typeof Check; label: string }
> = {
  ok: { color: "text-white/45", icon: Check, label: "Cohérent" },
  warning: { color: "text-amber-300", icon: AlertTriangle, label: "Vigilance" },
  error: { color: "text-rose-300", icon: X, label: "Écart" },
  na: { color: "text-white/30", icon: Minus, label: "N/D" },
};

export function CoherenceChecksCard({ checks }: { checks: CoherenceCheck[] }) {
  if (checks.length === 0) return null;

  const okCount = checks.filter((c) => c.status === "ok").length;
  const warnCount = checks.filter((c) => c.status === "warning").length;
  const errCount = checks.filter((c) => c.status === "error").length;
  const naCount = checks.filter((c) => c.status === "na").length;

  return (
    <article className="precision-card rounded-2xl px-5 py-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
            Cohérence comptable
          </p>
          <h2 className="mt-0.5 text-sm font-semibold tracking-wide text-white">
            Réconciliation états financiers ↔ KPIs
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5 font-mono text-[10px] uppercase tracking-wider">
          {okCount > 0 && (
            <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-white/65">
              {okCount} cohérent{okCount > 1 ? "s" : ""}
            </span>
          )}
          {warnCount > 0 && (
            <span className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-amber-300">
              {warnCount} vigilance
            </span>
          )}
          {errCount > 0 && (
            <span className="rounded-md border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-rose-300">
              {errCount} écart
            </span>
          )}
          {naCount > 0 && (
            <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-white/40">
              {naCount} N/D
            </span>
          )}
        </div>
      </header>

      <table className="w-full text-xs">
        <tbody>
          {checks.map((check) => {
            const meta = STATUS_META[check.status];
            const Icon = meta.icon;
            return (
              <tr key={check.id} className="border-b border-white/5 last:border-b-0">
                <td className="py-2 pr-2 align-top w-5">
                  <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                </td>
                <td className="py-2 pr-3 align-top">
                  <p className="text-white/85">{check.label}</p>
                  {check.detail ? (
                    <p className="mt-0.5 font-mono text-[10px] text-white/40">
                      {check.detail}
                    </p>
                  ) : null}
                </td>
                <td className="py-2 pl-3 text-right align-top font-mono tabular-nums whitespace-nowrap">
                  {check.delta !== undefined && check.status !== "ok" && check.status !== "na" ? (
                    <span className={meta.color}>Δ {formatAmount(check.delta)}</span>
                  ) : (
                    <span className={`text-[10px] uppercase tracking-wider ${meta.color}`}>
                      {meta.label}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}
