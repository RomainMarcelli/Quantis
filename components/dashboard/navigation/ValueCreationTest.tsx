// File: components/dashboard/navigation/ValueCreationTest.tsx
// Role: propose une variante "test" premium de la section Création de valeur avec les KPI réels de l'analyse.
"use client";

import { type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChartBig,
  Cpu,
  Layers,
  PieChart as PieChartIcon
} from "lucide-react";
import { formatPercent, INSUFFICIENT_DATA_LABEL } from "@/components/dashboard/formatting";
import { KpiTooltip } from "@/components/kpi/KpiTooltip";
import { KpiCardLayout } from "@/components/kpi/KpiCardLayout";
import { KpiBenchmarkAutoIndicator } from "@/components/synthese/KpiBenchmarkAutoIndicator";
import { BreakEvenChart } from "@/components/dashboard/navigation/BreakEvenChart";
import { KpiEvolutionChart } from "@/components/synthese/KpiEvolutionChart";
import { CustomizableDashboard } from "@/components/dashboard/widgets/CustomizableDashboard";
import { DEFAULT_DASHBOARD_LAYOUTS } from "@/lib/dashboard/defaultDashboardLayouts";

const DEFAULT_VALUE_CREATION_LAYOUT = DEFAULT_DASHBOARD_LAYOUTS["creation-valeur"];
import { KpiTrendPill } from "@/components/dashboard/navigation/KpiTrendPill";
import { useAnimatedNumber } from "@/components/dashboard/useAnimatedNumber";
import { useTheme } from "@/hooks/useTheme";
import { buildKpiTrend, type KpiTrend } from "@/lib/kpi/kpiTrend";
import {
  buildBreakEvenModel,
  buildMonthlyRevenueSeries
} from "@/lib/dashboard/tabs/valueCreationData";
import type { AnalysisRecord, CalculatedKpis, MappedFinancialData } from "@/types/analysis";

type ValueCreationTestProps = {
  kpis: CalculatedKpis;
  mappedData: MappedFinancialData;
  previousKpis?: CalculatedKpis | null;
  /** Historique du dossier — alimente le graphique d'évolution KPI en haut. */
  analyses?: AnalysisRecord[];
  /** Analyse courante — son dailyAccounting alimente la lecture mensuelle. */
  currentAnalysis?: AnalysisRecord | null;
  /** Libellé du mode "Analyse dynamique / statique" affiché en haut à droite. */
  analysisModeLabel?: string | null;
};

