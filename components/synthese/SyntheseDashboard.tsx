// File: components/synthese/SyntheseDashboard.tsx
// Role: rendu présentationnel de la page Synthèse (score, KPI majeurs, actions recommandées, alertes).
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDot,
  Lightbulb
} from "lucide-react";
import { formatCurrency } from "@/components/dashboard/formatting";
import type { SyntheseYearOption } from "@/lib/synthese/synthesePeriod";
import type { SyntheseMetric, SyntheseViewModel } from "@/lib/synthese/syntheseViewModel";

type SyntheseDashboardProps = {
  greetingName: string;
  companyName: string;
  analysisCreatedAt: string;
  selectedYearValue: string;
  yearOptions: SyntheseYearOption[];
  onYearChange: (nextYearValue: string) => void;
  synthese: SyntheseViewModel;
};

export function SyntheseDashboard({
  greetingName,
  companyName,
  analysisCreatedAt,
  selectedYearValue,
  yearOptions,
  onYearChange,
  synthese
}: SyntheseDashboardProps) {
  return (
    <section className="premium-analysis-root relative overflow-hidden rounded-2xl p-4 md:p-8">
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />

      <header className="fade-up relative z-10 mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-quantis-muted">{companyName}</p>
          <h1 className="mt-1 text-3xl font-semibold text-white md:text-4xl">Synthèse financière</h1>
          <p className="mt-2 text-sm text-white/70">
            Bonjour {greetingName}, voici les indicateurs clés pour décider rapidement.
          </p>
        </div>
        <div className="flex w-full max-w-[250px] flex-col items-start gap-2 md:items-end">
          {/* Sélecteur de période premium: menu custom pour avoir de vraies options stylées. */}
          <label className="text-[11px] uppercase tracking-widest text-white/45">Année de synthèse</label>
          <SyntheseYearSelect
            selectedYearValue={selectedYearValue}
            yearOptions={yearOptions}
            onYearChange={onYearChange}
          />
          <p className="text-xs text-white/55">Analyse du {new Date(analysisCreatedAt).toLocaleString("fr-FR")}</p>
        </div>
      </header>

      {/* Bloc principal: mise en avant du Quantis Score en lecture immédiate. */}
      <article className="precision-card fade-up rounded-2xl p-8 text-center" style={{ animationDelay: "0.05s" }}>
        <p className="text-3xl font-semibold uppercase tracking-wide text-white">Quantis Score</p>
        <p className="mt-1 text-sm text-white/60">Santé globale</p>
        <p className={`mt-5 text-6xl font-semibold ${scoreColorClass(synthese.score)}`}>
          {synthese.score === null ? "N/D" : Math.round(synthese.score)} / 100
        </p>
        <p className="mt-3 text-sm text-white/70">{synthese.scoreLabel}</p>
        {/* Détail des piliers pour expliquer la composition du score global. */}
        {synthese.scorePiliers ? (
          <div className="mt-6 grid gap-2 text-left sm:grid-cols-2 lg:grid-cols-4">
            <PiliersItem label="Rentabilité" value={synthese.scorePiliers.rentabilite} />
            <PiliersItem label="Solvabilité" value={synthese.scorePiliers.solvabilite} />
            <PiliersItem label="Liquidité" value={synthese.scorePiliers.liquidite} />
            <PiliersItem label="Efficacité" value={synthese.scorePiliers.efficacite} />
          </div>
        ) : null}
        {synthese.alerteInvestissement ? (
          <p className="mt-4 text-xs text-amber-300">
            Alerte investissement active : risque d&apos;usure des immobilisations.
          </p>
        ) : null}
      </article>

      {/* Ligne KPI: trois cartes horizontales responsives pour les métriques prioritaires du dirigeant. */}
      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {synthese.metrics.map((metric, index) => (
          <MetricCard key={metric.id} metric={metric} delay={`${0.1 + index * 0.04}s`} />
        ))}
      </section>

      {/* Bloc recommandations + alertes: aide à l'action sans noyer l'utilisateur dans le détail. */}
      <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1fr]">
        <article className="precision-card fade-up rounded-2xl p-5" style={{ animationDelay: "0.22s" }}>
          <div className="card-header flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-quantis-gold" />
            <h2 className="text-2xl font-semibold text-white">Actions recommandées</h2>
          </div>
          <ul className="space-y-2">
            {synthese.actions.map((action, index) => (
              <li
                key={`${action}-${index}`}
                className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/80"
              >
                {action}
              </li>
            ))}
          </ul>
        </article>

        <article className="precision-card fade-up rounded-2xl p-5" style={{ animationDelay: "0.26s" }}>
          <div className="card-header flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-300" />
            <h2 className="text-2xl font-semibold text-white">Alertes</h2>
          </div>
          <ul className="space-y-2">
            {synthese.alerts.map((alert) => (
              <li
                key={alert.id}
                className={`rounded-xl border px-3 py-2 text-sm ${alertSeverityClass(alert.severity)}`}
              >
                {alert.label}
              </li>
            ))}
          </ul>
        </article>
      </section>
    </section>
  );
}

