// File: components/dashboard/navigation/InvestmentTest.tsx
// Role: onglet "Investissement & BFR" — uniquement le container
// `CustomizableDashboard`. Le bloc "Pilotage du cycle d'exploitation" et le
// bandeau VYZOR_AGENT ont été convertis : le premier devient un widget
// dédié `bfrCycle` inclus dans le layout par défaut, le second a été
// supprimé (l'utilisateur veut une grille 100% widget).
"use client";

import { type MouseEvent, useState } from "react";
import { CustomizableDashboard } from "@/components/dashboard/widgets/CustomizableDashboard";
import { DEFAULT_DASHBOARD_LAYOUTS } from "@/lib/dashboard/defaultDashboardLayouts";
import type { AnalysisRecord, CalculatedKpis } from "@/types/analysis";

const DEFAULT_INVESTMENT_LAYOUT = DEFAULT_DASHBOARD_LAYOUTS["investissement-bfr"];

type InvestmentTestProps = {
  kpis: CalculatedKpis;
  previousKpis?: CalculatedKpis | null;
  analyses?: AnalysisRecord[];
  currentAnalysis?: AnalysisRecord | null;
  /** Reçu pour compat — non utilisé (badge mode rendu côté parent). */
  analysisModeLabel?: string | null;
  /** UID Firebase pour persister les modifs du layout. Null = pas de save. */
  userId?: string | null;
  /** Edition pilotée depuis le AppHeader (brief 09/06/2026). */
  controlledIsEditing?: boolean;
  onEditingChange?: (next: boolean) => void;
};

export function InvestmentTest({
  kpis,
  previousKpis = null,
  analyses = [],
  currentAnalysis = null,
  userId = null,
  controlledIsEditing,
  onEditingChange,
}: InvestmentTestProps) {
  // Mouse glow local (visuel premium-analysis-root) — limité à cette section.
  const [mouseGlow, setMouseGlow] = useState({ x: 0, y: 0, visible: false });

  function handleMouseMove(event: MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setMouseGlow({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      visible: true,
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
          transform: "translate(-50%, -50%)",
        }}
        aria-hidden="true"
      />
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />

      <div className="relative z-[4]">
        <CustomizableDashboard
          userId={userId}
          layoutId="dashboard:investissement"
          defaultLayout={DEFAULT_INVESTMENT_LAYOUT}
          kpis={kpis}
          previousKpis={previousKpis}
          analyses={analyses}
          currentAnalysis={currentAnalysis}
          mappedData={currentAnalysis?.mappedData ?? null}
          lockedCategory="investissement"
          controlledIsEditing={controlledIsEditing}
          onEditingChange={onEditingChange}
          hideHeaderTitle
        />
      </div>
    </section>
  );
}
