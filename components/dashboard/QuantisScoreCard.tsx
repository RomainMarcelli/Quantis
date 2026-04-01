// File: components/dashboard/QuantisScoreCard.tsx
// Role: carte score du cockpit pour afficher le Quantis Score a la place de l'indice de sante.
"use client";

import type { CSSProperties } from "react";
import { Gauge } from "lucide-react";
import { computeHealthStrokeDashoffset } from "@/lib/dashboard/premiumDashboardAdapter";
import { useAnimatedNumber } from "@/components/dashboard/useAnimatedNumber";

type ScorePiliers = {
  rentabilite: number;
  solvabilite: number;
  liquidite: number;
  efficacite: number;
} | null;

type QuantisScoreCardProps = {
  score: number | null;
  scoreLabel: string;
  scorePiliers: ScorePiliers;
  alerteInvestissement: boolean;
  searchId?: string;
};

const DIAL_RADIUS = 130;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;

export function QuantisScoreCard({
  score,
  scoreLabel,
  scorePiliers,
  alerteInvestissement,
  searchId
}: QuantisScoreCardProps) {
  const animatedScore = useAnimatedNumber(score, { durationMs: 900 });
  const scoreState = getQuantisScoreState(score);
  const progressOffset = computeHealthStrokeDashoffset(score === null ? null : animatedScore, DIAL_RADIUS);

  return (
    <article
      className="precision-card group fade-up relative flex min-h-[560px] flex-col rounded-2xl px-6 pb-6 pt-7 lg:col-span-5"
      data-search-id={searchId}
    >
      <div className="card-header mb-5 flex w-full items-center justify-between">
        <div className="flex items-center gap-2 text-white/60 transition-colors group-hover:text-white">
          <Gauge className="h-4 w-4" />
          <h2 className="text-[11px] font-bold uppercase tracking-widest">Quantis Score</h2>
        </div>
        <span className="tech-tag text-[9px] font-mono text-white/40">QS_V1</span>
      </div>

      <div className="relative mx-auto mt-2 flex h-[286px] w-[286px] items-center justify-center transition-transform duration-700 group-hover:scale-[1.02] md:h-[304px] md:w-[304px]">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 300 300" aria-hidden="true">
          <circle
            cx="150"
            cy="150"
            r="142"
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
            strokeDasharray="4 12"
            className="premium-spin-slow origin-center"
          />
          <circle
            cx="150"
            cy="150"
            r="116"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
            strokeDasharray="2 6"
            className="premium-spin-reverse origin-center"
          />
          <circle className="dial-track" cx="150" cy="150" r={DIAL_RADIUS} />
          <circle className="dial-ticks premium-spin-slower origin-center" cx="150" cy="150" r={DIAL_RADIUS} />
          <circle
            className="dial-progress"
            cx="150"
            cy="150"
            r={DIAL_RADIUS}
            strokeDasharray={DIAL_CIRCUMFERENCE}
            strokeDashoffset={progressOffset}
            transform="rotate(-90 150 150)"
            style={{ "--health-color": scoreState.colorHex } as CSSProperties}
          />
        </svg>

        <div className="absolute flex flex-col items-center gap-3">
          <span className="tnum data-react text-[6.8rem] font-semibold leading-none text-white md:text-[7.2rem]">
            {score === null ? "N/D" : Math.round(animatedScore)}
          </span>
          <div className="interactive-badge flex items-center gap-2 rounded border border-white/15 bg-white/[0.03] px-3 py-1">
            <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: scoreState.colorHex }} />
            <span
              className="text-[11px] font-bold uppercase tracking-widest text-white/90"
              style={{ color: scoreState.colorHex }}
            >
              {scoreState.label}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-7 w-full space-y-3">
        <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
          <p className="text-[13px] font-medium leading-relaxed text-white/85">{scoreLabel}</p>
        </div>

        {scorePiliers ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <PiliersItem label="Rentabilité" value={scorePiliers.rentabilite} />
            <PiliersItem label="Solvabilité" value={scorePiliers.solvabilite} />
            <PiliersItem label="Liquidité" value={scorePiliers.liquidite} />
            <PiliersItem label="Efficacité" value={scorePiliers.efficacite} />
          </div>
        ) : null}

        {alerteInvestissement ? (
          <p className="text-xs text-amber-300">Alerte investissement active : usure des immobilisations à surveiller.</p>
        ) : null}
      </div>
    </article>
  );
}

function getQuantisScoreState(score: number | null): { label: string; colorHex: string } {
  if (score === null) {
    return { label: "Indéterminé", colorHex: "#8b8b93" };
  }
  if (score > 80) {
    return { label: "Excellent", colorHex: "#10B981" };
  }
  if (score >= 50) {
    return { label: "Sous tension", colorHex: "#F59E0B" };
  }
  return { label: "Critique", colorHex: "#EF4444" };
}

function PiliersItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-white/55">{label}</p>
      <p className="mt-1 text-base font-semibold text-white">{Math.round(value)} / 100</p>
    </div>
  );
}
