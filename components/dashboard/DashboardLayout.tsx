// File: components/dashboard/DashboardLayout.tsx
// Role: compose la grille premium du dashboard (header, cards KPI, score, insight) avec donnees normalisees.
"use client";

import type { ReactNode } from "react";
import { Activity, ArrowUpRight, Wallet } from "lucide-react";
import type { PremiumKpis } from "@/lib/dashboard/premiumDashboardAdapter";
import { getPremiumHealthState } from "@/lib/dashboard/premiumDashboardAdapter";
import { formatMonths } from "@/components/dashboard/formatting";
import { AIInsight } from "@/components/dashboard/AIInsight";
import { HealthScore } from "@/components/dashboard/HealthScore";
import { KPIBlock } from "@/components/dashboard/KPIBlock";
import { KPIWide } from "@/components/dashboard/KPIWide";

export type DashboardLayoutSearchIds = {
  score?: string;
  revenue?: string;
  cash?: string;
  ebe?: string;
  recommendation?: string;
};

type DashboardLayoutProps = {
  companyName: string;
  greetingName: string;
  kpis: PremiumKpis;
  /**
   * KPIs de la période antérieure de même durée — passés aux KPIBlock /
   * KPIWide pour calculer la variation +/-X% sur chaque card.
   * Optionnel ; null/undefined = pas de variation affichée.
   */
  previousKpis?: PremiumKpis | null;
  children?: ReactNode;
  scoreCard?: ReactNode;
  title?: string;
  subtitle?: string;
  statusLabel?: string;
  statusBadgeLabel?: string;
  aiMessage?: string;
  aiCtaLabel?: string;
  searchIds?: DashboardLayoutSearchIds;
  headerAction?: ReactNode;
};

export function DashboardLayout({
  companyName,
  greetingName,
  kpis,
  previousKpis,
  children,
  scoreCard,
  title = "Cockpit financier",
  subtitle,
  statusLabel = "Vue d'ensemble - Temps réel",
  statusBadgeLabel = "Synchronisation active",
  aiMessage,
  aiCtaLabel = "Ouvrir le simulateur strategique",
  searchIds,
  headerAction
}: DashboardLayoutProps) {
  const healthState = getPremiumHealthState(kpis.healthScore);

  const resolvedSubtitle =
    subtitle ?? `Bonjour ${greetingName}, voici la vue d'ensemble de votre santé financière.`;

  const defaultAiMessage =
    kpis.disponibilites !== null && kpis.disponibilites > 0
      ? `Flux de trésorerie disponible (${formatMonths(kpis.runway)}). Une projection RH reste soutenable.`
      : "Priorité liquidité détectée. Révision des décaissements recommandée avant tout engagement.";

  return (
    <section className="premium-analysis-root relative overflow-hidden rounded-2xl p-4 md:p-8">
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />

      <header className="fade-up relative z-10 mb-12 flex w-full flex-col items-start justify-between gap-6 md:flex-row md:items-end">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="interactive-badge flex h-8 w-8 items-center justify-center border border-quantis-gold/20 bg-quantis-base">
              <span className="text-sm font-bold text-quantis-gold">Q</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white">Quantis</span>
              <span className="text-[10px] font-mono text-quantis-muted">
                {companyName || "Système d'exploitation financier"}
              </span>
            </div>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">{title}</h1>
          <p className="text-sm text-quantis-muted">{resolvedSubtitle}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-3 w-3 text-white/30" />
            <span className="text-[11px] font-mono uppercase text-white/40">{statusLabel}</span>
          </div>
          <div className="interactive-badge flex items-center gap-2 rounded border border-white/10 bg-white/[0.02] px-3 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10B981]" />
            <span className="text-[10px] font-medium uppercase tracking-widest text-white/80">
              {statusBadgeLabel}
            </span>
          </div>
          {headerAction ? <div className="mt-1">{headerAction}</div> : null}
        </div>
      </header>

      <div className="relative z-10 grid grid-cols-1 gap-5 md:grid-cols-12">
        {scoreCard ?? <HealthScore score={kpis.healthScore} tag={healthState.severity.toUpperCase()} searchId={searchIds?.score} />}

        <div
          id="synthese-kpi-container"
          data-tour-id="synthese-kpi-container"
          className="grid grid-cols-1 gap-5 md:col-span-12 md:grid-cols-2 lg:col-span-7"
        >
          <KPIBlock
            title="Ce qui rentre"
            tag="Chiffre d'Affaires"
            value={kpis.ca}
            previousValue={previousKpis?.ca ?? null}
            format="currency"
            searchId={searchIds?.revenue}
            kpiId="ca"
          />

          <KPIBlock
            title="Sur le compte"
            tag="Disponibilités"
            value={kpis.disponibilites}
            previousValue={previousKpis?.disponibilites ?? null}
            format="currency"
            sideLabel={`Runway: ${formatMonths(kpis.runway)}`}
            searchId={searchIds?.cash}
            kpiId="disponibilites"
          />

          <KPIWide
            title="Ce qu'il reste vraiment"
            tag="Excédent brut d'exploitation"
            value={kpis.ebe}
            previousValue={previousKpis?.ebe ?? null}
            target={50000}
            searchId={searchIds?.ebe}
            kpiId="ebe"
          />

          <AIInsight message={aiMessage ?? defaultAiMessage} ctaLabel={aiCtaLabel} searchId={searchIds?.recommendation} />
        </div>
      </div>

      {children ? <div className="relative z-10 mt-6">{children}</div> : null}
    </section>
  );
}
