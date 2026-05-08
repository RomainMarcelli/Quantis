// File: components/dashboard/navigation/FinancingTest.tsx
// Role: propose une variante "test" premium de la section Financement avec les KPI réels de l'analyse.
"use client";

import { type MouseEvent, type ReactNode, useMemo, useState } from "react";
import {
  ArrowRight,
  Cpu,
  Landmark,
  Scale,
  ShieldCheck,
  Waves
} from "lucide-react";
import { formatNumber, formatPercent, INSUFFICIENT_DATA_LABEL } from "@/components/dashboard/formatting";
import { KpiTooltip } from "@/components/kpi/KpiTooltip";
import { KpiCardLayout } from "@/components/kpi/KpiCardLayout";
import { KpiBenchmarkAutoIndicator } from "@/components/synthese/KpiBenchmarkAutoIndicator";
import { KpiTrendPill } from "@/components/dashboard/navigation/KpiTrendPill";
import { useAnimatedNumber } from "@/components/dashboard/useAnimatedNumber";
import {
  buildLiquidityIndicators,
  interpretDebtCapacity,
  interpretLeverage,
  severityClass,
  type FinancingSeverity
} from "@/lib/dashboard/financement/financingViewModel";
import { buildKpiTrend, type KpiTrend } from "@/lib/kpi/kpiTrend";
import type { AnalysisRecord, CalculatedKpis } from "@/types/analysis";
import { KpiEvolutionChart } from "@/components/synthese/KpiEvolutionChart";
import { CustomizableDashboard } from "@/components/dashboard/widgets/CustomizableDashboard";
import type { DashboardLayout, WidgetInstance } from "@/types/dashboard";

// Default layout pour l'onglet Financement : reproduit les 6 cartes existantes
// (capacite_remboursement, caf, fte, solvabilite, gearing, tn). Toutes les
// variations + benchmarks sont portés par chaque widget KpiCard.
import { DEFAULT_DASHBOARD_LAYOUTS } from "@/lib/dashboard/defaultDashboardLayouts";
const DEFAULT_FINANCING_LAYOUT = DEFAULT_DASHBOARD_LAYOUTS["financement"];

type FinancingTestProps = {
  kpis: CalculatedKpis;
  previousKpis?: CalculatedKpis | null;
  analyses?: AnalysisRecord[];
  currentAnalysis?: AnalysisRecord | null;
  analysisModeLabel?: string | null;
};

