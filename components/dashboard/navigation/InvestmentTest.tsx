// File: components/dashboard/navigation/InvestmentTest.tsx
// Role: propose une variante "test" premium de la section Investissement avec les KPI réels de l'analyse.
"use client";

import { type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Building2,
  Cpu,
  Lock,
  Package,
  Truck,
  Users
} from "lucide-react";
import { formatPercent, INSUFFICIENT_DATA_LABEL } from "@/components/dashboard/formatting";
import { KpiTooltip } from "@/components/kpi/KpiTooltip";
import { KpiCardLayout } from "@/components/kpi/KpiCardLayout";
import { KpiBenchmarkAutoIndicator } from "@/components/synthese/KpiBenchmarkAutoIndicator";
import { KpiEvolutionChart } from "@/components/synthese/KpiEvolutionChart";
import { CustomizableDashboard } from "@/components/dashboard/widgets/CustomizableDashboard";
import type { DashboardLayout, WidgetInstance } from "@/types/dashboard";

// Default layout pour l'onglet Investissement & BFR : reproduit les cartes
// principales d'aujourd'hui (BFR, ratio_immo). La carte "Variation annuelle"
// est retirée — l'info de variation est désormais portée par chaque widget
// KpiCard (ligne N vs N-1 automatique via KpiCardLayout).
import { DEFAULT_DASHBOARD_LAYOUTS } from "@/lib/dashboard/defaultDashboardLayouts";
const DEFAULT_INVESTMENT_LAYOUT = DEFAULT_DASHBOARD_LAYOUTS["investissement-bfr"];
import { KpiTrendPill } from "@/components/dashboard/navigation/KpiTrendPill";
import { useAnimatedNumber } from "@/components/dashboard/useAnimatedNumber";
import { buildKpiTrend, buildSignedTrend, type KpiTrend } from "@/lib/kpi/kpiTrend";
import type { AnalysisRecord, CalculatedKpis } from "@/types/analysis";

type InvestmentTestProps = {
  kpis: CalculatedKpis;
  previousKpis?: CalculatedKpis | null;
  analyses?: AnalysisRecord[];
  currentAnalysis?: AnalysisRecord | null;
  analysisModeLabel?: string | null;
};

