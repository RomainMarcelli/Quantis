// File: components/synthese/SyntheseDashboard.tsx
// Role: rend /synthese comme cockpit principal en reutilisant le layout /analysis
// avec remplacement de l'indice de sante par le Quantis Score.
"use client";

import { useMemo } from "react";
import { AlertTriangle, Download, Lightbulb } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { QuantisScoreCard } from "@/components/dashboard/QuantisScoreCard";
import type { PremiumKpis } from "@/lib/dashboard/premiumDashboardAdapter";
import type { SyntheseViewModel } from "@/lib/synthese/syntheseViewModel";

type SyntheseDashboardProps = {
  greetingName: string;
  companyName: string;
  analysisCreatedAt: string;
  onDownloadReport: () => void;
  onReupload: () => void;
  onManualEntry: () => void;
  synthese: SyntheseViewModel;
};

export function SyntheseDashboard({
  greetingName,
  companyName,
  analysisCreatedAt,
  onDownloadReport,
  onReupload,
  onManualEntry,
  synthese
}: SyntheseDashboardProps) {
  const cockpitKpis = useMemo(() => toCockpitKpis(synthese), [synthese]);
  const strategicMessage = synthese.actions[0] ?? "Maintenir la trajectoire actuelle et suivre les KPI chaque semaine.";
  const hasMissingMetric = synthese.metrics.some((metric) => metric.value === null);

  return (
    <section className="space-y-4">
      <header className="precision-card fade-up relative z-10 flex flex-col gap-3 rounded-2xl px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-quantis-muted">{companyName}</p>
          <p className="mt-1 text-sm text-white/70">Analyse du {new Date(analysisCreatedAt).toLocaleString("fr-FR")}</p>
        </div>
        <button
          type="button"
          onClick={onDownloadReport}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 md:self-auto"
        >
          <Download className="h-3.5 w-3.5" />
          Télécharger le rapport
        </button>
      </header>

      <DashboardLayout
        companyName={companyName}
        greetingName={greetingName}
        kpis={cockpitKpis}
        title="Cockpit financier"
        subtitle={`Bonjour ${greetingName}, voici la vue d'ensemble de vos indicateurs cles.`}
        statusLabel="Vue consolidee - Exercice en cours"
        statusBadgeLabel="Analyse dynamique"
        aiMessage={strategicMessage}
        aiCtaLabel="Ouvrir le plan d'action"
        scoreCard={
          <QuantisScoreCard
            score={synthese.score}
            scoreLabel={synthese.scoreLabel}
            scorePiliers={synthese.scorePiliers}
            alerteInvestissement={synthese.alerteInvestissement}
            searchId="synthese-quantis-score"
          />
        }
        searchIds={{
          revenue: "synthese-kpi-ca",
          cash: "synthese-kpi-cash",
          ebe: "synthese-kpi-ebe",
          recommendation: "synthese-actions"
        }}
      >
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1fr]">
          <article className="precision-card fade-up rounded-2xl p-5" style={{ animationDelay: "0.22s" }} data-search-id="synthese-actions-details">
            <div className="card-header flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-quantis-gold" />
              <h2 className="text-xl font-semibold text-white">Plan d&apos;action detaille</h2>
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

            {hasMissingMetric ? (
              <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-500/10 p-3">
                <p className="text-xs text-amber-100">
                  Certaines donnees sont manquantes. Completez vos informations pour fiabiliser l&apos;analyse.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onReupload}
                    className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[11px] text-white/85 hover:bg-white/20"
                  >
                    Re-uploader un fichier
                  </button>
                  <button
                    type="button"
                    onClick={onManualEntry}
                    className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[11px] text-white/85 hover:bg-white/20"
                  >
                    Saisie manuelle
                  </button>
                </div>
              </div>
            ) : null}
          </article>

          <article className="precision-card fade-up rounded-2xl p-5" style={{ animationDelay: "0.26s" }} data-search-id="synthese-alertes">
            <div className="card-header flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              <h2 className="text-xl font-semibold text-white">Alertes</h2>
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
      </DashboardLayout>
    </section>
  );
}

function toCockpitKpis(synthese: SyntheseViewModel): PremiumKpis {
  const revenue = synthese.metrics.find((metric) => metric.id === "ca");
  const ebe = synthese.metrics.find((metric) => metric.id === "ebe");
  const cash = synthese.metrics.find((metric) => metric.id === "cash");

  return {
    ca: revenue?.value ?? null,
    tresorerie: cash?.value ?? null,
    ebe: ebe?.value ?? null,
    healthScore: synthese.score,
    croissance: revenue?.trend.changePercent ?? null,
    runway: null
  };
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
