// File: components/dashboard/navigation/FinancingTest.tsx
// Role: onglet "Financement & solvabilité" — uniquement le container
// `CustomizableDashboard`. Le bloc "Résistance aux imprévus" (trio liquidité)
// devient un widget dédié `liquidityRatios` inclus dans le layout par défaut.
// Le badge "Score crédit" et la card "Indépendance" (gearing visualisé) +
// bandeau VYZOR_AGENT ont été retirés — la grille est désormais 100 % widget.
"use client";

import { type MouseEvent, useState } from "react";
import { CustomizableDashboard } from "@/components/dashboard/widgets/CustomizableDashboard";
import { DEFAULT_DASHBOARD_LAYOUTS } from "@/lib/dashboard/defaultDashboardLayouts";
import type { AnalysisRecord, CalculatedKpis } from "@/types/analysis";

const DEFAULT_FINANCING_LAYOUT = DEFAULT_DASHBOARD_LAYOUTS["financement"];

type FinancingTestProps = {
  kpis: CalculatedKpis;
  previousKpis?: CalculatedKpis | null;
  analyses?: AnalysisRecord[];
  currentAnalysis?: AnalysisRecord | null;
  /** Reçu pour compat — non utilisé (badge mode rendu côté parent). */
  analysisModeLabel?: string | null;
  /** UID Firebase pour persister les modifs du layout. Null = pas de save. */
  userId?: string | null;
};

export function FinancingTest({
  kpis,
  previousKpis = null,
  analyses = [],
  currentAnalysis = null,
  userId = null,
}: FinancingTestProps) {
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
          layoutId="dashboard:financement"
          defaultLayout={DEFAULT_FINANCING_LAYOUT}
          kpis={kpis}
          previousKpis={previousKpis}
          analyses={analyses}
          currentAnalysis={currentAnalysis}
          mappedData={currentAnalysis?.mappedData ?? null}
          lockedCategory="financement"
        />
      </div>
    </section>
  );
}
