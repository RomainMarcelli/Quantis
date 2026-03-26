// File: components/dashboard/navigation/ValueCreationTest.tsx
// Role: propose une variante "test" premium de la section Création de valeur avec les KPI réels de l'analyse.
"use client";

import { type MouseEvent, type ReactNode, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BarChartBig,
  Cpu,
  Landmark,
  Layers,
  PieChart as PieChartIcon
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatPercent } from "@/components/dashboard/formatting";
import { useAnimatedNumber } from "@/components/dashboard/useAnimatedNumber";
import {
  buildBreakEvenModel,
  buildMonthlyRevenueSeries,
  buildTmscvPieData
} from "@/lib/dashboard/tabs/valueCreationData";
import { TestTopStatus } from "@/components/dashboard/navigation/TestTopStatus";
import type { CalculatedKpis } from "@/types/analysis";

type ValueCreationTestProps = {
  kpis: CalculatedKpis;
};

export function ValueCreationTest({ kpis }: ValueCreationTestProps) {
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

  // Donut TMSCV enrichi: basé sur la composition déjà centralisée dans la couche data.
  const tmscvPieData = useMemo(() => buildTmscvPieData(kpis.tmscv), [kpis.tmscv]);

  // Modèle de point mort réutilisé pour conserver la même logique que le dashboard principal.
  const breakEvenModel = useMemo(
    () =>
      buildBreakEvenModel({
        ca: kpis.ca,
        chargesFixes: kpis.charges_fixes,
        chargesVariables: kpis.charges_var,
        pointMort: kpis.point_mort
      }),
    [kpis.ca, kpis.charges_fixes, kpis.charges_var, kpis.point_mort]
  );

  // Compteurs animés pour retrouver l'effet "data-react" sans script DOM global.
  const animatedCa = useAnimatedNumber(kpis.ca, { durationMs: 1400 });
  const animatedTcam = useAnimatedNumber(kpis.tcam, { durationMs: 1300 });
  const animatedEbe = useAnimatedNumber(kpis.ebe, { durationMs: 1350 });
  const animatedResultatNet = useAnimatedNumber(kpis.resultat_net, { durationMs: 1450 });
  const animatedTmscv = useAnimatedNumber(kpis.tmscv, { durationMs: 1250 });

  // Mouse glow local: activé uniquement dans la zone test pour ne pas impacter le reste de la page.
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

  const maxVolume = breakEvenModel.points[breakEvenModel.points.length - 1]?.volume ?? 1;
  const splitVolume = Math.min(Math.max(breakEvenModel.pointMortVolume, 0), maxVolume);
  const allY = breakEvenModel.points.flatMap((point) => [point.ca, point.couts, point.marge]);
  const minY = Math.min(...allY, 0);
  const maxY = Math.max(...allY, breakEvenModel.pointMortValeur, 1);
  const yDelta = maxY - minY || 1;

  // Helpers d'échelle pour dessiner le SVG de point mort de façon responsive.
  const xScale = (volume: number) => (volume / maxVolume) * 1000;
  const yScale = (value: number) => 250 - ((value - minY) / yDelta) * 250;

  const caLine = `M 0 ${yScale(0)} L 1000 ${yScale(maxVolume)}`;
  const coutLine = `M 0 ${yScale(breakEvenModel.points[0]?.couts ?? 0)} L 1000 ${yScale(
    breakEvenModel.points[breakEvenModel.points.length - 1]?.couts ?? 0
  )}`;
  const margeLine = `M 0 ${yScale(breakEvenModel.points[0]?.marge ?? 0)} L 1000 ${yScale(
    breakEvenModel.points[breakEvenModel.points.length - 1]?.marge ?? 0
  )}`;
  const pointX = xScale(splitVolume);
  const pointY = yScale(breakEvenModel.pointMortValeur);

  const startRevenue = monthlySeries[0]?.revenue ?? 0;
  const endRevenue = monthlySeries[monthlySeries.length - 1]?.revenue ?? 0;
  const growthDelta = startRevenue > 0 ? ((endRevenue - startRevenue) / startRevenue) * 100 : 0;
  const caLabel = kpis.ca === null ? "N/D" : formatCompactCurrency(animatedCa);
  const tcamLabel = kpis.tcam === null ? "N/D" : formatPercent(animatedTcam);
  const ebeLabel = kpis.ebe === null ? "N/D" : formatCompactCurrency(animatedEbe);
  const resultatNetLabel =
    kpis.resultat_net === null ? "N/D" : formatCompactCurrency(animatedResultatNet);
  const tmscvLabel = kpis.tmscv === null ? "N/D" : formatPercent(animatedTmscv);
  const caFooterLabel =
    kpis.ca === null ? "Donnée indisponible" : growthDelta >= 0 ? "Croissance validée" : "Sous surveillance";

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

      {/* Badge de contexte en flux normal pour éviter la superposition visuelle du bandeau test. */}
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
            Création de valeur
          </h2>
        </div>

        <div className="mt-3 flex flex-col items-end gap-2 md:mt-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-3 w-3 text-white/30" />
            <span className="text-[11px] font-mono uppercase text-white/40">
              Vue consolidée - Exercice en cours
            </span>
          </div>
          <div className="interactive-badge flex items-center gap-2 rounded border border-white/10 bg-white/[0.02] px-3 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10B981]" />
            <span className="text-[10px] font-medium uppercase tracking-widest text-white/80">Analyse dynamique</span>
          </div>
        </div>
      </header>

      <div className="relative z-[4] grid grid-cols-1 gap-5 md:grid-cols-12">
        <MetricCard
          delayMs={100}
          searchId="analysis-vc-ca"
          title="Volume d'activité"
          tag="Chiffre d'affaires"
          value={caLabel}
          footerLabel={caFooterLabel}
          footerCode="SIG_CA_01"
          icon={<Layers className="h-4 w-4 text-white/40 transition-colors group-hover:text-quantis-gold" />}
          helpText="Le chiffre d'affaires totalise l'ensemble des ventes de biens et services."
        />
        <MetricCard
          delayMs={150}
          searchId="analysis-vc-tcam"
          title="Vitesse de développement"
          tag="TCAM %"
          value={tcamLabel}
          footerLabel="Moy. secteur: 8.2%"
          footerCode="GROWTH_RATE"
          icon={<Activity className="h-4 w-4 text-white/40 transition-colors group-hover:text-quantis-gold" />}
          helpText="Le TCAM mesure la dynamique de croissance moyenne annuelle."
        />
        <MetricCard
          delayMs={200}
          searchId="analysis-vc-ebe"
          title="Performance opérationnelle"
          tag="Excédent Brut (EBE)"
          value={ebeLabel}
          footerLabel="+4.2% vs budget"
          footerCode="EBITDA_M01"
          icon={<BarChartBig className="h-4 w-4 text-white/40 transition-colors group-hover:text-quantis-gold" />}
          helpText="L'EBE indique la richesse générée par l'exploitation."
        />

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
              <div className="flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-white/5 transition-all duration-300 group-hover:border-quantis-gold/30 group-hover:bg-quantis-gold/10">
                <Landmark className="h-4 w-4 text-white/40 transition-colors group-hover:text-quantis-gold" />
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-4">
              <div className="data-react tnum text-[2.6rem] font-semibold leading-none tracking-tight text-white">
                {resultatNetLabel}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="text-[10px] uppercase text-white/45">Marge nette</span>
                <span className="tech-tag text-sm font-semibold text-white">
                  {formatPercent(kpis.netProfit, 1)}
                </span>
              </div>
            </div>
          </div>
          <p className="edu-text">Le bénéfice final après toutes les charges et impôts.</p>
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
              <div className="flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-white/5 transition-all duration-300 group-hover:border-quantis-gold/30 group-hover:bg-quantis-gold/10">
                <PieChartIcon className="h-4 w-4 text-white/40 transition-colors group-hover:text-quantis-gold" />
              </div>
            </div>

            <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="data-react tnum text-[2.6rem] font-semibold leading-none tracking-tight text-white">
                {tmscvLabel}
              </div>
              <div className="h-32 w-full sm:w-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={tmscvPieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={34}
                      outerRadius={52}
                      stroke="#121217"
                      strokeWidth={1}
                    >
                      {tmscvPieData.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111216",
                        border: "1px solid #2a2a30",
                        borderRadius: "10px"
                      }}
                      formatter={(value, _name, payload) => {
                        const actualValue = Number(payload?.payload?.actualValue ?? value ?? 0);
                        return `${actualValue.toFixed(1)}%`;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <p className="edu-text">
            Le TMSCV mesure la marge disponible pour absorber les charges fixes.
          </p>
        </article>

        <article
          className="precision-card fade-up group col-span-1 rounded-2xl p-8 md:col-span-12"
          style={{ animationDelay: "400ms" }}
          data-search-id="analysis-vc-point-mort"
        >
          <div className="card-header mb-6 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Seuil de rentabilité</h3>
              <p className="mt-1 text-[10px] font-mono uppercase text-white/45">Analyse du point mort</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase text-white/60">
              <LegendDot color="#f3f4f6" label="CA" />
              <LegendDot color="#C5A059" label="Coûts" />
              <LegendDot color="#f59e0b" label="Marge" />
            </div>
          </div>

          <div className="relative h-72 w-full">
            <svg className="h-full w-full" viewBox="0 0 1000 250" preserveAspectRatio="none">
              <line x1="0" y1="50" x2="1000" y2="50" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
              <line x1="0" y1="100" x2="1000" y2="100" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
              <line x1="0" y1="150" x2="1000" y2="150" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
              <line x1="0" y1="200" x2="1000" y2="200" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />

              <line x1="0" y1="0" x2="0" y2="250" stroke="rgba(255,255,255,0.2)" />
              <line x1="0" y1="250" x2="1000" y2="250" stroke="rgba(255,255,255,0.2)" />

              {/* Zone de pertes avant point mort. */}
              <polygon
                points={`0,250 ${pointX},${pointY} 0,${yScale(breakEvenModel.points[0]?.couts ?? 0)}`}
                fill="rgba(239,68,68,0.12)"
              />
              {/* Zone de bénéfices après point mort. */}
              <polygon
                points={`${pointX},${pointY} 1000,${yScale(maxVolume)} 1000,${yScale(
                  breakEvenModel.points[breakEvenModel.points.length - 1]?.couts ?? 0
                )}`}
                fill="rgba(16,185,129,0.16)"
              />

              <path d={caLine} stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" fill="none" />
              <path d={coutLine} stroke="#C5A059" strokeWidth="2.5" fill="none" />
              <path d={margeLine} stroke="#f59e0b" strokeWidth="2.5" fill="none" />

              <line x1={pointX} y1={pointY} x2={pointX} y2="250" stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
              <line x1="0" y1={pointY} x2={pointX} y2={pointY} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
              <circle cx={pointX} cy={pointY} r="6" fill="#0f0f12" stroke="#C5A059" strokeWidth="3" />
              <circle cx={pointX} cy={pointY} r="13" fill="rgba(197,160,89,0.14)" />
            </svg>

            <div className="absolute left-3 top-3 rounded-md border border-quantis-gold/30 bg-black/55 px-2 py-1 text-[11px] text-quantis-gold">
              Point mort: {formatCompactCurrency(splitVolume)}
            </div>
            <div className="absolute bottom-2 left-3 rounded-md border border-rose-400/35 bg-rose-500/15 px-2 py-1 text-[11px] text-rose-200">
              Avant: pertes
            </div>
            <div className="absolute bottom-2 right-3 rounded-md border border-emerald-400/35 bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-200">
              Après: bénéfices
            </div>
          </div>

          <p className="edu-text mt-8">
            Le point mort indique le niveau d&apos;activité où le chiffre d&apos;affaires couvre exactement les coûts.
          </p>
        </article>

        <button
          type="button"
          className="precision-card fade-up col-span-1 w-full overflow-hidden rounded-xl p-0 text-left md:col-span-12"
          style={{ animationDelay: "500ms" }}
        >
          <div className="flex flex-col items-start justify-between gap-4 bg-gradient-to-r from-quantis-base to-[#121215] p-6 md:flex-row md:items-center">
            <div className="flex items-center gap-5">
              <div className="flex h-12 w-12 items-center justify-center rounded border border-white/10 bg-white/5 transition-all duration-300">
                <Cpu className="h-5 w-5 text-white/60" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono text-quantis-gold">
                  QUANTIS_AGENT {" > "} SIMULATION RENTABILITÉ
                </span>
                <p className="text-[14px] font-medium text-white/80">
                  Une baisse des charges fixes de 3% avancerait le point mort de 12 jours.
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

type MetricCardProps = {
  searchId?: string;
  title: string;
  tag: string;
  value: string;
  footerLabel: string;
  footerCode: string;
  icon: ReactNode;
  helpText: string;
  delayMs: number;
};

function MetricCard({
  searchId,
  title,
  tag,
  value,
  footerLabel,
  footerCode,
  icon,
  helpText,
  delayMs
}: MetricCardProps) {
  return (
    <article
      className="precision-card fade-up group col-span-1 flex flex-col justify-between rounded-2xl p-6 md:col-span-4"
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
        <p className="data-react tnum text-[2.2rem] font-medium leading-none tracking-tight text-white">{value}</p>
        <div className="mt-5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            <span className="text-[11px] text-white/80">{footerLabel}</span>
          </div>
          <span className="text-[10px] font-mono text-white/35">{footerCode}</span>
        </div>
      </div>
      <p className="edu-text">{helpText}</p>
    </article>
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

