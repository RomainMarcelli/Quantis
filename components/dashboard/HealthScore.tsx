// File: components/dashboard/HealthScore.tsx
// Role: affiche le cadran "Indice de Sante" avec animation de score, badge d'etat et message contextuel.
"use client";

import type { CSSProperties } from "react";
import { ShieldCheck } from "lucide-react";
import {
  computeHealthStrokeDashoffset,
  getPremiumHealthState
} from "@/lib/dashboard/premiumDashboardAdapter";
import { useAnimatedNumber } from "@/components/dashboard/useAnimatedNumber";

type HealthScoreProps = {
  score: number | null;
  tag?: string;
  searchId?: string;
};

const DIAL_RADIUS = 130;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;

export function HealthScore({ score, tag = "SCORE_01", searchId }: HealthScoreProps) {
  // Animation fluide du score central pour reproduire l'effet cockpit.
  const animatedScore = useAnimatedNumber(score, { durationMs: 900 });
  // Le status est derive de la vraie valeur KPI, pas de la valeur animee.
  const healthState = getPremiumHealthState(score);
  // Le stroke suit la valeur animee afin de synchroniser texte + cadran.
  const progressOffset = computeHealthStrokeDashoffset(animatedScore, DIAL_RADIUS);

  return (
    <article
      className="precision-card group fade-up relative flex min-h-[560px] flex-col rounded-2xl px-6 pb-6 pt-7 lg:col-span-5"
      data-search-id={searchId}
    >
      <div className="card-header mb-5 flex w-full items-center justify-between">
        <div className="flex items-center gap-2 text-white/60 transition-colors group-hover:text-white">
          <ShieldCheck className="h-4 w-4" />
          <h2 className="text-[11px] font-bold uppercase tracking-widest">Indice de Sante</h2>
        </div>
        <span className="tech-tag text-[9px] font-mono text-white/40">{tag}</span>
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
            style={{ "--health-color": healthState.colorHex } as CSSProperties}
          />
        </svg>

        <div className="absolute flex flex-col items-center gap-3">
          <span className="tnum data-react text-[6.8rem] font-semibold leading-none text-white md:text-[7.2rem]">
            {Math.round(animatedScore)}
          </span>
          <div className="interactive-badge flex items-center gap-2 rounded border border-white/15 bg-white/[0.03] px-3 py-1">
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: healthState.colorHex }}
            />
            <span
              className="text-[11px] font-bold uppercase tracking-widest text-white/90"
              style={{ color: healthState.colorHex }}
            >
              {healthState.label}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-7 w-full space-y-3">
        <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
          <p className="text-[13px] font-medium leading-relaxed text-white/85">{healthState.message}</p>
        </div>
        <p className="edu-text mt-0 border-t-0 pt-0 text-left">
          L&apos;indice de sante synthetise la liquidite, la rentabilite et la solvabilite pour piloter la
          résilience financière.
        </p>
      </div>
    </article>
  );
}