export function ValueCreationTest({
  kpis,
  mappedData,
  previousKpis = null,
  analyses = [],
  currentAnalysis = null,
  analysisModeLabel = null
}: ValueCreationTestProps) {
  const { isDark } = useTheme();
  // KPI sélectionné → pilote la courbe d'évolution top. Défaut = CA, le plus parlant.
  const [selectedKpiId, setSelectedKpiId] = useState<string>("ca");
  // Les séries restent alimentées par les KPI backend: aucun recalcul métier côté UI.
  const monthlySeries = useMemo(
    () =>
      buildMonthlyRevenueSeries({
        ca: kpis.ca,
        tcam: kpis.tcam,
        ebe: kpis.ebe,
        resultatNet: kpis.resultat_net
      }),
    [kpis.ca, kpis.tcam, kpis.ebe, kpis.resultat_net]
  );

  // Modèle de point mort réutilisé pour conserver la même logique que le dashboard principal.
  const breakEvenModel = useMemo(
    () => buildBreakEvenModel(mappedData),
    [mappedData]
  );

  const displayedTmscv = breakEvenModel.metrics.tmscv ?? kpis.tmscv;

  // Compteurs animés pour retrouver l'effet "data-react" sans script DOM global.
  const animatedCa = useAnimatedNumber(kpis.ca, { durationMs: 1400 });
  const animatedTcam = useAnimatedNumber(kpis.tcam, { durationMs: 1300 });
  const animatedEbe = useAnimatedNumber(kpis.ebe, { durationMs: 1350 });
  const animatedResultatNet = useAnimatedNumber(kpis.resultat_net, { durationMs: 1450 });
  const animatedTmscv = useAnimatedNumber(displayedTmscv, { durationMs: 1250 });
  const animatedVa = useAnimatedNumber(kpis.va, { durationMs: 1300 });
  const animatedMargeEbitda = useAnimatedNumber(kpis.marge_ebitda, { durationMs: 1250 });
  const animatedPointMort = useAnimatedNumber(kpis.point_mort, { durationMs: 1350 });

  // Glow local rendu en impératif pour éviter un rerender React à chaque mouvement souris.
  const mouseGlowRef = useRef<HTMLDivElement | null>(null);
  const mouseGlowRafRef = useRef<number | null>(null);
  const nextMouseGlowRef = useRef({ x: 0, y: 0, visible: false });

  useEffect(() => {
    return () => {
      if (mouseGlowRafRef.current !== null) {
        cancelAnimationFrame(mouseGlowRafRef.current);
      }
    };
  }, []);

  function flushMouseGlow() {
    mouseGlowRafRef.current = null;
    const node = mouseGlowRef.current;
    if (!node) {
      return;
    }

    const next = nextMouseGlowRef.current;
    node.style.left = `${next.x}px`;
    node.style.top = `${next.y}px`;
    node.style.opacity = next.visible ? "1" : "0";
  }

  function scheduleMouseGlow() {
    if (mouseGlowRafRef.current !== null) {
      return;
    }
    mouseGlowRafRef.current = requestAnimationFrame(flushMouseGlow);
  }

  function handleMouseMove(event: MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    nextMouseGlowRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      visible: true
    };
    scheduleMouseGlow();
  }

  function handleMouseLeave() {
    nextMouseGlowRef.current = { ...nextMouseGlowRef.current, visible: false };
    scheduleMouseGlow();
  }

  const startRevenue = monthlySeries[0]?.revenue ?? 0;
  const endRevenue = monthlySeries[monthlySeries.length - 1]?.revenue ?? 0;
  const growthDelta = startRevenue > 0 ? ((endRevenue - startRevenue) / startRevenue) * 100 : 0;
  const caLabel = kpis.ca === null ? INSUFFICIENT_DATA_LABEL : formatCompactCurrency(animatedCa);
  const tcamLabel = kpis.tcam === null ? INSUFFICIENT_DATA_LABEL : formatPercent(animatedTcam);
  const ebeLabel = kpis.ebe === null ? INSUFFICIENT_DATA_LABEL : formatCompactCurrency(animatedEbe);
  const resultatNetLabel =
    kpis.resultat_net === null ? INSUFFICIENT_DATA_LABEL : formatCompactCurrency(animatedResultatNet);
  // Marge nette = résultat net / CA × 100. Bug historique : on passait
  // `kpis.netProfit` (en €) à formatPercent qui le considérait déjà en %,
  // affichant des "-13 866 %" sur des résultats négatifs après filtrage temporel.
  // CA et résultat net sont tous les deux des flux de la période → leur ratio
  // est unitless et stable indépendamment de la longueur de la fenêtre.
  const margeNettePct =
    kpis.netProfit !== null && kpis.ca !== null && kpis.ca > 0
      ? (kpis.netProfit / kpis.ca) * 100
      : null;
  const margeNetteLabel =
    margeNettePct === null ? INSUFFICIENT_DATA_LABEL : formatPercent(margeNettePct, 1);
  const tmscvLabel = displayedTmscv === null ? INSUFFICIENT_DATA_LABEL : formatPercent(animatedTmscv);
  const vaLabel = kpis.va === null ? INSUFFICIENT_DATA_LABEL : formatCompactCurrency(animatedVa);
  const margeEbitdaLabel = kpis.marge_ebitda === null ? INSUFFICIENT_DATA_LABEL : formatPercent(animatedMargeEbitda);
  const pointMortLabel = kpis.point_mort === null ? INSUFFICIENT_DATA_LABEL : formatCompactCurrency(animatedPointMort);
  const caFooterLabel =
    kpis.ca === null ? "Donnée indisponible" : growthDelta >= 0 ? "Croissance validée" : "Sous surveillance";
  const simulationLabel = useMemo(() => {
    const simulation = breakEvenModel.simulation;

    if (!breakEvenModel.hasUsableData) {
      return "Le simulateur s'active dès que le CA et les charges du compte de résultat sont disponibles.";
    }

    if (breakEvenModel.metrics.tmscv === null || breakEvenModel.metrics.tmscv <= 0) {
      return "Une baisse des charges fixes seule ne suffit pas: il faut d'abord restaurer une marge sur coûts variables positive.";
    }

    if (simulation?.daysGained !== null && simulation?.daysGained !== undefined && simulation.daysGained > 0) {
      return `Une baisse des charges fixes de 3% avancerait le point mort de ${Math.round(
        simulation.daysGained
      )} jours.`;
    }

    if (simulation?.pointMortDateDays !== undefined && simulation?.pointMortDateDays > 365) {
      return "Même avec 3% de charges fixes en moins, le point mort resterait au-delà de la clôture.";
    }

    return "Le point mort est déjà absorbé dès le démarrage de l'exercice.";
  }, [breakEvenModel]);
  const caTrend = useMemo(
    () => buildKpiTrend(kpis.ca, previousKpis?.ca ?? null),
    [kpis.ca, previousKpis?.ca]
  );
  const tcamTrend = useMemo(
    () => buildKpiTrend(kpis.tcam, previousKpis?.tcam ?? null),
    [kpis.tcam, previousKpis?.tcam]
  );
  const ebeTrend = useMemo(
    () => buildKpiTrend(kpis.ebe, previousKpis?.ebe ?? null),
    [kpis.ebe, previousKpis?.ebe]
  );
  const resultatNetTrend = useMemo(
    () => buildKpiTrend(kpis.resultat_net, previousKpis?.resultat_net ?? null),
    [kpis.resultat_net, previousKpis?.resultat_net]
  );
  const tmscvTrend = useMemo(
    () => buildKpiTrend(displayedTmscv, previousKpis?.tmscv ?? null),
    [displayedTmscv, previousKpis?.tmscv]
  );

  return (
    <section
      className="premium-analysis-root relative overflow-hidden rounded-2xl p-4 md:p-8"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={mouseGlowRef}
        className="pointer-events-none absolute z-[3] h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(197,160,89,0.12)_0%,transparent_62%)] transition-opacity duration-300"
        style={{
          left: 0,
          top: 0,
          opacity: 0,
          transform: "translate(-50%, -50%)"
        }}
        aria-hidden="true"
      />
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />

      <header className="fade-up relative z-[4] mb-10 flex flex-col items-start justify-between gap-5 md:flex-row md:items-end">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Création de valeur
          </h2>
        </div>

        {analysisModeLabel ? (
          <div className="interactive-badge flex items-center gap-2 self-start rounded border border-white/10 bg-white/[0.02] px-3 py-1 md:self-auto">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10B981]" />
            <span className="text-[10px] font-medium uppercase tracking-widest text-white/80">
              {analysisModeLabel}
            </span>
          </div>
        ) : null}
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

        {/* 6 cartes KPI customizable : par défaut CA, TCAM, EBE, VA, marge
            EBITDA, point mort. L'utilisateur peut ajouter d'autres KPIs de la
            catégorie "creation_valeur" ou changer la viz. */}
        <div className="md:col-span-12">
          <CustomizableDashboard
            userId={null}
            layoutId="dashboard:creation_valeur"
            defaultLayout={DEFAULT_VALUE_CREATION_LAYOUT}
            kpis={kpis}
            previousKpis={previousKpis}
            analyses={analyses}
            currentAnalysis={currentAnalysis}
            mappedData={mappedData}
            lockedCategory="creation_valeur"
            kpiSelection={{
              selectedKpiId,
              onSelect: setSelectedKpiId
            }}
          />
        </div>

        <article
          className="precision-card fade-up group col-span-1 flex flex-col justify-between rounded-2xl p-6 md:col-span-6"
          style={{ animationDelay: "250ms" }}
          data-search-id="analysis-vc-resultat-net"
        >
          <div>
            <div className="card-header flex items-start justify-between">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-white">Ce qu&apos;il reste à la fin</h3>
                <span className="tech-tag self-start text-[10px] font-mono uppercase text-white/60">Résultat net</span>
              </div>
              <KpiTooltip kpiId="resultat_net" value={kpis.resultat_net} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-4">
              <div className="data-react tnum text-[2.6rem] font-semibold leading-none tracking-tight text-white">
                {resultatNetLabel}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="text-[10px] uppercase text-white/45">Marge nette</span>
                <span className="tech-tag text-sm font-semibold text-white">
                  {margeNetteLabel}
                </span>
                <KpiTrendPill trend={resultatNetTrend} compact />
              </div>
            </div>
            <div className="mt-3">
              <KpiBenchmarkAutoIndicator
                kpiId="resultat_net"
                value={kpis.resultat_net}
                kpiLabel="Résultat net"
              />
            </div>
          </div>
        </article>

        <article
          className="precision-card fade-up group col-span-1 flex flex-col justify-between rounded-2xl p-6 md:col-span-6"
          style={{ animationDelay: "300ms" }}
          data-search-id="analysis-vc-tmscv"
        >
          <div>
            <div className="card-header flex items-start justify-between">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-white">Rentabilité directe</h3>
                <span className="tech-tag self-start text-[10px] font-mono uppercase text-white/60">
                  TMSCV
                </span>
              </div>
              <KpiTooltip kpiId="tmscv" value={kpis.tmscv} />
            </div>

            <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="data-react tnum text-[2.6rem] font-semibold leading-none tracking-tight text-white">
                {tmscvLabel}
              </div>
              <span className="text-[11px] uppercase tracking-wide text-white/50">
                Taux actuel
              </span>
            </div>
            <div className="mt-3">
              <KpiTrendPill trend={tmscvTrend} compact />
            </div>
          </div>
        </article>

        <article
          className="precision-card fade-up group col-span-1 rounded-2xl p-8 md:col-span-12"
          style={{ animationDelay: "400ms" }}
          data-search-id="analysis-vc-point-mort"
        >
          <div className="card-header mb-6 flex items-center justify-between gap-3">
            <div>
              <h3 className={`text-sm font-semibold ${isDark ? "text-white" : "text-slate-800"}`}>Seuil de rentabilité</h3>
              <p className={`mt-1 text-[10px] font-mono uppercase ${isDark ? "text-white/45" : "text-slate-500"}`}>Analyse du point mort</p>
            </div>
            <div className={`flex flex-wrap items-center gap-3 text-[10px] uppercase ${isDark ? "text-white/60" : "text-slate-600"}`}>
              <LegendDot color="#f3f4f6" label="CA" />
              <LegendDot color={isDark ? "rgba(255,255,255,0.46)" : "#94a3b8"} label="Coûts fixes" />
              <LegendDot color="#C5A059" label="Coûts totaux" />
            </div>
          </div>

          <BreakEvenChart model={breakEvenModel} isDark={isDark} />
        </article>

        <button
          type="button"
          className="precision-card fade-up col-span-1 w-full overflow-hidden rounded-xl p-0 text-left md:col-span-12"
          style={{ animationDelay: "500ms" }}
        >
          <div className={`flex flex-col items-start justify-between gap-4 p-6 md:flex-row md:items-center ${isDark ? "bg-gradient-to-r from-quantis-base to-[#121215]" : "border border-slate-200/90 bg-white"}` }>
            <div className="flex items-center gap-5">
              <div className={`flex h-12 w-12 items-center justify-center rounded transition-all duration-300 ${isDark ? "border border-white/10 bg-white/5" : "border border-slate-300 bg-slate-50"}`}>
                <Cpu className={`h-5 w-5 ${isDark ? "text-white/60" : "text-slate-700"}`} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="agent-kicker text-[10px] font-mono">
                  VYZOR_AGENT {" > "} SIMULATION RENTABILITÉ
                </span>
                <p className={`text-[14px] font-medium ${isDark ? "text-white/80" : "text-slate-700"}`}>
                  {simulationLabel}
                </p>
              </div>
            </div>
            <div className={`flex h-10 w-10 items-center justify-center rounded transition-all duration-300 ${isDark ? "border border-white/10 bg-white/5 hover:border-quantis-gold hover:bg-quantis-gold" : "border border-slate-300 bg-slate-50 hover:border-quantis-gold hover:bg-quantis-gold/20"}`}>
              <ArrowRight className={`h-5 w-5 transition-colors ${isDark ? "text-white hover:text-black" : "text-slate-700"}`} />
            </div>
          </div>
        </button>
      </div>
    </section>
  );
}

