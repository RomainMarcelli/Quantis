"use client";

import { X } from "lucide-react";
import type { ProductTourStep } from "@/types/onboarding";

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type ProductTourOverlayProps = {
  isOpen: boolean;
  isDark: boolean;
  step: ProductTourStep;
  stepIndex: number;
  totalSteps: number;
  targetRect: SpotlightRect | null;
  isStepReady: boolean;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onMinimize: () => void;
};

export function ProductTourOverlay({
  isOpen,
  isDark,
  step,
  stepIndex,
  totalSteps,
  targetRect,
  isStepReady,
  onNext,
  onPrev,
  onSkip,
  onMinimize
}: ProductTourOverlayProps) {
  if (!isOpen) {
    return null;
  }

  const isWelcomeStep = step.id === "tour-welcome";

  return (
    <div className="pointer-events-none fixed inset-0 z-[140]">
      {targetRect && step.preferredPlacement !== "center" ? (
        <div
          className={`pointer-events-none fixed rounded-2xl border quantis-tour-spotlight-ring ${
            isDark ? "border-amber-300/70" : "border-amber-600/75"
          }`}
          style={{
            top: `${targetRect.top}px`,
            left: `${targetRect.left}px`,
            width: `${targetRect.width}px`,
            height: `${targetRect.height}px`
          }}
        />
      ) : null}

      <div
        className={`pointer-events-auto fixed bottom-4 left-3 right-3 z-[141] w-auto rounded-2xl border p-4 shadow-[0_24px_60px_rgba(2,6,23,0.35)] md:left-auto md:right-4 md:w-[min(92vw,380px)] ${
          isDark ? "border-white/15 bg-[#0d1320] text-white" : "border-slate-300 bg-white text-slate-900"
        }`}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <p
            className={`text-[11px] uppercase tracking-[0.16em] ${
              isDark ? "text-quantis-gold" : "text-amber-700"
            }`}
          >
            Étape {stepIndex + 1} / {Math.max(totalSteps, 1)}
          </p>
          <button
            type="button"
            onClick={onMinimize}
            className={`rounded-md p-1 transition ${
              isDark
                ? "text-white/65 hover:bg-white/10 hover:text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            }`}
            aria-label="Reduire le guide"
            title="Reduire le guide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h3 className="text-base font-semibold">{step.title}</h3>
        <p className={`mt-2 text-sm leading-relaxed ${isDark ? "text-white/75" : "text-slate-600"}`}>
          {step.description}
        </p>

        {!isStepReady ? (
          <p className={`mt-2 text-xs ${isDark ? "text-white/50" : "text-slate-500"}`}>
            Chargement de la section ciblée...
          </p>
        ) : null}

        {isWelcomeStep ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onNext}
              className="btn-gold-premium rounded-lg px-3 py-2 text-xs font-semibold"
            >
              C&apos;est parti
            </button>
            <button
              type="button"
              onClick={onSkip}
              className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                isDark
                  ? "border-white/20 bg-white/5 text-white/85 hover:bg-white/10"
                  : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Pas besoin
            </button>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onSkip}
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                isDark
                  ? "border-rose-400/35 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15"
                  : "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
              }`}
            >
              Stop
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPrev}
                disabled={stepIndex === 0}
                className={`rounded-lg border px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-45 ${
                  isDark
                    ? "border-white/20 bg-white/5 text-white/85 hover:bg-white/10"
                    : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Précédent
              </button>
              <button
                type="button"
                onClick={onNext}
                className="btn-gold-premium rounded-lg px-3 py-1.5 text-xs font-semibold"
              >
                {stepIndex + 1 >= totalSteps ? "Terminer" : "Suivant"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
