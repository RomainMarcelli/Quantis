"use client";

import { useMemo, useState } from "react";
import type { ParserResponse, ParserSuccessPayload } from "@/app/pdf-parser-test/types";
import {
  buildParserDiagnostic,
  buildParserDiagnosticSummaryText
} from "@/app/pdf-parser-test/parserDiagnosticExport";
import { ParserDiagnosticActions } from "@/components/pdf-parser/ParserDiagnosticActions";
import { DiagnosticStatusPanel } from "@/components/pdf-parser/DiagnosticStatusPanel";

type AnalysisResultPanelProps = {
  responsePayload: ParserResponse | null;
  statusCode: number | null;
  networkError: string | null;
  apiErrorMessage: string | null;
  elapsedSeconds: number;
  estimatedDurationSeconds: number | null;
  remainingSeconds: number | null;
};

type ValueRow = {
  key: string;
  value: number | null;
};

const CRITICAL_FIELD_LABELS: Array<{ key: keyof ParserSuccessPayload["quantisData"]; label: string }> = [
  { key: "ca", label: "CA" },
  { key: "totalCharges", label: "Total charges" },
  { key: "netResult", label: "Resultat net" },
  { key: "totalAssets", label: "Total actif" },
  { key: "equity", label: "Capitaux propres" },
  { key: "debts", label: "Dettes" }
];

const MAPPED_GROUPS: Array<{ title: string; match: (key: string) => boolean }> = [
  {
    title: "Actif",
    match: (key) =>
      key.startsWith("immob_") ||
      key.startsWith("stocks_") ||
      key === "total_stocks" ||
      key.startsWith("avances_vers_actif") ||
      key === "clients" ||
      key === "autres_creances" ||
      key === "creances" ||
      key === "vmp" ||
      key === "dispo" ||
      key === "cca" ||
      key.startsWith("total_actif")
  },
  {
    title: "Passif",
    match: (key) =>
      key === "capital" ||
      key.startsWith("ecarts_") ||
      key.startsWith("reserve") ||
      key.startsWith("reserves_") ||
      key === "ran" ||
      key === "res_net" ||
      key.startsWith("subv_") ||
      key.startsWith("prov_") ||
      key.startsWith("total_cp") ||
      key.startsWith("emprunts") ||
      key.startsWith("avances_recues") ||
      key.startsWith("fournisseurs") ||
      key.startsWith("dettes_") ||
      key === "cca_passif" ||
      key === "autres_dettes" ||
      key === "pca" ||
      key.startsWith("total_passif") ||
      key.startsWith("total_dettes")
  },
  {
    title: "Compte de resultat",
    match: (key) =>
      key.startsWith("ventes_") ||
      key.startsWith("prod_") ||
      key.startsWith("achats_") ||
      key.startsWith("var_stock_") ||
      key === "ace" ||
      key === "impots_taxes" ||
      key === "salaires" ||
      key === "charges_soc" ||
      key === "dap" ||
      key === "dprov" ||
      key === "autres_charges_expl" ||
      key === "total_prod_expl" ||
      key === "total_charges_expl" ||
      key === "ebit" ||
      key === "prod_fin" ||
      key === "charges_fin" ||
      key === "prod_excep" ||
      key === "charges_excep" ||
      key === "is_impot" ||
      key === "resultat_exercice"
  },
  {
    title: "Transformations",
    match: (key) =>
      key === "ca_n_minus_1" ||
      key === "n" ||
      key === "delta_bfr" ||
      key === "total_actif_immo_brut" ||
      key === "total_actif_immo_net"
  }
];

