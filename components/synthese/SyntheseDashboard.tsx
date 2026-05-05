// File: components/synthese/SyntheseDashboard.tsx
// Role: rend /synthese comme cockpit principal en reutilisant le layout /analysis
// avec remplacement de l'indice de sante par le Quantis Score.
"use client";

import { useMemo } from "react";
import { AlertTriangle, Download, Lightbulb, Receipt, Landmark, Radio } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { QuantisScoreCard } from "@/components/dashboard/QuantisScoreCard";
import { SourceBadge } from "@/components/analysis/SourceBadge";
import { KpiTooltip } from "@/components/kpi/KpiTooltip";
import { formatCurrency } from "@/components/dashboard/formatting";
import { useBridgeStatus } from "@/lib/banking/useBridgeStatus";
import type { PremiumKpis } from "@/lib/dashboard/premiumDashboardAdapter";
import type { SyntheseFiscalTile, SyntheseViewModel } from "@/lib/synthese/syntheseViewModel";
import type { SourceMetadata } from "@/types/connectors";
import type { CalculatedKpis } from "@/types/analysis";

type SyntheseDashboardProps = {
  greetingName: string;
  companyName: string;
  analysisCreatedAt: string;
  onDownloadFinancialReport?: () => void;
  onExportData?: () => void;
  onReupload: () => void;
  onManualEntry: () => void;
  synthese: SyntheseViewModel;
  parserVersion?: "v1" | "v2";
  sourceMetadata?: SourceMetadata | null;
  /**
   * KPIs de la période antérieure de même durée. Calculés une seule
   * fois côté SyntheseView via `recomputeKpisForPeriod` sur la période
   * précédente — propagés ici pour activer la ligne "variation +/-X%"
   * sur chaque card. Null si pas de dailyAccounting exploitable.
   */
  previousKpis?: CalculatedKpis | null;
};

