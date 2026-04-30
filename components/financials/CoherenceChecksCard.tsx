// File: components/financials/CoherenceChecksCard.tsx
// Role: carte d'état de cohérence — affiche les checks (bilan équilibré,
// EBIT calculé vs mappé, CA vs KPI, résultat net cohérent, EBITDA cohérent).
//
// Sert de double-contrôle visuel : si un check est rouge, c'est qu'une
// donnée comptable et un KPI affiché par l'app divergent → soit le
// mapping a un bug, soit l'analyse a un poste manquant. Dans tous les
// cas le PM doit pouvoir le voir d'un coup d'œil.
"use client";

import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import type { CoherenceCheck } from "@/lib/financials/types";
import { formatAmount } from "@/components/financials/FinancialsCommon";

const STATUS_META: Record<
  CoherenceCheck["status"],
  { color: string; bg: string; border: string; icon: typeof CheckCircle2; label: string }
> = {
  ok: {
    color: "text-emerald-300",
    bg: "bg-emerald-500/[0.06]",
    border: "border-emerald-400/30",
    icon: CheckCircle2,
    label: "OK",
  },
  warning: {
    color: "text-amber-300",
    bg: "bg-amber-500/[0.08]",
    border: "border-amber-400/30",
    icon: AlertTriangle,
    label: "Vigilance",
  },
  error: {
    color: "text-rose-300",
    bg: "bg-rose-500/[0.08]",
    border: "border-rose-400/30",
    icon: XCircle,
    label: "Écart",
  },
  na: {
    color: "text-white/55",
    bg: "bg-white/[0.03]",
    border: "border-white/10",
    icon: HelpCircle,
    label: "N/D",
  },
};

export function CoherenceChecksCard({ checks }: { checks: CoherenceCheck[] }) {
  const okCount = checks.filter((c) => c.status === "ok").length;
  const warnCount = checks.filter((c) => c.status === "warning").length;
  const errCount = checks.filter((c) => c.status === "error").length;
  const naCount = checks.filter((c) => c.status === "na").length;

  return (
    <article className="precision-card rounded-2xl bg-[#0F0F12] p-5">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-white/45">
            Vérifications de cohérence
          </p>
          <h2 className="text-sm font-semibold text-white">
            États financiers vs KPIs calculés
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[10px] font-mono uppercase">
          {okCount > 0 && (
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
              {okCount} OK
            </span>
          )}
          {warnCount > 0 && (
            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-amber-300">
              {warnCount} vigilance
            </span>
          )}
          {errCount > 0 && (
            <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-rose-300">
              {errCount} écart
            </span>
          )}
          {naCount > 0 && (
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/55">
              {naCount} N/D
            </span>
          )}
        </div>
      </header>

      <ul className="space-y-2">
        {checks.map((check) => {
          const meta = STATUS_META[check.status];
          const Icon = meta.icon;
          return (
            <li
              key={check.id}
              className={`flex items-start gap-3 rounded-lg border ${meta.border} ${meta.bg} p-2.5`}
            >
              <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${meta.color}`} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-white">{check.label}</p>
                {check.detail ? (
                  <p className="mt-0.5 font-mono text-[10px] text-white/55">{check.detail}</p>
                ) : null}
              </div>
              {check.delta !== undefined && check.status !== "ok" ? (
                <span
                  className={`flex-shrink-0 rounded-md px-2 py-0.5 font-mono text-[10px] ${meta.color}`}
                  title="Écart entre les deux sources"
                >
                  Δ {formatAmount(check.delta)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[10px] italic text-white/45">
        Toute valeur en orange (vigilance) ou rouge (écart) signale une divergence entre le 2033-SD
        mappé et le KPI affiché — souvent due à un poste manquant côté parser.
      </p>
    </article>
  );
}
