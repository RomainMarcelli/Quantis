// File: components/dashboard/DashboardLayout.tsx
// Role: compose la grille premium du dashboard (header, cards KPI, score, insight) avec donnees normalisees.
"use client";

import { type ReactNode, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Wallet
} from "lucide-react";
import type { PremiumKpis } from "@/lib/dashboard/premiumDashboardAdapter";
import { getPremiumHealthState } from "@/lib/dashboard/premiumDashboardAdapter";
import { formatMonths } from "@/components/dashboard/formatting";
import { AIInsight } from "@/components/dashboard/AIInsight";
import { HealthScore } from "@/components/dashboard/HealthScore";
import { KPIBlock } from "@/components/dashboard/KPIBlock";
import { KPIWide } from "@/components/dashboard/KPIWide";

type DashboardLayoutProps = {
  companyName: string;
  greetingName: string;
  kpis: PremiumKpis;
  children?: ReactNode;
};

export function DashboardLayout({ companyName, greetingName, kpis, children }: DashboardLayoutProps) {
  // Panneau de simulation IA: score localement ajustable, sans impacter les donnees source.
  // La reinitialisation se fait via le `key` du composant (analysis.id) dans la vue parente.
  const [simulatedScore, setSimulatedScore] = useState<number>(
    Math.round(kpis.healthScore ?? 0)
  );

  const healthState = useMemo(
    () => getPremiumHealthState(simulatedScore),
    [simulatedScore]
  );

  const aiMessage = useMemo(() => {
    const runwayLabel = formatMonths(kpis.runway);
    if (kpis.tresorerie !== null && kpis.tresorerie > 0) {
      return `Flux de trésorerie exploitable (${runwayLabel}). Une projection RH reste soutenable.`;
    }

    return "Priorité liquidité détectée. Revue des décaissements recommandée avant engagement.";
  }, [kpis.runway, kpis.tresorerie]);

  return (
    <section className="premium-analysis-root relative overflow-hidden rounded-2xl p-4 md:p-8">
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />

      {/* Panel IA compact, ancre au coin superieur droit du dashboard pour liberer l'espace visuel. */}
      {/* <div className="precision-card absolute right-8 top-3 z-20 flex items-center gap-1.5 rounded-md border-white/10 px-2 py-1.5 shadow-2xl">
        <div className="flex items-center gap-1.5 border-r border-white/10 pr-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-quantis-gold shadow-[0_0_8px_rgba(197,160,89,0.5)]" />
          <span className="text-[9px] font-mono uppercase text-quantis-muted">OVR</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={simulatedScore}
          onChange={(event) => setSimulatedScore(Number(event.target.value))}
          className="h-1 w-14 cursor-pointer appearance-none rounded-none bg-white/10 accent-quantis-gold md:w-16"
          aria-label="Simulation score sante"
        />
        <div className="w-[52px] pr-0.5 text-right">
          <span className="block text-[7px] font-medium uppercase tracking-[0.12em] text-white/55">
            Simulation IA
          </span>
        </div>
      </div> */}

      <header className="fade-up relative z-10 mb-12 flex w-full flex-col items-start justify-between gap-6 md:flex-row md:items-end">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="interactive-badge flex h-8 w-8 items-center justify-center border border-quantis-gold/20 bg-quantis-base">
              <span className="text-sm font-bold text-quantis-gold">Q</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white">Quantis</span>
              <span className="text-[10px] font-mono text-quantis-muted">
                {companyName || "Système d’exploitation financier"}
              </span>
            </div>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Cockpit financier
          </h1>
          <p className="text-sm text-quantis-muted">
            Bonjour {greetingName}, voici la vue d&apos;ensemble de votre santé financière.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-3 w-3 text-white/30" />
            <span className="text-[11px] font-mono uppercase text-white/40">
              Vue d&apos;ensemble - Temps réel
            </span>
          </div>
          <div className="interactive-badge flex items-center gap-2 rounded border border-white/10 bg-white/[0.02] px-3 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10B981]" />
            <span className="text-[10px] font-medium uppercase tracking-widest text-white/80">Synchronisation active</span>
          </div>
        </div>
      </header>

      <div className="relative z-10 grid grid-cols-1 gap-5 md:grid-cols-12">
        <HealthScore score={simulatedScore} tag={healthState.severity.toUpperCase()} />

        <div className="grid grid-cols-1 gap-5 md:col-span-12 md:grid-cols-2 lg:col-span-7">
          <KPIBlock
            title="Ce qui rentre"
            tag="Chiffre d'Affaires"
            value={kpis.ca}
            format="currency"
            trendValue={kpis.croissance}
            trendLabel="vs M-1"
            icon={<ArrowUpRight className="h-4 w-4 text-white/40 group-hover:text-quantis-gold" />}
          />

          <KPIBlock
            title="Sur le compte"
            tag="Tresorerie Nette"
            value={kpis.tresorerie}
            format="currency"
            sideLabel={`Runway: ${formatMonths(kpis.runway)}`}
            trendLabel="LIQUIDITÉ"
            icon={<Wallet className="h-4 w-4 text-white/40 group-hover:text-quantis-gold" />}
          />

          <KPIWide
            title="Ce qu'il reste vraiment"
            tag="Excedent Brut d'Exploitation"
            value={kpis.ebe}
            target={50000}
          />

          <AIInsight
            message={aiMessage}
            ctaLabel="Ouvrir le simulateur stratégique"
          />
        </div>
      </div>

      {/* Slot pour conserver les blocs fonctionnels existants (dossiers/debug/sections). */}
      {children ? <div className="relative z-10 mt-6">{children}</div> : null}
    </section>
  );
}
