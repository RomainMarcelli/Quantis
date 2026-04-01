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
import { formatNumber } from "@/components/dashboard/formatting";
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
import { TestTopStatus } from "@/components/dashboard/navigation/TestTopStatus";
import type { CalculatedKpis } from "@/types/analysis";

type FinancingTestProps = {
  kpis: CalculatedKpis;
  previousKpis?: CalculatedKpis | null;
};

export function FinancingTest({ kpis, previousKpis = null }: FinancingTestProps) {
  // Les compteurs sont animés côté React pour reproduire l'effet du design HTML source.
  const animatedDebtCapacity = useAnimatedNumber(kpis.capacite_remboursement_annees, { durationMs: 1200 });
  const animatedCaf = useAnimatedNumber(kpis.caf, { durationMs: 1350 });
  const animatedFte = useAnimatedNumber(kpis.fte, { durationMs: 1400 });
  const animatedLeverage = useAnimatedNumber(kpis.effet_levier, { durationMs: 1300 });

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

      {/* Badge de contexte en flux normal pour un rendu naturel et plus propre. */}
      <div className="relative z-[4] mb-6 flex">
        <TestTopStatus label="Contrôle des flux" />
      </div>

      <header className="fade-up relative z-[4] mb-10 flex flex-col items-start justify-between gap-5 md:flex-row md:items-end">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="interactive-badge flex h-8 w-8 items-center justify-center border border-quantis-gold/20 bg-quantis-base">
              <span className="text-sm font-bold text-quantis-gold">Q</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white">Quantis</span>
              <span className="text-[10px] font-mono text-quantis-muted">Financial Operating System</span>
            </div>
          </div>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Financement & solvabilité
          </h2>
          <p className="text-sm text-quantis-muted">Capacité d&apos;emprunt, génération de cash et liquidité court terme</p>
        </div>

        <div className="mt-3 flex flex-col items-end gap-2 md:mt-0">
          <div className="flex items-center gap-2">
            <Scale className="h-3 w-3 text-white/30" />
            <span className="text-[11px] font-mono uppercase text-white/40">Analyse bilancielle</span>
          </div>
          <div className="interactive-badge flex items-center gap-2 rounded border border-white/10 bg-white/[0.02] px-3 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10B981]" />
            <span className="text-[10px] font-medium uppercase tracking-widest text-white/80">
              Score crédit : {creditBadge}
            </span>
          </div>
        </div>
      </header>

      <div className="relative z-[4] grid grid-cols-1 gap-5 md:grid-cols-12">
        <FinancingMetricCard
          delayMs={100}
          searchId="analysis-fin-capacite-remboursement"
          className="md:col-span-4"
          title="Capacité de remboursement"
          tag="Dette nette / CAF (années)"
          value={kpis.capacite_remboursement_annees === null ? "N/D" : `${animatedDebtCapacity.toFixed(1)} ans`}
          trend={debtCapacityTrend}
          icon={<ShieldCheck className="h-4 w-4 text-white/40 transition-colors group-hover:text-quantis-gold" />}
          helper={debtInterpretation.helper}
          statusLabel={debtInterpretation.label}
          severity={debtInterpretation.severity}
          code="DEBT_RATIO"
        />

        <FinancingMetricCard
          delayMs={150}
          searchId="analysis-fin-caf"
          className="md:col-span-4"
          title="Autofinancement"
          tag="Capacité d'autofinancement (CAF)"
          value={kpis.caf === null ? "N/D" : formatCompactCurrency(animatedCaf)}
          trend={cafTrend}
          icon={<Landmark className="h-4 w-4 text-white/40 transition-colors group-hover:text-quantis-gold" />}
          helper="Cash théorique généré par l'exploitation avant variation du BFR."
          statusLabel={kpis.caf === null ? "N/D" : kpis.caf >= 0 ? "Création de cash" : "Cash négatif"}
          severity={kpis.caf === null ? "na" : kpis.caf >= 0 ? "good" : "risk"}
          code="CASH_FLOW_GEN"
        />

        <FinancingMetricCard
          delayMs={200}
          searchId="analysis-fin-fte"
          className="md:col-span-4"
          title="Cash réel d'exploitation"
          tag="CAF - variation du BFR"
          value={kpis.fte === null ? "N/D" : formatCompactCurrency(animatedFte)}
          trend={fteTrend}
          icon={<Waves className="h-4 w-4 text-white/40 transition-colors group-hover:text-quantis-gold" />}
          helper="Trésorerie réellement dégagée après absorption du besoin en fonds de roulement."
          statusLabel={kpis.fte === null ? "N/D" : kpis.fte >= 0 ? "Cash disponible" : "Cash consommé"}
          severity={kpis.fte === null ? "na" : kpis.fte >= 0 ? "good" : "risk"}
          code="OCF_NET"
        />

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
                label: "N/D",
                tone: "neutral"
              };

              return (
                <div
                  key={indicator.label}
                  className="interactive-badge rounded-xl border border-white/5 bg-white/[0.02] p-5 transition-all hover:border-quantis-gold/30 hover:bg-quantis-gold/[0.03]"
                >
                  <span className="text-[10px] uppercase tracking-widest text-white/55">
                    Liquidité {indicator.label}
                  </span>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="tnum text-3xl font-medium text-white">
                      {indicator.value === null ? "N/D" : formatNumber(indicator.value, 2)}
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
                </div>
              );
            })}
          </div>

          <p className="edu-text mt-4">
            Ces ratios mesurent la capacité à régler les dettes court terme avec les actifs court terme.
          </p>
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
              <div className="flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-white/5 transition-all duration-300 group-hover:border-quantis-gold/30 group-hover:bg-quantis-gold/10">
                <Scale className="h-4 w-4 text-white/40 transition-colors group-hover:text-quantis-gold" />
              </div>
            </div>

            <p className="tnum data-react text-[2.6rem] font-semibold leading-none tracking-tight text-white">
              {kpis.effet_levier === null ? "N/D" : `${animatedLeverage.toFixed(2)}x`}
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
          <p className="edu-text">{leverageInterpretation.helper}</p>
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
                  QUANTIS_AGENT {" > "} MODÉLISATION DE FINANCEMENT
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
  trend: KpiTrend;
  statusLabel: string;
  helper: string;
  code: string;
  icon: ReactNode;
  severity: FinancingSeverity;
  delayMs: number;
  className?: string;
};

function FinancingMetricCard({
  searchId,
  title,
  tag,
  value,
  trend,
  statusLabel,
  helper,
  code,
  icon,
  severity,
  delayMs,
  className
}: FinancingMetricCardProps) {
  return (
    <article
      className={`precision-card fade-up group col-span-1 flex flex-col justify-between rounded-2xl p-6 ${className ?? ""}`}
      style={{ animationDelay: `${delayMs}ms` }}
      data-search-id={searchId}
    >
      <div>
        <div className="card-header flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <span className="tech-tag self-start text-[10px] font-mono uppercase text-white/60">{tag}</span>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-white/5 transition-all duration-300 group-hover:border-quantis-gold/30 group-hover:bg-quantis-gold/10">
            {icon}
          </div>
        </div>
        <p className="tnum data-react text-[2.2rem] font-medium leading-none tracking-tight text-white">{value}</p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`rounded-md border px-2 py-1 text-[11px] ${severityClass(severity)}`}>{statusLabel}</span>
            <KpiTrendPill trend={trend} compact />
          </div>
          <span className="text-[10px] font-mono text-white/35">{code}</span>
        </div>
      </div>
      <p className="edu-text">{helper}</p>
    </article>
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
  return "N/D";
}

function formatCompactCurrency(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

