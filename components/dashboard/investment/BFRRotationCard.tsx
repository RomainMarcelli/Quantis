// File: components/dashboard/investment/BFRRotationCard.tsx
// Role: présente la rotation du BFR et ses composantes (stocks, clients, fournisseurs) en jours.
"use client";

import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";

type BFRRotationCardProps = {
  rotationBfr: number | null;
  rotationStocks: number | null;
  dso: number | null;
  dpo: number | null;
};

export function BFRRotationCard({ rotationBfr, rotationStocks, dso, dpo }: BFRRotationCardProps) {
  return (
    <article className="precision-card relative h-full min-h-[260px] rounded-2xl p-5">
      {/* Rotation BFR: nombre de jours de cash à avancer pour faire tourner le cycle. */}
      <InfoPopover
        title="Jours à avancer (Rotation du BFR)"
        purpose="Comprendre combien de jours de trésorerie l'entreprise doit financer."
        displayedData="Rotation globale + détail Stocks, Clients (DSO), Fournisseurs (DPO)."
        formula="Rotation BFR ≈ Rotation stocks + DSO - DPO."
      />

      {/* Le titre est compact pour garder la carte lisible sans créer de hauteur inutile. */}
      <h3 className="pr-10 text-xl font-semibold text-white sm:text-2xl">Jours à avancer</h3>
      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/60">Rotation du BFR</p>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        {/* Bloc global: synthèse immédiate du nombre de jours financés par la trésorerie. */}
        <section className="rounded-xl border border-white/15 bg-black/30 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-white/55">Global</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-300 sm:text-4xl">{formatDays(rotationBfr)}</p>
          <p className="mt-2 text-xs leading-relaxed text-white/65">
            Plus ce chiffre monte, plus la trésorerie doit être avancée pour financer le cycle.
          </p>
        </section>

        {/* Détail opérationnel: chaque ligne identifie précisément où le cash est immobilisé. */}
        <div className="space-y-2.5">
          <MetricRow label="Stocks" value={rotationStocks} accentClass="bg-blue-400/70" />
          <MetricRow label="Clients" value={dso} accentClass="bg-rose-400/70" />
          <MetricRow label="Fournisseurs" value={dpo} accentClass="bg-emerald-400/70" />
        </div>
      </div>
    </article>
  );
}

function MetricRow({
  label,
  value,
  accentClass
}: {
  label: string;
  value: number | null;
  accentClass: string;
}) {
  const normalized = value === null ? 0 : Math.min(Math.max(value, 0), 180);
  const progressWidth = `${(normalized / 180) * 100}%`;

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        {/* Ligne compacte: libellé et valeur restent sur la même hauteur pour éviter les superpositions. */}
        <p className="text-base font-semibold text-white sm:text-lg">{label}</p>
        <p className="text-xl font-semibold text-emerald-300 sm:text-2xl">{formatDays(value)}</p>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
        <div className={`h-full rounded-full ${accentClass}`} style={{ width: progressWidth }} />
      </div>
    </div>
  );
}

function formatDays(value: number | null): string {
  if (value === null) {
    return "N/D";
  }
  return `${Math.round(value)} jours`;
}
