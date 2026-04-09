import type { ParserSuccessPayload } from "@/app/pdf-parser-test/types";

export function AnalysisResultPanel({ data }: { data: ParserSuccessPayload | null }) {
  if (!data) {
    return (
      <p className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/65">
        Aucune donnee
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/35 p-3">
      <h2 className="mb-3 text-sm font-semibold text-white/85">Resultat de l&apos;analyse</h2>
      <h3 className="mb-2 text-xs uppercase tracking-[0.16em] text-white/55">Donnees financieres</h3>
      <pre className="max-h-[32vh] overflow-auto rounded-lg bg-black/35 p-3 text-xs text-emerald-200">
        {JSON.stringify(data.quantisData, null, 2)}
      </pre>
      <p className="mt-3 text-sm text-white/80">
        Score de confiance : <span className="font-semibold">{data.confidenceScore}</span>
      </p>
      <p className="mt-1 text-xs text-white/65">Analysis ID : {data.persistence.analysisId ?? "non sauvegarde"}</p>
      {data.warnings.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
            Avertissements
          </h4>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-100">
            {data.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