export function FinancingTest({
  kpis,
  previousKpis = null,
  analyses = [],
  currentAnalysis = null,
  analysisModeLabel = null
}: FinancingTestProps) {
  // KPI sélectionné → pilote la courbe d'évolution top. Défaut = capacité de
  // remboursement qui est la 1re carte affichée.
  const [selectedKpiId, setSelectedKpiId] = useState<string>("capacite_remboursement_annees");
  // Les compteurs sont animés côté React pour reproduire l'effet du design HTML source.
  const animatedDebtCapacity = useAnimatedNumber(kpis.capacite_remboursement_annees, { durationMs: 1200 });
  const animatedCaf = useAnimatedNumber(kpis.caf, { durationMs: 1350 });
  const animatedFte = useAnimatedNumber(kpis.fte, { durationMs: 1400 });
  const animatedLeverage = useAnimatedNumber(kpis.effet_levier, { durationMs: 1300 });
  const animatedSolvabilite = useAnimatedNumber(kpis.solvabilite, { durationMs: 1250 });
  const animatedGearing = useAnimatedNumber(kpis.gearing, { durationMs: 1300 });
  const animatedTn = useAnimatedNumber(kpis.tn, { durationMs: 1350 });

  // Interprétations métier centralisées dans le view-model pour garder la cohérence.
  const debtInterpretation = useMemo(
    () => interpretDebtCapacity(kpis.capacite_remboursement_annees),
    [kpis.capacite_remboursement_annees]
  );
  const leverageInterpretation = useMemo(
    () => interpretLeverage(kpis.effet_levier),
    [kpis.effet_levier]
  );
  const liquidityIndicators = useMemo(
    () =>
      buildLiquidityIndicators({
        liquiditeGenerale: kpis.liq_gen,
        liquiditeReduite: kpis.liq_red,
        liquiditeImmediate: kpis.liq_imm
      }),
    [kpis.liq_gen, kpis.liq_red, kpis.liq_imm]
  );
  const debtCapacityTrend = useMemo(
    () =>
      buildKpiTrend(
        kpis.capacite_remboursement_annees,
        previousKpis?.capacite_remboursement_annees ?? null
      ),
    [kpis.capacite_remboursement_annees, previousKpis?.capacite_remboursement_annees]
  );
  const cafTrend = useMemo(
    () => buildKpiTrend(kpis.caf, previousKpis?.caf ?? null),
    [kpis.caf, previousKpis?.caf]
  );
  const fteTrend = useMemo(
    () => buildKpiTrend(kpis.fte, previousKpis?.fte ?? null),
    [kpis.fte, previousKpis?.fte]
  );
  const leverageTrend = useMemo(
    () => buildKpiTrend(kpis.effet_levier, previousKpis?.effet_levier ?? null),
    [kpis.effet_levier, previousKpis?.effet_levier]
  );
  const liquidityTrends = useMemo(
    () => [
      buildKpiTrend(kpis.liq_gen, previousKpis?.liq_gen ?? null),
      buildKpiTrend(kpis.liq_red, previousKpis?.liq_red ?? null),
      buildKpiTrend(kpis.liq_imm, previousKpis?.liq_imm ?? null)
    ],
    [kpis.liq_gen, kpis.liq_red, kpis.liq_imm, previousKpis?.liq_gen, previousKpis?.liq_red, previousKpis?.liq_imm]
  );

  // Le "score crédit" du badge reste une lecture UI de synthèse, sans recalcul KPI métier.
  const creditBadge = useMemo(() => {
    const riskCount = [debtInterpretation.severity, leverageInterpretation.severity, ...liquidityIndicators.map((item) => item.severity)].filter(
      (severity) => severity === "risk"
    ).length;
    if (riskCount === 0) return "A+";
    if (riskCount === 1) return "A";
    if (riskCount === 2) return "B+";
    return "B";
  }, [debtInterpretation.severity, leverageInterpretation.severity, liquidityIndicators]);

  // Mouse glow local: activé uniquement dans cette section test.
  const [mouseGlow, setMouseGlow] = useState({ x: 0, y: 0, visible: false });

  function handleMouseMove(event: MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setMouseGlow({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      visible: true
    });
  }

  function handleMouseLeave() {
    setMouseGlow((current) => ({ ...current, visible: false }));
  }

  // Répartition visuelle capitaux propres vs dette à partir du levier (dette / capitaux propres).
  const leverageValue = kpis.effet_levier;
  const debtShare = leverageValue === null ? 50 : clamp((leverageValue / (1 + Math.max(leverageValue, 0))) * 100, 0, 100);
  const equityShare = 100 - debtShare;

  return (
    <section
      className="premium-analysis-root relative overflow-hidden rounded-2xl p-4 md:p-8"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        data-mouse-glow
        className="pointer-events-none absolute z-[3] h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(197,160,89,0.12)_0%,transparent_62%)] transition-opacity duration-300"
        style={{
          left: `${mouseGlow.x}px`,
          top: `${mouseGlow.y}px`,
          opacity: mouseGlow.visible ? 1 : 0,
          transform: "translate(-50%, -50%)"
        }}
        aria-hidden="true"
      />
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />

      <header className="fade-up relative z-[4] mb-10 flex flex-col items-start justify-between gap-5 md:flex-row md:items-end">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Financement & solvabilité
          </h2>
          <p className="text-sm text-quantis-muted">Capacité d&apos;emprunt, génération de cash et liquidité court terme</p>
        </div>

        <div className="flex flex-col items-end gap-2 self-start md:self-auto">
          {analysisModeLabel ? (
            <div className="interactive-badge flex items-center gap-2 rounded border border-white/10 bg-white/[0.02] px-3 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10B981]" />
              <span className="text-[10px] font-medium uppercase tracking-widest text-white/80">{analysisModeLabel}</span>
            </div>
          ) : null}
          <div className="interactive-badge flex items-center gap-2 rounded border border-quantis-gold/20 bg-quantis-gold/[0.04] px-3 py-1">
            <span className="text-[10px] font-medium uppercase tracking-widest text-quantis-gold">
              Score crédit : {creditBadge}
            </span>
          </div>
        </div>
      </header>

      <div className="relative z-[4] grid grid-cols-1 gap-5 md:grid-cols-12">
        {/* Chart top : courbe d'évolution du KPI sélectionné. */}
        <div className="md:col-span-12">
          <KpiEvolutionChart
            kpiId={selectedKpiId}
            analyses={analyses}
            currentAnalysis={currentAnalysis}
          />
        </div>

        {/* 6 cartes KPI customizable : par défaut Capacité de remboursement,
            CAF, FTE, Solvabilité, Gearing, TN. L'utilisateur peut ajouter
            d'autres KPIs financement (effet_levier, liq_red, liq_imm…) ou
            changer la viz (gauge pour les ratios bornés, etc.). */}
        <div className="md:col-span-12">
          <CustomizableDashboard
            userId={null}
            layoutId="dashboard:financement"
            defaultLayout={DEFAULT_FINANCING_LAYOUT}
            kpis={kpis}
            previousKpis={previousKpis}
            analyses={analyses}
            currentAnalysis={currentAnalysis}
            mappedData={currentAnalysis?.mappedData ?? null}
            lockedCategory="financement"
            kpiSelection={{
              selectedKpiId,
              onSelect: setSelectedKpiId
            }}
          />
        </div>

        <article
          className="precision-card fade-up group col-span-1 rounded-2xl p-8 md:col-span-8"
          style={{ animationDelay: "250ms" }}
          data-search-id="analysis-fin-liquidite"
        >
          {/* Bloc central: compare les trois ratios de liquidité avec un même cadre de lecture. */}
          <div className="card-header mb-8">
            <h3 className="text-sm font-semibold text-white">Résistance aux imprévus</h3>
            <div className="mt-2 flex items-center gap-2">
              <span className="tech-tag text-[10px] font-mono uppercase text-white/60">Ratios de liquidité</span>
              <span className="text-[10px] font-mono text-white/35">LIQUIDITY_COVERAGE</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {liquidityIndicators.map((indicator, index) => {
              const trend = liquidityTrends[index] ?? {
                direction: "na",
                changePercent: null,
                label: INSUFFICIENT_DATA_LABEL,
                tone: "neutral"
              };

              return (
                <div
                  key={indicator.label}
                  className="interactive-badge rounded-xl border border-white/5 bg-white/[0.02] p-5 transition-all hover:border-quantis-gold/30 hover:bg-quantis-gold/[0.03]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-widest text-white/55">
                      Liquidité {indicator.label}
                    </span>
                    {indicator.kpiId ? (
                      <KpiTooltip kpiId={indicator.kpiId} value={indicator.value} />
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="tnum text-3xl font-medium text-white">
                      {indicator.value === null ? INSUFFICIENT_DATA_LABEL : formatNumber(indicator.value, 2)}
                      {indicator.value === null ? null : <span className="text-sm text-white/35">x</span>}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-white/65">{indicator.helper}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] ${severityClass(indicator.severity)}`}>
                      {interpretLabel(indicator.severity)}
                    </span>
                    <KpiTrendPill trend={trend} compact />
                  </div>
                  {indicator.kpiId ? (
                    <div className="mt-3">
                      <KpiBenchmarkAutoIndicator
                        kpiId={indicator.kpiId}
                        value={indicator.value}
                        kpiLabel={`Liquidité ${indicator.label}`}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

        </article>

        <article
          className="precision-card fade-up group col-span-1 flex flex-col justify-between rounded-2xl p-6 md:col-span-4"
          style={{ animationDelay: "300ms" }}
          data-search-id="analysis-fin-levier"
        >
          <div>
            <div className="card-header flex items-start justify-between">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-white">Indépendance</h3>
                <span className="tech-tag self-start text-[10px] font-mono uppercase text-white/60">
                  Levier financier (gearing)
                </span>
              </div>
              {/* L'icône colorée a été retirée pour simplifier — la cellule
                  s'appuie sur le tooltip ✨ pour les explications. */}
            </div>

            <p className="tnum data-react text-[2.6rem] font-semibold leading-none tracking-tight text-white">
              {kpis.effet_levier === null ? INSUFFICIENT_DATA_LABEL : `${animatedLeverage.toFixed(2)}x`}
            </p>
            <div className="mt-2">
              <KpiTrendPill trend={leverageTrend} compact />
            </div>

            <div className="mt-5 rounded-lg border border-white/5 bg-quantis-base p-3">
              <div className="mb-2 flex items-end justify-between">
                <span className="text-[9px] uppercase text-white/45">Capitaux propres</span>
                <span className="text-[9px] uppercase text-white/45">Dette nette</span>
              </div>
              <div className="flex h-1.5 w-full overflow-hidden rounded-none border border-white/10 bg-white/10">
                <div className="bar-segment h-full bg-emerald-500" style={{ width: `${equityShare}%` }} />
                <div className="bar-segment h-full bg-rose-500" style={{ width: `${debtShare}%` }} />
              </div>
            </div>
          </div>
        </article>

        <button
          type="button"
          className="precision-card fade-up col-span-1 w-full overflow-hidden rounded-xl p-0 text-left md:col-span-12"
          style={{ animationDelay: "400ms" }}
        >
          {/* Bandeau d'action IA de test pour garder le même langage UX que les autres sections test. */}
          <div className="flex flex-col items-start justify-between gap-4 agent-panel p-6 md:flex-row md:items-center">
            <div className="flex items-center gap-5">
              <div className="flex h-12 w-12 items-center justify-center rounded agent-icon-shell">
                <Cpu className="h-5 w-5 text-white/60" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="agent-kicker text-[10px] font-mono">
                  VYZOR_AGENT {" > "} MODÉLISATION DE FINANCEMENT
                </span>
                <p className="text-[14px] font-medium agent-message">
                  Capacité d&apos;emprunt résiduelle estimée pour le prochain cycle de financement.
                </p>
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded agent-arrow-shell transition-all duration-300 hover:border-quantis-gold hover:bg-quantis-gold">
              <ArrowRight className="h-5 w-5 transition-colors hover:text-black agent-arrow-icon" />
            </div>
          </div>
        </button>
      </div>
    </section>
  );
}

type FinancingMetricCardProps = {
  searchId?: string;
  title: string;
  tag: string;
  value: string;
  delayMs: number;
  className?: string;
  kpiId?: string;
  kpiValue?: number | null;
  /** Tous les KPIs de la période précédente — la card va y chercher kpiId. */
  previousKpis?: CalculatedKpis | null;
  /** Card cliquable → pilote la courbe d'évolution top de la page. */
  onSelect?: () => void;
  isSelected?: boolean;
  /** Props legacy conservés pour compat — plus rendus. */
  trend?: KpiTrend;
  statusLabel?: string;
  helper?: string;
  code?: string;
  icon?: ReactNode;
  severity?: FinancingSeverity;
};

function FinancingMetricCard({
  searchId,
  title,
  tag,
  value,
  delayMs,
  className,
  kpiId,
  kpiValue,
  previousKpis,
  onSelect,
  isSelected,
}: FinancingMetricCardProps) {
  const previousValue =
    kpiId && previousKpis
      ? (previousKpis as Record<string, number | null>)[kpiId] ?? null
      : null;
  return (
    <div
      className={`col-span-1 ${className ?? ""}`}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <KpiCardLayout
        kpiId={kpiId}
        fullName={tag}
        title={title}
        value={kpiValue ?? null}
        previousValue={previousValue}
        formattedValue={value}
        searchId={searchId}
        className="fade-up"
        onSelect={onSelect}
        isSelected={isSelected}
      />
    </div>
  );
}

function interpretLabel(severity: FinancingSeverity): string {
  if (severity === "good") {
    return "Solide";
  }
  if (severity === "warning") {
    return "Vigilance";
  }
  if (severity === "risk") {
    return "Tension";
  }
  return INSUFFICIENT_DATA_LABEL;
}

function formatCompactCurrency(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