export function InvestmentTest({
  kpis,
  previousKpis = null,
  analyses = [],
  currentAnalysis = null,
  analysisModeLabel = null
}: InvestmentTestProps) {
  // KPI sélectionné → pilote la courbe d'évolution top. Défaut = BFR.
  const [selectedKpiId, setSelectedKpiId] = useState<string>("bfr");
  // Compteurs animés pour conserver le rendu "data-react" de la maquette source.
  const animatedBfr = useAnimatedNumber(kpis.bfr, { durationMs: 1400 });
  const animatedRatioImmo = useAnimatedNumber(kpis.ratio_immo, { durationMs: 1200 });
  const animatedRotBfr = useAnimatedNumber(kpis.rot_bfr, { durationMs: 1250 });
  const animatedDso = useAnimatedNumber(kpis.dso, { durationMs: 1200 });
  const animatedDio = useAnimatedNumber(kpis.rot_stocks, { durationMs: 1200 });
  const animatedDpo = useAnimatedNumber(kpis.dpo, { durationMs: 1200 });

  const bfrYearlyVariation = useMemo(
    () => computeYearlyChangePercent(kpis.bfr, previousKpis?.bfr ?? null),
    [kpis.bfr, previousKpis?.bfr]
  );

  const bfrTrend = useMemo(
    () => buildKpiTrend(kpis.bfr, previousKpis?.bfr ?? null),
    [kpis.bfr, previousKpis?.bfr]
  );
  const bfrVariationTrend = useMemo(
    () => buildSignedTrend(bfrYearlyVariation),
    [bfrYearlyVariation]
  );
  const ratioImmoTrend = useMemo(
    () => buildKpiTrend(kpis.ratio_immo, previousKpis?.ratio_immo ?? null),
    [kpis.ratio_immo, previousKpis?.ratio_immo]
  );
  const rotBfrTrend = useMemo(
    () => buildKpiTrend(kpis.rot_bfr, previousKpis?.rot_bfr ?? null),
    [kpis.rot_bfr, previousKpis?.rot_bfr]
  );
  const dsoTrend = useMemo(
    () => buildKpiTrend(kpis.dso, previousKpis?.dso ?? null),
    [kpis.dso, previousKpis?.dso]
  );
  const dioTrend = useMemo(
    () => buildKpiTrend(kpis.rot_stocks, previousKpis?.rot_stocks ?? null),
    [kpis.rot_stocks, previousKpis?.rot_stocks]
  );
  const dpoTrend = useMemo(
    () => buildKpiTrend(kpis.dpo, previousKpis?.dpo ?? null),
    [kpis.dpo, previousKpis?.dpo]
  );
  // Mouse glow local: limité à cette section test pour éviter les effets de bord.
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
            Investissement & BFR
          </h2>
          <p className="text-sm text-quantis-muted">Cycle clients-fournisseurs et usure des immobilisations</p>
        </div>

        {analysisModeLabel ? (
          <div className="interactive-badge flex items-center gap-2 self-start rounded border border-white/10 bg-white/[0.02] px-3 py-1 md:self-auto">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10B981]" />
            <span className="text-[10px] font-medium uppercase tracking-widest text-white/80">{analysisModeLabel}</span>
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

        {/* KPI cards customizable : par défaut BFR + ratio_immo. L'utilisateur
            peut ajouter d'autres KPIs de la catégorie "investissement" (rot_bfr,
            dso, dpo, rot_stocks…) ou changer la viz (gauge, barChart…). */}
        <div className="md:col-span-12">
          <CustomizableDashboard
            userId={null}
            layoutId="dashboard:investissement"
            defaultLayout={DEFAULT_INVESTMENT_LAYOUT}
            kpis={kpis}
            previousKpis={previousKpis}
            analyses={analyses}
            currentAnalysis={currentAnalysis}
            mappedData={currentAnalysis?.mappedData ?? null}
            lockedCategory="investissement"
            kpiSelection={{
              selectedKpiId,
              onSelect: setSelectedKpiId
            }}
          />
        </div>

        <article
          className="precision-card fade-up group col-span-1 rounded-2xl p-8 md:col-span-12"
          style={{ animationDelay: "300ms" }}
          data-search-id="analysis-invest-rotation-bfr"
        >
          {/* Bloc central: lecture détaillée de la rotation BFR et des trois composantes de délai. */}
          <div className="card-header mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Pilotage du cycle d&apos;exploitation</h3>
              <div className="mt-2 flex items-center gap-2">
                <span className="tech-tag text-[10px] font-mono uppercase text-white/60">
                  Ratio de rotation du BFR (jours)
                </span>
                <span className="text-[10px] font-mono text-white/35">CYCLE_SPEED</span>
                <KpiTooltip kpiId="rot_bfr" value={kpis.rot_bfr} />
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {/* rot_bfr peut être négatif (BFR négatif = financé par les fournisseurs)
                  comme positif. On cap l'affichage par |val|, pas par signe : -1492j
                  est aussi anormal que +1492j. */}
              <p
                className={
                  kpis.rot_bfr !== null && Math.abs(kpis.rot_bfr) > ANOMALY_DAYS_THRESHOLD
                    ? "tnum text-4xl font-semibold tracking-tight text-rose-400"
                    : "tnum text-4xl font-semibold tracking-tight text-white"
                }
              >
                {kpis.rot_bfr === null ? INSUFFICIENT_DATA_LABEL : `${Math.round(animatedRotBfr)} jours`}
              </p>
              {kpis.rot_bfr !== null && Math.abs(kpis.rot_bfr) > ANOMALY_DAYS_THRESHOLD ? (
                <p className="rounded border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-300">
                  ⚠ {BFR_ANOMALY}
                </p>
              ) : null}
              <KpiTrendPill trend={rotBfrTrend} compact />
              <KpiBenchmarkAutoIndicator kpiId="rot_bfr" value={kpis.rot_bfr} kpiLabel="Rotation BFR" />
            </div>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-3">
            <DelayCard
              title="Délai clients (DSO)"
              value={kpis.dso === null ? INSUFFICIENT_DATA_LABEL : `${Math.round(animatedDso)} j`}
              trend={dsoTrend}
              icon={<Users className="h-4 w-4 text-amber-400/70" />}
              hint="Temps moyen d'encaissement des factures clients."
              badgeLabel="↘ À réduire"
              badgeTone="warning"
              anomaly={
                kpis.dso !== null && kpis.dso > ANOMALY_DAYS_THRESHOLD
                  ? { message: RECEIVABLES_ANOMALY }
                  : undefined
              }
              kpiId="dso"
              kpiValue={kpis.dso}
              onSelect={() => setSelectedKpiId("dso")}
              isSelected={selectedKpiId === "dso"}
            />
            <DelayCard
              title="Délai stocks (DIO)"
              value={kpis.rot_stocks === null ? INSUFFICIENT_DATA_LABEL : `${Math.round(animatedDio)} j`}
              trend={dioTrend}
              icon={<Package className="h-4 w-4 text-amber-400/70" />}
              hint="Temps moyen d'écoulement du stock."
              badgeLabel="↘ À réduire"
              badgeTone="warning"
              anomaly={
                kpis.rot_stocks !== null && kpis.rot_stocks > ANOMALY_DAYS_THRESHOLD
                  ? { message: INVENTORY_ANOMALY }
                  : undefined
              }
              kpiId="rot_stocks"
              kpiValue={kpis.rot_stocks}
              onSelect={() => setSelectedKpiId("rot_stocks")}
              isSelected={selectedKpiId === "rot_stocks"}
            />
            <DelayCard
              title="Délai fournisseurs (DPO)"
              value={kpis.dpo === null ? INSUFFICIENT_DATA_LABEL : `${Math.round(animatedDpo)} j`}
              trend={dpoTrend}
              icon={<Truck className="h-4 w-4 text-emerald-400/70" />}
              hint="Délai moyen accordé par les fournisseurs."
              badgeLabel="↗ À allonger"
              badgeTone="good"
              anomaly={
                kpis.dpo !== null && kpis.dpo > ANOMALY_DAYS_THRESHOLD
                  ? { message: PAYABLES_ANOMALY }
                  : undefined
              }
              kpiId="dpo"
              kpiValue={kpis.dpo}
              onSelect={() => setSelectedKpiId("dpo")}
              isSelected={selectedKpiId === "dpo"}
            />
          </div>

        </article>

        <button
          type="button"
          className="precision-card fade-up col-span-1 w-full overflow-hidden rounded-xl p-0 text-left md:col-span-12"
          style={{ animationDelay: "400ms" }}
        >
          {/* Bandeau d'action IA: cohérent avec la narration des autres sections de test. */}
          <div className="flex flex-col items-start justify-between gap-4 agent-panel p-6 md:flex-row md:items-center">
            <div className="flex items-center gap-5">
              <div className="flex h-12 w-12 items-center justify-center rounded agent-icon-shell">
                <Cpu className="h-5 w-5 text-white/60" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="agent-kicker text-[10px] font-mono">
                  VYZOR_AGENT {" > "} OPTIMISATION BFR
                </span>
                <p className="text-[14px] font-medium agent-message">
                  Priorité recommandée: sécuriser les encaissements clients et lisser les niveaux de stock.
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

type InvestmentMetricCardProps = {
  searchId?: string;
  title: string;
  tag: string;
  value: string;
  delayMs: number;
  className?: string;
  kpiId?: string;
  kpiValue?: number | null;
  /** Tous les KPIs de la période précédente — la card y cherche kpiId. */
  previousKpis?: CalculatedKpis | null;
  /** Card cliquable → pilote la courbe d'évolution top de la page. */
  onSelect?: () => void;
  isSelected?: boolean;
  /** Props legacy conservés pour compat — plus rendus. */
  statusLabel?: string;
  code?: string;
  helper?: string;
  icon?: ReactNode;
  trend?: KpiTrend;
};

function InvestmentMetricCard({
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
}: InvestmentMetricCardProps) {
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

type DelayCardProps = {
  title: string;
  value: string;
  trend: KpiTrend;
  hint: string;
  badgeLabel: string;
  badgeTone: "good" | "warning";
  icon: ReactNode;
  // Active la mise en garde quand le délai dépasse un seuil métier (ex. DSO/DPO > 365j).
  // On affiche la valeur en rouge + un message court pour qu'un dirigeant ne lise pas
  // un "1 906 jours" comme un chiffre normal.
  anomaly?: { message: string };
  kpiId?: string;
  kpiValue?: number | null;
  /** Carte cliquable → pilote la courbe d'évolution top de la page. */
  onSelect?: () => void;
  isSelected?: boolean;
};

function DelayCard({
  title,
  value,
  trend,
  hint,
  badgeLabel,
  badgeTone,
  anomaly,
  kpiId,
  kpiValue,
  onSelect,
  isSelected
}: DelayCardProps) {
  const badgeClass =
    badgeTone === "good"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
      : "border-amber-400/30 bg-amber-500/10 text-amber-300";
  const valueClass = anomaly
    ? "tnum text-3xl font-medium text-rose-400"
    : "tnum text-3xl font-medium text-white";

  // Selectability identique à KpiCardLayout : article cliquable + ring or quand
  // sélectionné. DelayCard n'utilise pas KpiCardLayout (layout custom avec
  // badge + hint), donc on duplique la logique d'interaction ici.
  const interactiveProps = onSelect
    ? {
        role: "button" as const,
        tabIndex: 0,
        onClick: onSelect,
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }
      }
    : {};
  const selectionClass = onSelect
    ? isSelected
      ? "ring-2 ring-quantis-gold/70 cursor-pointer"
      : "cursor-pointer hover:ring-1 hover:ring-white/20"
    : "";

  return (
    <div
      className={`interactive-badge rounded-xl border border-white/5 bg-white/[0.02] p-5 transition-all hover:border-quantis-gold/30 hover:bg-quantis-gold/[0.03] ${selectionClass}`}
      {...interactiveProps}
    >
      <div className="mb-4 flex items-start justify-between">
        <span className="text-[10px] uppercase tracking-widest text-white/55">{title}</span>
        {kpiId ? <KpiTooltip kpiId={kpiId} value={kpiValue} /> : null}
      </div>
      <div className="mb-3 flex items-end justify-between gap-2">
        <span className={valueClass}>{value}</span>
        <span className={`rounded px-2 py-1 text-[9px] uppercase tracking-wide ${badgeClass}`}>{badgeLabel}</span>
      </div>
      {anomaly ? (
        <p className="mb-2 rounded border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-300">
          ⚠ {anomaly.message}
        </p>
      ) : null}
      {kpiId ? (
        <div className="mb-2">
          <KpiBenchmarkAutoIndicator kpiId={kpiId} value={kpiValue ?? null} kpiLabel={title} />
        </div>
      ) : null}
      <KpiTrendPill trend={trend} compact className="mb-2" />
      <p className="text-[10px] italic text-white/45">{hint}</p>
    </div>
  );
}

// Seuil au-delà duquel un délai en jours devient anormal. Une PME française saine
// a un DSO < 90j, un DPO < 60j. Au-delà de 365j on est forcément face à un
// dénominateur trop petit (CA partiel) ou à un cas pathologique réel à signaler.
const ANOMALY_DAYS_THRESHOLD = 365;
const RECEIVABLES_ANOMALY = "Valeur anormale — vérifiez vos encaissements";
const PAYABLES_ANOMALY = "Valeur anormale — vérifiez vos décaissements fournisseurs";
const INVENTORY_ANOMALY = "Valeur anormale — vérifiez la rotation des stocks";
const BFR_ANOMALY = "Valeur anormale — vérifiez la cohérence du cycle d'exploitation";

function formatCompactCurrency(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

function computeYearlyChangePercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) {
    return null;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatSignedPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return INSUFFICIENT_DATA_LABEL;
  }
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}
