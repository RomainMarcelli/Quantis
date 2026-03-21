import Link from "next/link";
import type { AnalysisRecord } from "@/types/analysis";

type AnalysisHistoryProps = {
  analyses: AnalysisRecord[];
  selectedAnalysisId: string | null;
  onSelect: (id: string) => void;
};

export function AnalysisHistory({ analyses, selectedAnalysisId, onSelect }: AnalysisHistoryProps) {
  return (
    <section className="quantis-panel overflow-hidden">
      <header className="border-b border-quantis-mist px-5 py-4">
        <h2 className="text-sm font-semibold text-quantis-carbon">Historique des analyses</h2>
        <p className="mt-1 text-xs text-quantis-slate">Stockees dans Firestore avec horodatage.</p>
      </header>

      {analyses.length === 0 ? (
        <div className="px-5 py-8 text-sm text-quantis-slate">Aucune analyse pour le moment.</div>
      ) : (
        <ul className="max-h-80 overflow-y-auto">
          {analyses.map((analysis) => (
            <li key={analysis.id} className="border-b border-quantis-mist last:border-b-0">
              <button
                type="button"
                className={`w-full px-5 py-3 text-left transition-colors ${
                  selectedAnalysisId === analysis.id ? "bg-quantis-paper" : "hover:bg-quantis-paper"
                }`}
                onClick={() => onSelect(analysis.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-quantis-carbon">
                    {analysis.fiscalYear ? `Exercice ${analysis.fiscalYear}` : "Analyse sans exercice"}
                  </p>
                  <span className="text-xs text-quantis-slate">
                    {new Date(analysis.createdAt).toLocaleString("fr-FR")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-quantis-slate">
                  {analysis.sourceFiles.map((file) => file.name).join(", ")}
                </p>
              </button>
              <div className="px-5 pb-3">
                <Link
                  href="/analysis"
                  className="text-xs font-medium text-quantis-carbon underline underline-offset-2"
                >
                  Inspecter cette analyse
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
