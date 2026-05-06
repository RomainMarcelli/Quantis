// File: components/dashboard/widgets/RawVariableWidget.tsx
// Role: widget pour les variables brutes Bilan / Compte de résultat. Affiche
// juste la valeur formatée en € — pas de seuil, diagnostic, benchmark ni
// tooltip ✨ (les variables brutes n'ont pas de définition dans le registre KPI).
"use client";

import { formatCurrency, INSUFFICIENT_DATA_LABEL } from "@/components/dashboard/formatting";
import { getRawVariableDefinition } from "@/lib/dashboard/rawVariableCatalog";
import type { MappedFinancialData } from "@/types/analysis";

type RawVariableWidgetProps = {
  /** id préfixé "raw:<champ>". */
  kpiId: string;
  mappedData: MappedFinancialData | null;
};

export function RawVariableWidget({ kpiId, mappedData }: RawVariableWidgetProps) {
  const definition = getRawVariableDefinition(kpiId);
  const value = readValue(mappedData, definition?.field);

  const sourceLabel = definition?.source === "bilan" ? "Bilan" : "Compte de résultat";

  return (
    <article className="precision-card group fade-up flex h-full flex-col rounded-2xl p-6">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
        {sourceLabel} · {definition?.shortLabel ?? kpiId}
      </span>
      <h3 className="mt-1 text-sm font-semibold text-white">{definition?.label ?? kpiId}</h3>
      <div className="tnum data-react mt-3 text-[2rem] font-medium leading-none tracking-tight text-white">
        {value !== null ? formatCurrency(value) : INSUFFICIENT_DATA_LABEL}
      </div>
    </article>
  );
}

function readValue(
  mappedData: MappedFinancialData | null,
  field: keyof MappedFinancialData | undefined
): number | null {
  if (!mappedData || !field) return null;
  const value = mappedData[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