function MetricCard({ metric, delay }: { metric: SyntheseMetric; delay: string }) {
  const isPositive = metric.trend.tone === "positive";
  const isNegative = metric.trend.tone === "negative";

  return (
    <article className="precision-card fade-up rounded-2xl p-5" style={{ animationDelay: delay }}>
      <p className="text-lg font-semibold text-white">{metric.title}</p>
      <p className="text-xs uppercase tracking-wide text-white/55">{metric.subtitle}</p>
      <p className="mt-4 text-4xl font-semibold text-white">{formatCurrency(metric.value)}</p>
      <div
        className={`mt-4 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${trendToneClass(metric.trend.tone)}`}
      >
        {isPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : null}
        {isNegative ? <ArrowDownRight className="h-3.5 w-3.5" /> : null}
        {!isPositive && !isNegative ? <CircleDot className="h-3.5 w-3.5" /> : null}
        <span>{metric.trend.label}</span>
      </div>
    </article>
  );
}

function SyntheseYearSelect({
  selectedYearValue,
  yearOptions,
  onYearChange
}: {
  selectedYearValue: string;
  yearOptions: SyntheseYearOption[];
  onYearChange: (nextYearValue: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // L'option active est mémorisée pour éviter un recalcul inutile à chaque render.
  const selectedOption = useMemo(
    () => yearOptions.find((option) => option.value === selectedYearValue) ?? yearOptions[0],
    [selectedYearValue, yearOptions]
  );

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!dropdownRef.current) {
        return;
      }
      if (!dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  return (
    <div ref={dropdownRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="group flex w-full items-center justify-between rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-left transition-colors hover:border-quantis-gold/40 hover:bg-black/45"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Choisir l'année de synthèse"
      >
        <span className="text-sm text-white">{selectedOption?.label ?? "Année en cours"}</span>
        <ChevronDown className={`h-4 w-4 text-white/60 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen ? (
        <div className="precision-card absolute left-0 top-full z-30 mt-2 w-full overflow-hidden rounded-xl">
          <ul role="listbox" aria-label="Options année de synthèse" className="max-h-64 overflow-y-auto p-1">
            {yearOptions.map((option) => {
              const isSelected = option.value === selectedYearValue;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => {
                      onYearChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                      isSelected
                        ? "bg-quantis-gold/20 text-quantis-gold"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span>{option.label}</span>
                    {isSelected ? <Check className="h-4 w-4" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function trendToneClass(tone: "positive" | "negative" | "neutral"): string {
  if (tone === "positive") {
    return "border-emerald-400/35 bg-emerald-500/15 text-emerald-200";
  }
  if (tone === "negative") {
    return "border-rose-400/35 bg-rose-500/15 text-rose-200";
  }
  return "border-white/20 bg-white/10 text-white/70";
}

function scoreColorClass(score: number | null): string {
  if (score === null) {
    return "text-white/80";
  }
  // Règle produit demandée: strictement > 80 vert, 50-80 orange, < 50 rouge.
  if (score > 80) {
    return "text-emerald-300";
  }
  if (score >= 50) {
    return "text-amber-300";
  }
  return "text-rose-300";
}

function PiliersItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-white/55">{label}</p>
      <p className="mt-1 text-base font-semibold text-white">{Math.round(value)} / 100</p>
    </div>
  );
}

function alertSeverityClass(severity: "high" | "medium" | "low"): string {
  if (severity === "high") {
    return "border-rose-400/35 bg-rose-500/15 text-rose-100";
  }
  if (severity === "medium") {
    return "border-amber-300/35 bg-amber-500/15 text-amber-100";
  }
  return "border-emerald-300/35 bg-emerald-500/15 text-emerald-100";
}