export function SyntheseDashboard({
  greetingName,
  companyName,
  analysisCreatedAt,
  onDownloadFinancialReport,
  onExportData,
  onReupload,
  onManualEntry,
  synthese,
  parserVersion,
  sourceMetadata,
  previousKpis,
}: SyntheseDashboardProps) {
  // Bridge connecté → on substitue le solde "Disponibilités" par le solde
  // bancaire temps réel (au lieu du snapshot bilan comptable). Le badge
  // "Live" apparaît dans le header pour signaler l'origine de la donnée.
  // Le summary détaillé reste accessible dans l'onglet Trésorerie.
  const bridgeStatus = useBridgeStatus();
  const liveBalance =
    bridgeStatus.status?.connected && typeof bridgeStatus.status.totalBalance === "number"
      ? bridgeStatus.status.totalBalance
      : null;

  const cockpitKpis = useMemo(() => {
    const base = toCockpitKpis(synthese);
    return liveBalance !== null
      ? { ...base, disponibilites: liveBalance }
      : base;
  }, [synthese, liveBalance]);
  // Conversion CalculatedKpis → PremiumKpis pour passer au DashboardLayout
  // (qui attend la forme premium avec ca/ebe/disponibilites/croissance/...).
  const previousCockpitKpis = useMemo<PremiumKpis | null>(() => {
    if (!previousKpis) return null;
    return {
      ca: previousKpis.ca ?? null,
      disponibilites: previousKpis.disponibilites ?? null,
      ebe: previousKpis.ebe ?? null,
      healthScore: previousKpis.healthScore ?? null,
      croissance: previousKpis.tcam ?? null,
      runway: previousKpis.cashRunwayMonths ?? null,
    };
  }, [previousKpis]);
  const strategicMessage = synthese.actions[0] ?? "Maintenir la trajectoire actuelle et suivre les KPI chaque semaine.";
  const hasMissingMetric = synthese.metrics.some((metric) => metric.value === null);

  return (
    <section className="space-y-4">
      <header className="precision-card fade-up relative z-10 flex flex-col gap-3 rounded-2xl px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-quantis-muted">{companyName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/70">
            <span>Analyse du {new Date(analysisCreatedAt).toLocaleString("fr-FR")}</span>
            <SourceBadge sourceMetadata={sourceMetadata} analysisCreatedAt={analysisCreatedAt} />
            {parserVersion === "v2" && (
              <span className="inline-block rounded-full bg-emerald-900/40 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                Parser V2
              </span>
            )}
            {liveBalance !== null && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-900/40 px-2 py-0.5 text-[11px] font-medium text-emerald-300"
                title="Soldes bancaires temps réel via Bridge"
              >
                <Radio className="h-3 w-3 animate-pulse" />
                Live
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          {onDownloadFinancialReport ? (
            <button
              type="button"
              onClick={onDownloadFinancialReport}
              className="inline-flex items-center gap-1.5 rounded-lg border border-quantis-gold/30 bg-quantis-gold/10 px-3 py-1.5 text-xs font-medium text-quantis-gold hover:bg-quantis-gold/20"
            >
              <Download className="h-3.5 w-3.5" />
              Télécharger le rapport PDF
            </button>
          ) : null}
          {onExportData ? (
            <button
              type="button"
              onClick={onExportData}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/50 hover:bg-white/5 hover:text-white/70"
            >
              Exporter données
            </button>
          ) : null}
        </div>
      </header>

      <DashboardLayout
        companyName={companyName}
        greetingName={greetingName}
        kpis={cockpitKpis}
        previousKpis={previousCockpitKpis}
        title="Cockpit financier"
        subtitle={`Bonjour ${greetingName}, voici la vue d'ensemble de vos indicateurs clés.`}
        statusLabel="Vue consolidée - Exercice en cours"
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
        {/* Tiles fiscales — sorties de cash à anticiper (TVA, IS). Visibles
            uniquement quand les données amont sont calculables (cf.
            buildFiscalTiles dans syntheseViewModel.ts). */}
        {synthese.fiscalTiles.length > 0 ? (
          <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            {synthese.fiscalTiles.map((tile) => (
              <FiscalTile key={tile.id} tile={tile} />
            ))}
          </section>
        ) : null}

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1fr]">
          <article className="precision-card fade-up rounded-2xl p-5" style={{ animationDelay: "0.22s" }} data-search-id="synthese-actions-details">
            <div className="card-header flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-quantis-gold" />
              <h2 className="text-xl font-semibold text-white">Plan d&apos;action détaillé</h2>
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
                  Certaines données sont manquantes. Complétez vos informations pour fiabiliser l&apos;analyse.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onReupload}
                    className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[11px] text-white/85 hover:bg-white/20"
                  >
                    Importer un nouveau fichier
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
    disponibilites: cash?.value ?? null,
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

/**
 * Tile compacte fiscale (TVA / IS). Couleur neutre — c'est une projection,
 * pas un diagnostic bon/mauvais. Le KpiTooltip ✨ permet d'ouvrir le détail
 * (formule, vulgarisation 3 niveaux, question IA contextualisée).
 */
function FiscalTile({ tile }: { tile: SyntheseFiscalTile }) {
  const Icon = tile.id === "tva_a_payer" ? Receipt : Landmark;
  const value = tile.value ?? 0;
  return (
    <article
      className="precision-card fade-up rounded-2xl p-4"
      style={{ animationDelay: "0.18s" }}
      data-search-id={`synthese-${tile.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-quantis-gold/30 bg-quantis-gold/10 text-quantis-gold">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/55">
              {tile.label}
            </p>
            <h3 className="text-sm font-semibold text-white">{tile.title}</h3>
          </div>
        </div>
        <KpiTooltip kpiId={tile.id} value={value} />
      </div>

      <p className="tnum mt-3 text-[1.6rem] font-semibold leading-none tracking-tight text-white">
        {formatCurrency(value)}
      </p>
      <p className="mt-2 text-[11px] text-white/60">{tile.hint}</p>
    </article>
  );
}
