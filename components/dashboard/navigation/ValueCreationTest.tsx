// File: components/dashboard/navigation/ValueCreationTest.tsx
// Role: onglet "Création de valeur" — un seul container `CustomizableDashboard`
// qui rend la grille de widgets configurables. Tous les blocs visuels (KPI
// trios statiques, simulation IA, point mort hardcodé) ont été convertis en
// widgets régulés par la grille (cf. BreakEvenChartWidget). L'utilisateur a
// désormais TOTAL contrôle sur ce qui s'affiche : drag-resize-remove libre.
"use client";

import { type MouseEvent, useEffect, useRef } from "react";
import { CustomizableDashboard } from "@/components/dashboard/widgets/CustomizableDashboard";
import { DEFAULT_DASHBOARD_LAYOUTS } from "@/lib/dashboard/defaultDashboardLayouts";
import type { AnalysisRecord, CalculatedKpis, MappedFinancialData } from "@/types/analysis";

const DEFAULT_VALUE_CREATION_LAYOUT = DEFAULT_DASHBOARD_LAYOUTS["creation-valeur"];

type ValueCreationTestProps = {
  kpis: CalculatedKpis;
  mappedData: MappedFinancialData;
  previousKpis?: CalculatedKpis | null;
  /** Historique du dossier — alimente les widgets de chart d'évolution. */
  analyses?: AnalysisRecord[];
  /** Analyse courante — son dailyAccounting alimente la lecture mensuelle. */
  currentAnalysis?: AnalysisRecord | null;
  /** Reçu pour compat — non utilisé directement (badge mode rendu côté parent). */
  analysisModeLabel?: string | null;
  /** UID Firebase pour persister les modifs du layout. Null = pas de save. */
  userId?: string | null;
};

export function ValueCreationTest({
  kpis,
  mappedData,
  previousKpis = null,
  analyses = [],
  currentAnalysis = null,
  userId = null,
}: ValueCreationTestProps) {
  // Glow local rendu en impératif pour éviter un rerender React à chaque
  // mouvement souris.
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
    if (!node) return;
    const next = nextMouseGlowRef.current;
    node.style.left = `${next.x}px`;
    node.style.top = `${next.y}px`;
    node.style.opacity = next.visible ? "1" : "0";
  }

  function scheduleMouseGlow() {
    if (mouseGlowRafRef.current !== null) return;
    mouseGlowRafRef.current = requestAnimationFrame(flushMouseGlow);
  }

  function handleMouseMove(event: MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    nextMouseGlowRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      visible: true,
    };
    scheduleMouseGlow();
  }

  function handleMouseLeave() {
    nextMouseGlowRef.current = { ...nextMouseGlowRef.current, visible: false };
    scheduleMouseGlow();
  }

  return (
    <section
      className="premium-analysis-root relative overflow-hidden rounded-2xl p-4 md:p-8"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={mouseGlowRef}
        data-mouse-glow
        className="pointer-events-none absolute z-[3] h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(197,160,89,0.12)_0%,transparent_62%)] transition-opacity duration-300"
        style={{ left: 0, top: 0, opacity: 0, transform: "translate(-50%, -50%)" }}
        aria-hidden="true"
      />
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />

      <div className="relative z-[4]">
        <CustomizableDashboard
          userId={userId}
          layoutId="dashboard:creation_valeur"
          defaultLayout={DEFAULT_VALUE_CREATION_LAYOUT}
          kpis={kpis}
          previousKpis={previousKpis}
          analyses={analyses}
          currentAnalysis={currentAnalysis}
          mappedData={mappedData}
          lockedCategory="creation_valeur"
        />
      </div>
    </section>
  );
}
