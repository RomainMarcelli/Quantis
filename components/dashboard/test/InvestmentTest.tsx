// File: components/dashboard/test/InvestmentTest.tsx
// Role: propose une variante "test" premium de la section Investissement avec les KPI réels de l'analyse.
"use client";

import { type MouseEvent, type ReactNode, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Building2,
  Cpu,
  Layers,
  Lock,
  Package,
  Truck,
  Users
} from "lucide-react";
import { formatNumber, formatPercent } from "@/components/dashboard/formatting";
import { useAnimatedNumber } from "@/components/dashboard/useAnimatedNumber";
import {
  buildBfrVariationSeries,
  buildClientsVsSuppliersComparison
} from "@/lib/dashboard/investment/investmentViewModel";
import { TestTopStatus } from "@/components/dashboard/test/TestTopStatus";
import type { CalculatedKpis } from "@/types/analysis";

type InvestmentTestProps = {
  kpis: CalculatedKpis;
};

export function InvestmentTest({ kpis }: InvestmentTestProps) {
  // Compteurs animés pour conserver le rendu "data-react" de la maquette source.
  const animatedBfr = useAnimatedNumber(kpis.bfr, { durationMs: 1400 });
  const animatedRatioImmo = useAnimatedNumber(kpis.ratio_immo, { durationMs: 1200 });
  const animatedRotBfr = useAnimatedNumber(kpis.rot_bfr, { durationMs: 1250 });
  const animatedDso = useAnimatedNumber(kpis.dso, { durationMs: 1200 });
  const animatedDio = useAnimatedNumber(kpis.rot_stocks, { durationMs: 1200 });
  const animatedDpo = useAnimatedNumber(kpis.dpo, { durationMs: 1200 });

  // Série mensuelle simulée BFR pour dériver une variation visuelle lisible.
  const bfrSeries = useMemo(() => buildBfrVariationSeries(kpis.bfr), [kpis.bfr]);
  const firstBfr = bfrSeries[0]?.value ?? 0;
  const lastBfr = bfrSeries[bfrSeries.length - 1]?.value ?? 0;
  const variationPercent = firstBfr !== 0 ? ((lastBfr - firstBfr) / Math.abs(firstBfr)) * 100 : 0;

  // Comparaison DSO/DPO pour orienter le message de pilotage de trésorerie.
  const clientsVsSuppliers = useMemo(
    () => buildClientsVsSuppliersComparison(kpis.dso, kpis.dpo),
    [kpis.dso, kpis.dpo]
  );

  // Répartition visuelle des segments du cycle d'exploitation (emplois vs ressources).
  const dsoDays = Math.max(kpis.dso ?? 0, 0);
  const dioDays = Math.max(kpis.rot_stocks ?? 0, 0);
  const dpoDays = Math.max(kpis.dpo ?? 0, 0);
  const emploisDays = dsoDays + dioDays;
  const cycleMax = Math.max(emploisDays, dpoDays, 1);
  const stocksWidth = (dioDays / cycleMax) * 100;
  const clientsWidth = (dsoDays / cycleMax) * 100;
  const fournisseursWidth = (dpoDays / cycleMax) * 100;
  const bfrGapDays = kpis.rot_bfr ?? Math.max(emploisDays - dpoDays, 0);
  const bfrGapWidth = (Math.max(bfrGapDays, 0) / cycleMax) * 100;

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

      {/* Badge de contexte en flux normal pour retirer l'effet "bandeau superposé". */}
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
            Clients & fournisseurs (test)
          </h2>
        </div>

        <div className="mt-3 flex flex-col items-end gap-2 md:mt-0">
          <div className="flex items-center gap-2">
            <Layers className="h-3 w-3 text-white/30" />
            <span className="text-[11px] font-mono uppercase text-white/40">
              Ratios d&apos;investissement & BFR
            </span>
          </div>
          <div className="interactive-badge flex items-center gap-2 rounded border border-white/10 bg-white/[0.02] px-3 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10B981]" />
            <span className="text-[10px] font-medium uppercase tracking-widest text-white/80">Live sync</span>
          </div>
        </div>
      </header>

      <div className="relative z-[4] grid grid-cols-1 gap-5 md:grid-cols-12">
        <InvestmentMetricCard
          delayMs={100}
          className="md:col-span-4"
          title="Cash immobilisé"
          tag="Besoin en fonds de roulement"
          value={kpis.bfr === null ? "N/D" : formatCompactCurrency(animatedBfr)}
          statusLabel={kpis.bfr === null ? "Donnée indisponible" : "Niveau maîtrisé"}
          code="BFR_NET_01"
          icon={<Lock className="h-4 w-4 text-white/40 transition-colors group-hover:text-quantis-gold" />}
          helper="Argent bloqué dans le cycle d'exploitation (stocks + délais clients - délais fournisseurs)."
        />

        <InvestmentMetricCard
          delayMs={150}
          className="md:col-span-4"
          title="Tension de trésorerie"
          tag="Variation du BFR %"
          value={kpis.bfr === null ? "N/D" : formatPercent(variationPercent)}
          statusLabel={
            kpis.bfr === null
              ? "Donnée indisponible"
              : variationPercent <= 0
                ? "Baisse du besoin"
                : "Hausse du besoin"
          }
          code="VAR_BFR_YTD"
          icon={<Activity className="h-4 w-4 text-white/40 transition-colors group-hover:text-quantis-gold" />}
          helper="Évolution du besoin de financement du cycle sur l'exercice."
        />

        <InvestmentMetricCard
          delayMs={200}
          className="md:col-span-4"
          title="Couverture invest."
          tag="Ratio actif / immo nettes"
          value={kpis.ratio_immo === null ? "N/D" : `${formatNumber(animatedRatioImmo, 2)}x`}
          statusLabel={
            kpis.ratio_immo === null
              ? "Donnée indisponible"
              : kpis.ratio_immo >= 1
                ? "Sécurisé (> 1.0)"
                : "Sous seuil"
          }
          code="CAPEX_RATIO"
          icon={<Building2 className="h-4 w-4 text-white/40 transition-colors group-hover:text-quantis-gold" />}
          helper="Mesure si les investissements longs sont couverts par des ressources stables."
        />

        <article
          className="precision-card fade-up group col-span-1 rounded-2xl p-8 md:col-span-12"
          style={{ animationDelay: "300ms" }}
        >
          {/* Bloc central: lecture détaillée de la rotation BFR et des trois composantes de délai. */}
          <div className="card-header mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Vitesse du cycle d&apos;exploitation</h3>
              <div className="mt-2 flex items-center gap-2">
                <span className="tech-tag text-[10px] font-mono uppercase text-white/60">
                  Ratio de rotation du BFR (jours)
                </span>
                <span className="text-[10px] font-mono text-white/35">CYCLE_SPEED</span>
              </div>
            </div>
            <p className="tnum text-4xl font-semibold tracking-tight text-white">
              {kpis.rot_bfr === null ? "N/D" : `${Math.round(animatedRotBfr)} jours`}
            </p>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-3">
            <DelayCard
              title="Délai clients (DSO)"
              value={kpis.dso === null ? "N/D" : `${Math.round(animatedDso)} j`}
              icon={<Users className="h-4 w-4 text-amber-400/70" />}
              hint="Temps moyen d'encaissement des factures clients."
              badgeLabel="↘ À réduire"
              badgeTone="warning"
            />
            <DelayCard
              title="Délai stocks (DIO)"
              value={kpis.rot_stocks === null ? "N/D" : `${Math.round(animatedDio)} j`}
              icon={<Package className="h-4 w-4 text-amber-400/70" />}
              hint="Temps moyen d'écoulement du stock."
              badgeLabel="↘ À réduire"
              badgeTone="warning"
            />
            <DelayCard
              title="Délai fournisseurs (DPO)"
              value={kpis.dpo === null ? "N/D" : `${Math.round(animatedDpo)} j`}
              icon={<Truck className="h-4 w-4 text-emerald-400/70" />}
              hint="Délai moyen accordé par les fournisseurs."
              badgeLabel="↗ À allonger"
              badgeTone="good"
            />
          </div>

          {/* Schéma synthétique emplois/ressources pour matérialiser le "trou" de BFR. */}
          <div className="rounded-xl border border-white/5 bg-quantis-base p-6">
            <h4 className="text-center text-[11px] uppercase tracking-widest text-white/65">
              Modélisation de l&apos;équilibre du BFR
            </h4>

            <div className="mt-6 space-y-4">
              <div>
                <p className="mb-1 text-[10px] uppercase text-amber-300/80">Stocks</p>
                <div className="relative h-6 overflow-hidden rounded border border-amber-400/40 bg-amber-500/10">
                  <div className="bar-segment h-full bg-amber-500/25" style={{ width: `${stocksWidth}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-amber-200">
                    {kpis.rot_stocks === null ? "N/D" : `${Math.round(animatedDio)} j`}
                  </span>
                </div>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase text-amber-300/80">Clients</p>
                <div className="relative h-6 overflow-hidden rounded border border-amber-400/40 bg-amber-500/10">
                  <div className="bar-segment h-full bg-amber-500/25" style={{ width: `${clientsWidth}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-amber-200">
                    {kpis.dso === null ? "N/D" : `${Math.round(animatedDso)} j`}
                  </span>
                </div>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase text-emerald-300/80">Fournisseurs</p>
                <div className="relative h-6 overflow-hidden rounded border border-emerald-400/40 bg-emerald-500/10">
                  <div className="bar-segment h-full bg-emerald-500/25" style={{ width: `${fournisseursWidth}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-emerald-200">
                    {kpis.dpo === null ? "N/D" : `${Math.round(animatedDpo)} j`}
                  </span>
                </div>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase text-rose-300/80">Écart BFR</p>
                <div className="relative h-6 overflow-hidden rounded border border-rose-400/40 bg-rose-500/10">
                  <div className="bar-segment h-full bg-rose-500/25" style={{ width: `${bfrGapWidth}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-rose-200">
                    {kpis.rot_bfr === null ? "N/D" : `${Math.round(animatedRotBfr)} j`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/75">
            <span className="font-medium text-white">Interprétation cycle:</span>{" "}
            {clientsVsSuppliers.deltaDays === null
              ? "Données incomplètes pour comparer les délais."
              : `Écart DSO-DPO: ${Math.round(clientsVsSuppliers.deltaDays)} j`}
          </div>

          <p className="edu-text mt-6">
            L&apos;objectif est de réduire les délais d&apos;encaissement et de rotation stock, tout en sécurisant un
            délai fournisseur adapté.
          </p>
        </article>

        <button
          type="button"
          className="precision-card fade-up col-span-1 w-full overflow-hidden rounded-xl p-0 text-left md:col-span-12"
          style={{ animationDelay: "400ms" }}
        >
          {/* Bandeau d'action IA: cohérent avec la narration des autres sections de test. */}
          <div className="flex flex-col items-start justify-between gap-4 bg-gradient-to-r from-quantis-base to-[#121215] p-6 md:flex-row md:items-center">
            <div className="flex items-center gap-5">
              <div className="flex h-12 w-12 items-center justify-center rounded border border-white/10 bg-white/5">
                <Cpu className="h-5 w-5 text-white/60" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono text-quantis-gold">
                  QUANTIS_AGENT {" > "} OPTIMISATION BFR
                </span>
                <p className="text-[14px] font-medium text-white/80">
                  Le délai client peut être réduit via une relance automatisée segmentée.
                </p>
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded border border-white/10 bg-white/5 transition-all duration-300 hover:border-quantis-gold hover:bg-quantis-gold">
              <ArrowRight className="h-5 w-5 text-white transition-colors hover:text-black" />
            </div>
          </div>
        </button>
      </div>
    </section>
  );
}

type InvestmentMetricCardProps = {
  title: string;
  tag: string;
  value: string;
  statusLabel: string;
  code: string;
  helper: string;
  icon: ReactNode;
  delayMs: number;
  className?: string;
};

function InvestmentMetricCard({
  title,
  tag,
  value,
  statusLabel,
  code,
  helper,
  icon,
  delayMs,
  className
}: InvestmentMetricCardProps) {
  return (
    <article
      className={`precision-card fade-up group col-span-1 flex flex-col justify-between rounded-2xl p-6 ${className ?? ""}`}
      style={{ animationDelay: `${delayMs}ms` }}
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
        <div className="mt-5 flex items-center justify-between">
          <span className="text-[11px] text-white/80">{statusLabel}</span>
          <span className="text-[10px] font-mono text-white/35">{code}</span>
        </div>
      </div>
      <p className="edu-text">{helper}</p>
    </article>
  );
}

type DelayCardProps = {
  title: string;
  value: string;
  hint: string;
  badgeLabel: string;
  badgeTone: "good" | "warning";
  icon: ReactNode;
};

function DelayCard({ title, value, hint, badgeLabel, badgeTone, icon }: DelayCardProps) {
  const badgeClass =
    badgeTone === "good"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
      : "border-amber-400/30 bg-amber-500/10 text-amber-300";

  return (
    <div className="interactive-badge rounded-xl border border-white/5 bg-white/[0.02] p-5 transition-all hover:border-quantis-gold/30 hover:bg-quantis-gold/[0.03]">
      <div className="mb-4 flex items-start justify-between">
        <span className="text-[10px] uppercase tracking-widest text-white/55">{title}</span>
        {icon}
      </div>
      <div className="mb-3 flex items-end justify-between gap-2">
        <span className="tnum text-3xl font-medium text-white">{value}</span>
        <span className={`rounded px-2 py-1 text-[9px] uppercase tracking-wide ${badgeClass}`}>{badgeLabel}</span>
      </div>
      <p className="text-[10px] italic text-white/45">{hint}</p>
    </div>
  );
}

function formatCompactCurrency(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}
