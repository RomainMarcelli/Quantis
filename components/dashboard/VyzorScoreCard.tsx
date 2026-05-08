// File: components/dashboard/VyzorScoreCard.tsx
// Role: carte score du cockpit pour afficher le Vyzor Score a la place de l'indice de sante.
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

type VyzorScoreCardProps = {
  score: number | null;
  scoreLabel: string;
  scorePiliers: ScorePiliers;
  alerteInvestissement: boolean;
  searchId?: string;
};

const DIAL_RADIUS = 130;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;

export function VyzorScoreCard({
  score,
  scoreLabel,
  scorePiliers,
  alerteInvestissement,
  searchId
}: VyzorScoreCardProps) {
  const animatedScore = useAnimatedNumber(score, { durationMs: 900 });
  const scoreState = getVyzorScoreState(score);
  const progressOffset = computeHealthStrokeDashoffset(score === null ? null : animatedScore, DIAL_RADIUS);

  return (
    <article
      className="precision-card group fade-up relative flex h-full flex-col rounded-2xl px-6 pb-6 pt-7"
      data-search-id={searchId}
      data-vyzor-score
      data-score-state={getScoreStateKey(score)}
    >
      <div className="card-header mb-5 flex w-full items-center justify-between">
        <div className="flex items-center gap-2 text-white/60 transition-colors group-hover:text-white">
          <Gauge className="h-4 w-4" />
          <h2 className="text-[11px] font-bold uppercase tracking-widest">Vyzor Score</h2>
        </div>
      </div>

      <div className="relative mx-auto mt-2 flex h-[286px] w-[286px] items-center justify-center transition-transform duration-700 group-hover:scale-[1.02] md:h-[304px] md:w-[304px]">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 300 300" aria-hidden="true">
          <defs>
            {/* Gradient SVG signature mode clair — l'arc transitionne du
                gold profond (début, ~6h) vers la couleur sémantique de la
                santé (fin, dépendant du score). Référencé en CSS light via
                `stroke: url(#vyzor-score-gradient)` (cf. globals.css). */}
            <linearGradient id="vyzor-score-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8B6F2A" />
              <stop offset="100%" stopColor={scoreState.colorHex} />
            </linearGradient>
          </defs>
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
          {score === null ? (
            // Cohérent avec HealthScore : tiret au lieu d'un "N/D" en gros qui
            // se lit mal dans le cadran. Le label "Données insuffisantes" est
            // porté par scoreState.label dans le badge ci-dessous.
            <span className="tnum text-[6.8rem] font-semibold leading-none text-white/40 md:text-[7.2rem]">
              —
            </span>
          ) : (
            <span className="tnum data-react text-[6.8rem] font-semibold leading-none text-white md:text-[7.2rem]">
              {Math.round(animatedScore)}
            </span>
          )}
          <div
            className="interactive-badge flex items-center gap-2 rounded border border-white/15 bg-white/[0.03] px-3 py-1"
            data-score-badge
          >
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

/** Mapping score → label + couleur visible (utilisée par le SVG gradient
 *  et le badge en mode dark). Brief mode-clair Synthèse (08/05/2026) :
 *  4 paliers — 0-30 Critique, 31-60 Sous tension, 61-80 Bon, 81-100 Excellent.
 *  En mode clair, les couleurs sont overridées par CSS (data-score-state). */
function getVyzorScoreState(score: number | null): { label: string; colorHex: string } {
  if (score === null) {
    return { label: "Données insuffisantes", colorHex: "#8b8b93" };
  }
  if (score > 80) {
    return { label: "Excellent", colorHex: "#10B981" };
  }
  if (score >= 61) {
    return { label: "Bon", colorHex: "#C5A059" };
  }
  if (score >= 31) {
    return { label: "Sous tension", colorHex: "#F59E0B" };
  }
  return { label: "Critique", colorHex: "#EF4444" };
}

/** Clé sémantique de l'état du score, utilisée pour les sélecteurs CSS
 *  data-attribute (overrides mode clair par état). 5 valeurs (4 paliers
 *  + na) alignées sur le brief. */
function getScoreStateKey(
  score: number | null
): "na" | "critical" | "warning" | "good" | "excellent" {
  if (score === null) return "na";
  if (score > 80) return "excellent";
  if (score >= 61) return "good";
  if (score >= 31) return "warning";
  return "critical";
}

function PiliersItem({ label, value }: { label: string; value: number }) {
  // 4 tons selon les seuils du brief (alignés sur le score global) :
  // 81-100 success vert, 61-80 brand-gold, 31-60 warning orange, 0-30 danger.
  const tone =
    value > 80 ? "excellent" : value >= 61 ? "good" : value >= 31 ? "warning" : "critical";
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2" data-piliers-item data-tone={tone}>
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] uppercase tracking-wide text-white/55">{label}</p>
        <p className="text-base font-semibold text-white">{Math.round(value)} / 100</p>
      </div>
      {/* Mini-bar de progression. Visible en mode clair (cf. brief :
          "barre de fond rgba(0,0,0,0.04), barre de progression colorée
          selon le score"). En mode dark, elle reste discrète mais
          présente pour cohérence. */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]" data-piliers-track>
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          data-piliers-fill
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}
