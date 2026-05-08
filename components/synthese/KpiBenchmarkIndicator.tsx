// File: components/synthese/KpiBenchmarkIndicator.tsx
// Role: indicateur visuel 3-cercles horizontal (rouge gauche, jaune milieu, vert droite)
// positionnant un KPI vs P25/P50/P75 du marché Vyzor.
//
// Le cercle correspondant à la position du client est mis en avant (taille + glow + pulse) ;
// un track horizontal relie les 3 cercles pour les lire comme une échelle ;
// le label de position ("Top 25 %" / "Médiane" / "Bas 25 %") s'affiche toujours à droite.
//
// Tooltip = phrase complète + valeur P50, déclenché au survol/focus.
// Rendu via portail React vers `document.body` pour échapper aux overflow:hidden
// et précision-card boundaries qui clippaient le tooltip dans la version précédente.
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BenchmarkPosition, BenchmarkValueFormat, KpiBenchmark } from "@/types/benchmark";
import { formatCurrency, formatNumber, formatPercent } from "@/components/dashboard/formatting";

type Slot = "low" | "mid" | "high";

type KpiBenchmarkIndicatorProps = {
  benchmark: KpiBenchmark | null;
  format: BenchmarkValueFormat;
  // Pour les KPIs où "plus c'est haut, plus c'est mauvais" (DSO, BFR, gearing...).
  invertSentiment?: boolean;
  // Libellé du KPI utilisé dans le tooltip (ex: "Chiffre d'affaires").
  kpiLabel?: string;
};

const TOOLTIP_WIDTH_PX = 240;
const TOOLTIP_GAP_PX = 8;

