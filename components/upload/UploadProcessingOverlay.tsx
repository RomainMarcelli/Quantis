"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Search, Calculator, BarChart3, Save, CheckCircle2 } from "lucide-react";

type UploadProcessingOverlayProps = {
  isActive: boolean;
  isComplete: boolean;
  hasError: boolean;
};

const STEPS = [
  { icon: FileText, label: "Lecture du document...", threshold: 15 },
  { icon: Search, label: "Extraction des données financières...", threshold: 45 },
  { icon: Calculator, label: "Calcul des indicateurs clés...", threshold: 70 },
  { icon: BarChart3, label: "Génération de votre score Vyzor...", threshold: 90 },
  { icon: Save, label: "Finalisation de l'analyse...", threshold: 100 }
] as const;

const ROTATING_MESSAGES = [
  "Analyse des ratios financiers en cours...",
  "Calcul de votre score Vyzor...",
  "Évaluation de la santé financière...",
  "Comparaison avec les benchmarks sectoriels...",
  "Identification des points d'amélioration..."
];

export function UploadProcessingOverlay({ isActive, isComplete, hasError }: UploadProcessingOverlayProps) {
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const startTimeRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!isActive) {
      setProgress(0);
      setMessageIndex(0);
      return;
    }

    startTimeRef.current = Date.now();

    const tick = () => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      let p: number;
      if (elapsed < 16) {
        p = (elapsed / 16) * 88;
      } else {
        p = 88 + Math.min(7, (elapsed - 16) * 0.3);
      }
      setProgress(Math.min(95, p));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [isActive]);

  useEffect(() => {
    if (isComplete && !hasError) {
      setProgress(100);
    }
  }, [isComplete, hasError]);

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      setMessageIndex((i) => (i + 1) % ROTATING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(id);
  }, [isActive]);

  if (!isActive && !isComplete) return null;

  const currentStepIndex = STEPS.findIndex((s) => progress < s.threshold);
  const activeStep = currentStepIndex === -1 ? STEPS.length - 1 : currentStepIndex;
  const elapsed = isActive ? Math.floor((Date.now() - startTimeRef.current) / 1000) : 0;
  const remaining = elapsed > 2 ? Math.max(0, Math.round((elapsed / Math.max(progress, 1)) * (100 - progress))) : null;

  return (
    <div className="mt-5 rounded-2xl border border-quantis-gold/20 bg-black/50 p-6 backdrop-blur-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-quantis-gold/30 bg-quantis-gold/10">
          {isComplete && !hasError ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          ) : (
            <BarChart3 className="h-5 w-5 text-quantis-gold" />
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">
            {isComplete && !hasError ? "Analyse terminée !" : "Analyse en cours..."}
          </h3>
          <p className="text-xs text-white/50">
            {isComplete && !hasError
              ? "Redirection vers votre synthèse financière..."
              : ROTATING_MESSAGES[messageIndex]}
          </p>
        </div>
      </div>

      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-quantis-gold to-amber-400 transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>

      <div className="mb-4 flex items-center justify-between text-xs text-white/50">
        <span>{Math.round(progress)}%</span>
        <span>
          {isComplete
            ? "Terminé"
            : remaining !== null
              ? `~${remaining}s restantes`
              : "Estimation en cours..."}
        </span>
      </div>

      <div className="space-y-2">
        {STEPS.map((step, i) => {
          const StepIcon = step.icon;
          const isDone = i < activeStep || (isComplete && !hasError);
          const isCurrent = i === activeStep && !isComplete;
          return (
            <div
              key={step.label}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-300 ${
                isCurrent
                  ? "border border-quantis-gold/20 bg-quantis-gold/5"
                  : isDone
                    ? "opacity-60"
                    : "opacity-30"
              }`}
            >
              <StepIcon
                className={`h-4 w-4 flex-shrink-0 ${
                  isDone ? "text-emerald-400" : isCurrent ? "text-quantis-gold" : "text-white/40"
                }`}
              />
              <span
                className={`text-xs ${
                  isDone ? "text-white/70 line-through" : isCurrent ? "font-medium text-white" : "text-white/40"
                }`}
              >
                {step.label}
              </span>
              {isDone && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-400" />}
              {isCurrent && (
                <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-quantis-gold" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
