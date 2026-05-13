// File: components/dashboard/widgets/BfrCycleWidget.tsx
// Role: widget "Pilotage du cycle d'exploitation" — bloc qui agrège la
// rotation BFR (en haut) + un trio DSO / DIO / DPO en dessous. Reprend
// la mise en page du bloc inline historique d'InvestmentTest.
"use client";

import type { ReactNode } from "react";
import { Package, Truck, Users } from "lucide-react";
import { INSUFFICIENT_DATA_LABEL } from "@/components/dashboard/formatting";
import { KpiTooltip } from "@/components/kpi/KpiTooltip";
import { KpiBenchmarkAutoIndicator } from "@/components/synthese/KpiBenchmarkAutoIndicator";
import type { CalculatedKpis } from "@/types/analysis";

// Au-delà de ce seuil, un délai en jours est considéré anormal (cas pathologique
// ou dénominateur trop petit) — on bascule l'affichage en rose + message court.
const ANOMALY_DAYS_THRESHOLD = 365;
const RECEIVABLES_ANOMALY = "Valeur anormale — vérifiez vos encaissements";
const PAYABLES_ANOMALY = "Valeur anormale — vérifiez vos décaissements fournisseurs";
const INVENTORY_ANOMALY = "Valeur anormale — vérifiez la rotation des stocks";
const BFR_ANOMALY = "Valeur anormale — vérifiez la cohérence du cycle d'exploitation";

type Props = {
  kpis: CalculatedKpis;
};

export function BfrCycleWidget({ kpis }: Props) {
  return (
    <article className="precision-card group flex h-full flex-col rounded-2xl p-6">
      <div className="card-header mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Pilotage du cycle d&apos;exploitation</h3>
          <div className="mt-2 flex items-center gap-2">
            <span className="tech-tag text-[10px] font-mono uppercase text-white/60">
              Ratio de rotation du BFR (jours)
            </span>
            <span className="text-[10px] font-mono text-white/35">CYCLE_SPEED</span>
            <KpiTooltip kpiId="rot_bfr" value={kpis.rot_bfr} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p
            className={
              kpis.rot_bfr !== null && Math.abs(kpis.rot_bfr) > ANOMALY_DAYS_THRESHOLD
                ? "tnum text-3xl font-semibold tracking-tight text-rose-400"
                : "tnum text-3xl font-semibold tracking-tight text-white"
            }
          >
            {kpis.rot_bfr === null ? INSUFFICIENT_DATA_LABEL : `${Math.round(kpis.rot_bfr)} jours`}
          </p>
          {kpis.rot_bfr !== null && Math.abs(kpis.rot_bfr) > ANOMALY_DAYS_THRESHOLD ? (
            <p className="rounded border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-300">
              ⚠ {BFR_ANOMALY}
            </p>
          ) : null}
          <KpiBenchmarkAutoIndicator kpiId="rot_bfr" value={kpis.rot_bfr} kpiLabel="Rotation BFR" />
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3">
        <DelayCard
          title="Délai clients (DSO)"
          value={kpis.dso === null ? INSUFFICIENT_DATA_LABEL : `${Math.round(kpis.dso)} j`}
          icon={<Users className="h-4 w-4 text-amber-400/70" />}
          hint="Temps moyen d'encaissement des factures clients."
          badgeLabel="↘ À réduire"
          badgeTone="warning"
          anomaly={
            kpis.dso !== null && kpis.dso > ANOMALY_DAYS_THRESHOLD
              ? { message: RECEIVABLES_ANOMALY }
              : undefined
          }
          kpiId="dso"
          kpiValue={kpis.dso}
        />
        <DelayCard
          title="Délai stocks (DIO)"
          value={kpis.rot_stocks === null ? INSUFFICIENT_DATA_LABEL : `${Math.round(kpis.rot_stocks)} j`}
          icon={<Package className="h-4 w-4 text-amber-400/70" />}
          hint="Temps moyen d'écoulement du stock."
          badgeLabel="↘ À réduire"
          badgeTone="warning"
          anomaly={
            kpis.rot_stocks !== null && kpis.rot_stocks > ANOMALY_DAYS_THRESHOLD
              ? { message: INVENTORY_ANOMALY }
              : undefined
          }
          kpiId="rot_stocks"
          kpiValue={kpis.rot_stocks}
        />
        <DelayCard
          title="Délai fournisseurs (DPO)"
          value={kpis.dpo === null ? INSUFFICIENT_DATA_LABEL : `${Math.round(kpis.dpo)} j`}
          icon={<Truck className="h-4 w-4 text-emerald-400/70" />}
          hint="Délai moyen accordé par les fournisseurs."
          badgeLabel="↗ À allonger"
          badgeTone="good"
          anomaly={
            kpis.dpo !== null && kpis.dpo > ANOMALY_DAYS_THRESHOLD
              ? { message: PAYABLES_ANOMALY }
              : undefined
          }
          kpiId="dpo"
          kpiValue={kpis.dpo}
        />
      </div>
    </article>
  );
}

type DelayCardProps = {
  title: string;
  value: string;
  hint: string;
  badgeLabel: string;
  badgeTone: "good" | "warning";
  icon: ReactNode;
  anomaly?: { message: string };
  kpiId?: string;
  kpiValue?: number | null;
};

function DelayCard({
  title, value, hint, badgeLabel, badgeTone, anomaly, kpiId, kpiValue,
}: DelayCardProps) {
  const badgeClass =
    badgeTone === "good"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
      : "border-amber-400/30 bg-amber-500/10 text-amber-300";
  const valueClass = anomaly
    ? "tnum text-2xl font-medium text-rose-400"
    : "tnum text-2xl font-medium text-white";

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:border-quantis-gold/30 hover:bg-quantis-gold/[0.03]">
      <div className="mb-3 flex items-start justify-between">
        <span className="text-[10px] uppercase tracking-widest text-white/55">{title}</span>
        {kpiId ? <KpiTooltip kpiId={kpiId} value={kpiValue} /> : null}
      </div>
      <div className="mb-2 flex items-end justify-between gap-2">
        <span className={valueClass}>{value}</span>
        <span className={`rounded px-2 py-1 text-[9px] uppercase tracking-wide ${badgeClass}`}>
          {badgeLabel}
        </span>
      </div>
      {anomaly ? (
        <p className="mb-2 rounded border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-300">
          ⚠ {anomaly.message}
        </p>
      ) : null}
      {kpiId ? (
        <div className="mb-2">
          <KpiBenchmarkAutoIndicator kpiId={kpiId} value={kpiValue ?? null} kpiLabel={title} />
        </div>
      ) : null}
      <p className="text-[10px] italic text-white/45">{hint}</p>
    </div>
  );
}
