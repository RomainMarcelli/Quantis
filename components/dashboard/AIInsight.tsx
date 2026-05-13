// File: components/dashboard/AIInsight.tsx
// Role: affiche la carte de recommandation IA (UI only) dans la zone basse du dashboard premium.
"use client";

import { ArrowRight, Cpu } from "lucide-react";

type AIInsightProps = {
  message: string;
  ctaLabel: string;
  searchId?: string;
};

export function AIInsight({ message, ctaLabel, searchId }: AIInsightProps) {
  return (
    <button
      type="button"
      className="precision-card group fade-up relative flex h-full w-full overflow-hidden rounded-xl p-0 text-left md:col-span-2"
      aria-label="Recommendation IA"
      data-search-id={searchId}
    >
      <div className="flex h-full w-full flex-col items-start justify-between gap-6 agent-panel p-6 md:flex-row md:items-center">
        <div className="flex items-center gap-6">
          <div className="flex h-12 w-12 items-center justify-center rounded agent-icon-shell transition-all duration-300 group-hover:scale-105 group-hover:border-quantis-gold/30 group-hover:bg-quantis-gold/10">
            <Cpu className="h-5 w-5 text-white/60 group-hover:text-quantis-gold" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="agent-kicker text-[10px] font-mono">
              VYZOR_AGENT &gt; RECOMMANDATION STRATÉGIQUE
            </span>
            <p className="text-[14px] font-medium agent-message">
              {message}{" "}
              <span className="underline decoration-white/30 underline-offset-4 transition-colors group-hover:text-quantis-gold group-hover:decoration-quantis-gold/50">
                {ctaLabel}
              </span>
            </p>
          </div>
        </div>
        <div className="agent-arrow-shell flex h-10 w-10 shrink-0 items-center justify-center rounded transition-all duration-300 group-hover:border-quantis-gold group-hover:bg-quantis-gold">
          <ArrowRight className="agent-arrow-icon h-5 w-5 transition-transform group-hover:translate-x-1 group-hover:text-black" />
        </div>
      </div>
    </button>
  );
}
