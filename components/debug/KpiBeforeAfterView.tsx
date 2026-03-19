"use client";

import { useMemo, useState } from "react";
import { computeKpis } from "@/services/kpiEngine";
import { KPI_FORMULA_CATALOG } from "@/lib/kpi/kpiFormulaCatalog";
import {
  getNonNullKpiEntries,
  getNonNullMappedEntries,
  getPlaygroundDefaultInput,
  parseMappedDataJson
} from "@/lib/debug/kpiPlayground";

export function KpiBeforeAfterView() {
  const [jsonInput, setJsonInput] = useState(getPlaygroundDefaultInput);

  const parsed = useMemo(() => parseMappedDataJson(jsonInput), [jsonInput]);
  const kpis = useMemo(() => computeKpis(parsed.data), [parsed.data]);
  const nonNullMappedEntries = useMemo(() => getNonNullMappedEntries(parsed.data), [parsed.data]);
  const nonNullKpis = useMemo(() => getNonNullKpiEntries(kpis), [kpis]);

  return (
    <section className="space-y-6">
      <header className="quantis-panel p-5">
        <p className="text-xs uppercase tracking-wide text-quantis-slate">Test KPI</p>
        <h1 className="mt-1 text-2xl font-semibold text-quantis-carbon">Avant / Calculs / Apres</h1>
        <p className="mt-2 text-sm text-quantis-slate">
          Modifiez les donnees `mappedData` en JSON pour visualiser instantanement les calculs et resultats.
        </p>
      </header>

      <section className="quantis-panel p-5">
        <h2 className="text-sm font-semibold text-quantis-carbon">1) Donnees inserees (Avant)</h2>
        <textarea
          value={jsonInput}
          onChange={(event) => setJsonInput(event.target.value)}
          className="mt-3 h-72 w-full rounded-xl border border-quantis-mist bg-quantis-paper p-3 font-mono text-xs text-quantis-carbon outline-none focus:border-quantis-gold/60"
          spellCheck={false}
        />
        {parsed.success ? null : (
          <p className="mt-2 text-sm text-rose-700">{parsed.error}</p>
        )}

        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-quantis-slate">Champs detectes</p>
          {nonNullMappedEntries.length === 0 ? (
            <p className="mt-1 text-sm text-quantis-slate">Aucune donnee numerique exploitable.</p>
          ) : (
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {nonNullMappedEntries.map((entry) => (
                <div key={entry.key} className="rounded-xl border border-quantis-mist bg-white px-3 py-2 text-sm">
                  <span className="font-mono text-quantis-carbon">{entry.key}</span>
                  <span className="ml-2 text-quantis-slate">{formatNumber(entry.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="quantis-panel p-5">
        <h2 className="text-sm font-semibold text-quantis-carbon">2) Calculs realises</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-quantis-mist text-xs uppercase tracking-wide text-quantis-slate">
              <tr>
                <th className="px-2 py-2">KPI</th>
                <th className="px-2 py-2">Formule</th>
                <th className="px-2 py-2">Resultat</th>
              </tr>
            </thead>
            <tbody>
              {KPI_FORMULA_CATALOG.map((item) => (
                <tr key={item.key} className="border-b border-quantis-mist last:border-b-0">
                  <td className="px-2 py-2 text-quantis-carbon">{item.label}</td>
                  <td className="px-2 py-2 font-mono text-xs text-quantis-slate">{item.formula}</td>
                  <td className="px-2 py-2 text-quantis-carbon">{formatMaybeNumber(kpis[item.key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="quantis-panel p-5">
        <h2 className="text-sm font-semibold text-quantis-carbon">3) Resultats (Apres)</h2>
        {nonNullKpis.length === 0 ? (
          <p className="mt-2 text-sm text-quantis-slate">Aucun KPI calculable avec les donnees actuelles.</p>
        ) : (
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {nonNullKpis.map((entry) => (
              <div key={entry.key} className="rounded-xl border border-quantis-mist bg-white px-3 py-2 text-sm">
                <span className="font-mono text-quantis-carbon">{entry.key}</span>
                <span className="ml-2 text-quantis-slate">{formatNumber(entry.value)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-quantis-slate">JSON KPI complet</p>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-quantis-paper p-3 text-xs text-quantis-carbon">
            {JSON.stringify(kpis, null, 2)}
          </pre>
        </div>
      </section>
    </section>
  );
}

function formatMaybeNumber(value: number | null): string {
  if (value === null) {
    return "N/D";
  }
  return formatNumber(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value);
}