export function KpiBenchmarkIndicator({
  benchmark,
  format,
  invertSentiment = false,
  kpiLabel
}: KpiBenchmarkIndicatorProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  // Lazy init au lieu d'un setMounted dans un useEffect : `document` n'est
  // évalué qu'une fois côté client, ce qui évite l'erreur d'hydratation tout
  // en respectant la règle "no setState in useEffect".
  const [mounted] = useState(() => typeof document !== "undefined");

  // Met à jour la position du tooltip à chaque ouverture en se basant sur le
  // bouton ; on positionne sous le bouton, et on rabat à gauche si on déborde
  // du viewport droit (carte du dashboard collée au bord par exemple).
  function computeTooltipPosition() {
    const node = buttonRef.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const top = rect.bottom + TOOLTIP_GAP_PX;
    let left = rect.left;
    if (left + TOOLTIP_WIDTH_PX > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - TOOLTIP_WIDTH_PX - 8);
    }
    return { top, left };
  }

  function showTooltip() {
    const next = computeTooltipPosition();
    if (next) {
      setCoords(next);
      setOpen(true);
    }
  }

  function hideTooltip() {
    setOpen(false);
  }

  // Repositionne au scroll/resize tant que le tooltip est ouvert (évite que le
  // tooltip se décale visuellement quand l'utilisateur scrolle pendant le hover).
  useEffect(() => {
    if (!open) return;
    function reposition() {
      const next = computeTooltipPosition();
      if (next) setCoords(next);
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  if (!benchmark) {
    return null;
  }

  const activeSlot = positionToSlot(benchmark.position, invertSentiment);
  const positionLabel = slotToLabel(activeSlot);
  const positionTone = slotToTone(activeSlot);
  const message = buildMessage(benchmark, format, invertSentiment);
  const p50Label = `P50 marché : ${formatBenchmarkValue(benchmark.percentiles.p50, format)}`;

  return (
    <span
      className="relative inline-flex items-center"
      data-search-id="kpi-benchmark-indicator"
      data-benchmark-indicator
      data-benchmark-tone={positionTone}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Comparaison marché${kpiLabel ? ` — ${kpiLabel}` : ""}`}
        aria-describedby={open ? "kpi-benchmark-tooltip" : undefined}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        className="group/bench flex items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-white/5"
      >
        {/* Échelle horizontale : track fin + 3 dots, le dot actif plus gros avec glow et pulse.
            En mode clair, les dots sont masqués (data-benchmark-dots) au profit
            d'un badge texte plus lisible (cf. brief Synthèse). */}
        <span
          className="relative flex h-3 w-12 flex-row items-center justify-between"
          data-benchmark-dots
        >
          <span aria-hidden="true" className="absolute left-1.5 right-1.5 top-1/2 h-px -translate-y-1/2 bg-white/10" />
          <Dot active={activeSlot === "low"} tone="negative" />
          <Dot active={activeSlot === "mid"} tone="neutral" />
          <Dot active={activeSlot === "high"} tone="positive" />
        </span>

        {/* Label de position toujours visible : couleur assortie au cercle actif. */}
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide ${toneTextClass(positionTone)}`}
          data-benchmark-label
        >
          {positionLabel}
        </span>
      </button>

      {mounted && open && coords
        ? createPortal(
            <div
              id="kpi-benchmark-tooltip"
              role="tooltip"
              style={{
                position: "fixed",
                top: coords.top,
                left: coords.left,
                width: TOOLTIP_WIDTH_PX,
                zIndex: 100
              }}
              className="rounded-lg border border-white/15 bg-quantis-base/95 p-3 text-xs text-white/85 shadow-xl backdrop-blur pointer-events-none"
            >
              <p className="font-medium text-white">{message}</p>
              <p className="mt-1 text-[11px] text-white/55">{p50Label}</p>
            </div>,
            document.body
          )
        : null}
    </span>
  );
}

type Tone = "positive" | "neutral" | "negative";

type DotProps = {
  active: boolean;
  tone: Tone;
};

function Dot({ active, tone }: DotProps) {
  const tones: Record<Tone, { dim: string; glow: string }> = {
    positive: {
      dim: "h-1.5 w-1.5 bg-emerald-500/30",
      glow:
        "h-3 w-3 bg-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.95)] ring-2 ring-emerald-300/70 animate-pulse"
    },
    neutral: {
      dim: "h-1.5 w-1.5 bg-amber-500/30",
      glow:
        "h-3 w-3 bg-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.95)] ring-2 ring-amber-200/70 animate-pulse"
    },
    negative: {
      dim: "h-1.5 w-1.5 bg-rose-500/30",
      glow:
        "h-3 w-3 bg-rose-400 shadow-[0_0_14px_rgba(244,63,94,0.95)] ring-2 ring-rose-300/70 animate-pulse"
    }
  };

  const variant = active ? tones[tone].glow : tones[tone].dim;
  return (
    <span
      aria-hidden="true"
      className={`relative z-10 rounded-full transition-all duration-300 ${variant}`}
    />
  );
}

function toneTextClass(tone: Tone): string {
  if (tone === "positive") return "text-emerald-300";
  if (tone === "neutral") return "text-amber-200";
  return "text-rose-300";
}

function slotToTone(slot: Slot): Tone {
  if (slot === "high") return "positive";
  if (slot === "low") return "negative";
  return "neutral";
}

function slotToLabel(slot: Slot): string {
  if (slot === "high") return "Top 25 %";
  if (slot === "low") return "Bas 25 %";
  return "Médiane";
}

// Mappe la position percentile vers un slot horizontal (gauche/milieu/droite).
// Quatre buckets de percentiles → trois cercles : on collapse les deux quartiles centraux.
// Pour les KPIs à sentiment inversé (DSO, BFR, gearing), on retourne l'axe pour que
// "à droite = vert = bon pour vous" reste cohérent quel que soit le sens du KPI.
export function positionToSlot(position: BenchmarkPosition, invertSentiment: boolean): Slot {
  if (invertSentiment) {
    if (position === "above_p75") return "low";
    if (position === "below_p25") return "high";
    return "mid";
  }

  if (position === "above_p75") return "high";
  if (position === "below_p25") return "low";
  return "mid";
}

function buildMessage(
  benchmark: KpiBenchmark,
  format: BenchmarkValueFormat,
  invertSentiment: boolean
): string {
  const delta = benchmark.deltaVsP50Pct;
  const rounded = Math.abs(delta).toFixed(1);

  if (Math.abs(delta) < 1) {
    return "Vous êtes aligné sur la médiane marché.";
  }

  const direction = delta > 0 ? "au-dessus" : "en-dessous";
  const sentimentNote = invertSentiment ? " (plus c'est bas, mieux c'est)" : "";

  // Suffixe contextuel court pour les formats non monétaires les plus utilisés.
  void format;
  return `Vous êtes ${rounded}% ${direction} de la médiane marché${sentimentNote}.`;
}

function formatBenchmarkValue(value: number, format: BenchmarkValueFormat): string {
  switch (format) {
    case "currency":
      return formatCurrency(value);
    case "percent":
      return formatPercent(value);
    case "days":
      return `${formatNumber(value, 1)} j`;
    case "ratio":
      return formatNumber(value, 2);
    case "headcount":
      return `${formatNumber(value, 1)} ETP`;
    default:
      return formatNumber(value);
  }
}