type MetricCardProps = {
  searchId?: string;
  /** Titre vulgarisé (ligne 2). */
  title: string;
  /** Nom officiel uppercase (ligne 1). */
  tag: string;
  /** Valeur formatée affichée en grand. */
  value: string;
  delayMs: number;
  /** id du KPI dans le registre — déclenche tooltip + diagnostic + badge. */
  kpiId?: string;
  /** Valeur numérique courante — sert au tooltip et au diagnostic. */
  kpiValue?: number | null;
  /**
   * Tous les KPIs de la période précédente. La card va y chercher la
   * valeur correspondant à son kpiId pour calculer la variation +/-X%.
   * Plus pratique que de passer `kpiPreviousValue` à chaque call-site.
   */
  previousKpis?: CalculatedKpis | null;
  /** Card cliquable → pilote la courbe d'évolution top de la page. */
  onSelect?: () => void;
  isSelected?: boolean;
  /** Props legacy conservés pour compat — plus rendus. */
  footerLabel?: string;
  footerCode?: string;
  trend?: KpiTrend;
  icon?: ReactNode;
  helpText?: string;
};

function MetricCard({
  searchId,
  title,
  tag,
  value,
  delayMs,
  kpiId,
  kpiValue,
  previousKpis,
  onSelect,
  isSelected,
}: MetricCardProps) {
  const previousValue =
    kpiId && previousKpis
      ? (previousKpis as Record<string, number | null>)[kpiId] ?? null
      : null;
  return (
    <div
      className="col-span-1 md:col-span-4"
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

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

function formatCompactCurrency(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}
