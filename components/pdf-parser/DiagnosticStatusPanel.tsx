"use client";

import type { ParserDiagnostic } from "@/app/pdf-parser-test/parserDiagnosticExport";

type DiagnosticStatusPanelProps = {
  diagnostic: ParserDiagnostic;
};

const FIELD_STATUS_LABELS: Record<string, string> = {
  missing_label_not_found: "Libelle absent",
  missing_label_without_amount: "Libelle sans montant",
  missing_intentional_null: "Null volontaire",
  missing_unresolved: "A analyser"
};

export function DiagnosticStatusPanel({ diagnostic }: DiagnosticStatusPanelProps) {
  const missingFields = diagnostic.dataQuality.importantFieldStatuses.filter((item) =>
    item.status.startsWith("missing_")
  );
  const blockedKpis = diagnostic.kpiStatus.blocked;

  if (missingFields.length === 0 && blockedKpis.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-white/10 bg-black/35 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
        Champs manquants et KPI bloques
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-black/25 p-3">
          <p className="mb-2 text-xs uppercase tracking-[0.12em] text-white/60">Champs importants manquants</p>
          {missingFields.length === 0 ? (
            <p className="text-xs text-white/60">Aucun champ manquant important.</p>
          ) : (
            <ul className="space-y-2">
              {missingFields.map((field) => (
                <li key={field.field} className="rounded border border-amber-400/20 bg-amber-500/5 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-white/90">{field.field}</p>
                    <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100">
                      {FIELD_STATUS_LABELS[field.status] ?? field.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-white/70">{field.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-black/25 p-3">
          <p className="mb-2 text-xs uppercase tracking-[0.12em] text-white/60">KPI bloques</p>
          {blockedKpis.length === 0 ? (
            <p className="text-xs text-white/60">Aucun KPI bloque.</p>
          ) : (
            <ul className="space-y-2">
              {blockedKpis.map((kpi) => (
                <li key={kpi.kpi} className="rounded border border-rose-500/25 bg-rose-500/8 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-white/90">{kpi.kpi}</p>
                    <span className="rounded-full border border-rose-500/35 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-100">
                      Bloque
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-white/70">{kpi.reason}</p>
                  <p className="mt-1 text-[11px] text-white/60">
                    Sources manquantes: {kpi.missingSources.join(", ") || "-"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {diagnostic.dataQuality.manualReviewQueue.length > 0 ? (
        <div className="mt-4 rounded-lg border border-sky-400/20 bg-sky-500/5 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-sky-100">Preparation correction manuelle</p>
          <ul className="mt-2 space-y-1 text-[11px] text-sky-50/90">
            {diagnostic.dataQuality.manualReviewQueue.map((item) => (
              <li key={item.field}>
                {item.field}: {item.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