export function AnalysisResultPanel(props: AnalysisResultPanelProps) {
  const { responsePayload, statusCode, networkError, apiErrorMessage, elapsedSeconds, estimatedDurationSeconds, remainingSeconds } =
    props;
  const successPayload = responsePayload?.success ? responsePayload : null;
  const mappedData = successPayload?.mappedData ?? successPayload?.debugData?.mappedData ?? null;
  const kpis = successPayload?.kpis ?? successPayload?.debugData?.kpis ?? null;
  const warnings = successPayload?.warnings ?? [];

  const mappedEntries = useMemo(() => toSortedRows(mappedData), [mappedData]);
  const kpiEntries = useMemo(() => toSortedRows(kpis), [kpis]);
  const mappedByGroup = useMemo(() => groupMappedRows(mappedEntries), [mappedEntries]);
  const diagnostic = useMemo(
    () =>
      buildParserDiagnostic({
        responsePayload,
        statusCode,
        networkError,
        apiErrorMessage,
        elapsedSeconds,
        estimatedDurationSeconds
      }),
    [responsePayload, statusCode, networkError, apiErrorMessage, elapsedSeconds, estimatedDurationSeconds]
  );
  const diagnosticSummaryText = useMemo(
    () => buildParserDiagnosticSummaryText(diagnostic),
    [diagnostic]
  );

  const foundMapped = mappedEntries.filter((entry) => entry.value !== null).length;
  const missingMapped = mappedEntries.length - foundMapped;
  const successStatus = successPayload ? "Succes" : responsePayload ? "Echec" : "En attente";

  if (!responsePayload && !networkError && !apiErrorMessage && statusCode === null) {
    return (
      <p className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/65">
        Aucune donnee
      </p>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-black/35 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-xs uppercase tracking-[0.16em] text-white/55">Resume execution parser</p>
          <ParserDiagnosticActions diagnostic={diagnostic} summaryText={diagnosticSummaryText} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStat label="HTTP" value={statusCode === null ? "-" : String(statusCode)} />
          <SummaryStat label="Statut" value={successStatus} highlight={successPayload ? "ok" : "warn"} />
          <SummaryStat
            label="Confiance"
            value={successPayload ? successPayload.confidenceScore.toFixed(2) : "-"}
          />
          <SummaryStat label="Analysis ID" value={successPayload?.persistence.analysisId ?? "-"} />
          <SummaryStat label="Warnings" value={String(warnings.length)} highlight={warnings.length ? "warn" : "ok"} />
          <SummaryStat label="Temps ecoule" value={`${Math.max(0, Math.floor(elapsedSeconds))} s`} />
          <SummaryStat
            label="Temps estime"
            value={estimatedDurationSeconds === null ? "-" : formatDuration(estimatedDurationSeconds)}
          />
          <SummaryStat
            label="Champs mapped"
            value={mappedEntries.length ? `${foundMapped}/${mappedEntries.length}` : "-"}
            subValue={mappedEntries.length ? `${missingMapped} manquants` : undefined}
            highlight={missingMapped > 0 ? "warn" : "ok"}
          />
        </div>
        {remainingSeconds !== null ? (
          <p className="mt-2 text-xs text-white/55">Temps estime restant: {Math.max(0, Math.floor(remainingSeconds))} s</p>
        ) : null}
      </div>

      <MessagePanel networkError={networkError} apiErrorMessage={apiErrorMessage} warnings={warnings} />
      {successPayload ? <DiagnosticStatusPanel diagnostic={diagnostic} /> : null}

      {successPayload ? (
        <>
          <section className="rounded-xl border border-white/10 bg-black/35 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white/90">Donnees financieres principales</h3>
              <CopyJsonButton label="Copier JSON" data={successPayload.quantisData} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {CRITICAL_FIELD_LABELS.map(({ key, label }) => (
                <KeyMetricCard key={key} label={label} value={successPayload.quantisData[key]} />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-black/35 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white/90">MappedData</h3>
              <CopyJsonButton label="Copier JSON" data={mappedData} disabled={!mappedData} />
            </div>
            {mappedEntries.length === 0 ? (
              <p className="text-xs text-white/60">mappedData indisponible.</p>
            ) : (
              <div className="space-y-3">
                {mappedByGroup.map((group) => (
                  <DataTableSection key={group.title} title={group.title} rows={group.rows} />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-white/10 bg-black/35 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white/90">KPI calcules</h3>
              <CopyJsonButton label="Copier JSON" data={kpis} disabled={!kpis} />
            </div>
            {kpiEntries.length === 0 ? (
              <p className="text-xs text-white/60">kpis indisponibles.</p>
            ) : (
              <DataTableSection title="KPI" rows={kpiEntries} />
            )}
          </section>

          <DebugSection successPayload={successPayload} />
        </>
      ) : null}
    </section>
  );
}

function SummaryStat(props: {
  label: string;
  value: string;
  subValue?: string;
  highlight?: "ok" | "warn";
}) {
  const { label, value, subValue, highlight } = props;
  const badgeClass =
    highlight === "ok"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
      : highlight === "warn"
        ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
        : "border-white/10 bg-white/5 text-white/85";

  return (
    <div className={`rounded-lg border px-3 py-2 ${badgeClass}`}>
      <p className="text-[11px] uppercase tracking-[0.12em] opacity-70">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
      {subValue ? <p className="mt-1 text-[11px] opacity-80">{subValue}</p> : null}
    </div>
  );
}

function KeyMetricCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        value === null
          ? "border-rose-500/35 bg-rose-500/10"
          : "border-emerald-500/20 bg-emerald-500/5"
      }`}
    >
      <p className="text-xs uppercase tracking-[0.12em] text-white/55">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{formatValue(value)}</p>
      <ValueBadge value={value} />
    </div>
  );
}

function DataTableSection({ title, rows }: { title: string; rows: ValueRow[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/60">{title}</p>
      <div className="max-h-64 overflow-auto rounded-lg border border-white/10">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-black/70 text-white/60">
            <tr>
              <th className="px-2 py-2 text-left">Champ</th>
              <th className="px-2 py-2 text-right">Valeur</th>
              <th className="px-2 py-2 text-right">Etat</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-white/10">
                <td className="px-2 py-1.5 text-white/80">{row.key}</td>
                <td className={`px-2 py-1.5 text-right ${row.value === null ? "text-rose-200" : "text-emerald-200"}`}>
                  {formatValue(row.value)}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <ValueBadge value={row.value} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ValueBadge({ value, compact = false }: { value: number | null; compact?: boolean }) {
  if (value === null) {
    return (
      <span className={`rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-200 ${compact ? "" : "mt-2 inline-block"}`}>
        manquant
      </span>
    );
  }

  return (
    <span className={`rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200 ${compact ? "" : "mt-2 inline-block"}`}>
      rempli
    </span>
  );
}

function MessagePanel(props: {
  networkError: string | null;
  apiErrorMessage: string | null;
  warnings: string[];
}) {
  const { networkError, apiErrorMessage, warnings } = props;
  if (!networkError && !apiErrorMessage && warnings.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2 rounded-xl border border-white/10 bg-black/35 p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-white/55">Warnings / Erreurs</p>
      {networkError ? (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          Erreur reseau: {networkError}
        </p>
      ) : null}
      {apiErrorMessage ? (
        <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Erreur API: {apiErrorMessage}
        </p>
      ) : null}
      {warnings.map((warning) => (
        <p key={warning} className="rounded-lg border border-amber-400/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
          {warning}
        </p>
      ))}
    </section>
  );
}

function DebugSection({ successPayload }: { successPayload: ParserSuccessPayload }) {
  const debugData = successPayload.debugData;
  if (!debugData) {
    return null;
  }

  const sections: Array<{ key: string; title: string; value: unknown }> = [
    { key: "financialData", title: "FinancialData", value: debugData.financialData },
    { key: "mappedData", title: "MappedData (debug)", value: debugData.mappedData },
    { key: "kpis", title: "KPI (debug)", value: debugData.kpis },
    { key: "diagnostics", title: "Diagnostics", value: debugData.diagnostics },
    { key: "detectedSections", title: "DetectedSections", value: debugData.detectedSections },
    { key: "traces", title: "Traces", value: debugData.traces },
    { key: "reconstructedRows", title: "ReconstructedRows", value: debugData.reconstructedRows }
  ].filter((entry) => entry.value !== undefined);

  return (
    <section className="rounded-xl border border-white/10 bg-black/35 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">Debug Data</p>
      <div className="space-y-2">
        {sections.map((section) => (
          <details key={section.key} className="rounded-lg border border-white/10 bg-black/25 p-2">
            <summary className="cursor-pointer text-sm font-medium text-white/85">{section.title}</summary>
            <div className="mt-2 flex justify-end">
              <CopyJsonButton label="Copier JSON" data={section.value} />
            </div>
            <pre className="mt-2 max-h-72 overflow-auto rounded bg-black/35 p-3 text-xs text-emerald-200">
              {JSON.stringify(section.value, null, 2)}
            </pre>
          </details>
        ))}
      </div>
    </section>
  );
}

function CopyJsonButton({ data, label, disabled }: { data: unknown; label: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={async () => {
        if (disabled) {
          return;
        }
        await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
      className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[11px] text-white/85 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-45"
    >
      {copied ? "Copie" : label}
    </button>
  );
}

function toSortedRows(record: Record<string, number | null> | null): ValueRow[] {
  if (!record) {
    return [];
  }

  return Object.entries(record)
    .map(([key, value]) => ({ key, value: typeof value === "number" && Number.isFinite(value) ? value : null }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function groupMappedRows(rows: ValueRow[]): Array<{ title: string; rows: ValueRow[] }> {
  const groups = MAPPED_GROUPS.map((group) => ({
    title: group.title,
    rows: rows.filter((row) => group.match(row.key))
  })).filter((group) => group.rows.length > 0);

  const knownKeys = new Set(groups.flatMap((group) => group.rows.map((row) => row.key)));
  const others = rows.filter((row) => !knownKeys.has(row.key));
  if (others.length > 0) {
    groups.push({
      title: "Autres",
      rows: others
    });
  }

  return groups;
}

function formatValue(value: number | null): string {
  if (value === null) {
    return "null";
  }

  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 2
  }).format(value);
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}
