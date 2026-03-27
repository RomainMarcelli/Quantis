"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AnalysisRecord, CalculatedKpis } from "@/types/analysis";
import type { AuthenticatedUser } from "@/types/auth";
import { computeKpis } from "@/services/kpiEngine";
import { firebaseAuthGateway } from "@/services/auth";
import { listUserAnalyses } from "@/services/analysisStore";
import { KPI_FORMULA_CATALOG } from "@/lib/kpi/kpiFormulaCatalog";
import {
  compareStoredAndRecalculatedKpis,
  getNonNullKpiEntries,
  getNonNullMappedEntries
} from "@/lib/debug/kpiPlayground";

export function KpiBeforeAfterView() {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingAnalyses, setLoadingAnalyses] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = firebaseAuthGateway.subscribe((nextUser) => {
      if (!nextUser) {
        router.replace("/");
        return;
      }

      if (!nextUser.emailVerified) {
        void firebaseAuthGateway.signOut();
        router.replace("/");
        return;
      }

      setUser(nextUser);
      setLoadingAuth(false);
    });

    return unsubscribe;
  }, [router]);

  const loadAnalyses = useCallback(async (userId: string) => {
    setLoadingAnalyses(true);
    setErrorMessage(null);

    try {
      const nextAnalyses = await listUserAnalyses(userId);
      setAnalyses(nextAnalyses);
      setSelectedAnalysisId((current) => {
        if (!nextAnalyses.length) {
          return null;
        }
        if (current && nextAnalyses.some((analysis) => analysis.id === current)) {
          return current;
        }
        return nextAnalyses[0].id;
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Erreur inattendue pendant le chargement des analyses."
      );
    } finally {
      setLoadingAnalyses(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    void loadAnalyses(user.uid);
  }, [user, loadAnalyses]);

  const selectedAnalysis = useMemo(
    () => analyses.find((analysis) => analysis.id === selectedAnalysisId) ?? analyses[0] ?? null,
    [analyses, selectedAnalysisId]
  );

  const recalculatedKpis = useMemo<CalculatedKpis | null>(() => {
    if (!selectedAnalysis) {
      return null;
    }

    return computeKpis(selectedAnalysis.mappedData);
  }, [selectedAnalysis]);

  const nonNullMappedEntries = useMemo(
    () => (selectedAnalysis ? getNonNullMappedEntries(selectedAnalysis.mappedData) : []),
    [selectedAnalysis]
  );

  const storedKpis = useMemo(
    () => (selectedAnalysis ? getNonNullKpiEntries(selectedAnalysis.kpis) : []),
    [selectedAnalysis]
  );

  const recomputedKpis = useMemo(
    () => (recalculatedKpis ? getNonNullKpiEntries(recalculatedKpis) : []),
    [recalculatedKpis]
  );

  const comparedKpis = useMemo(() => {
    if (!selectedAnalysis || !recalculatedKpis) {
      return [];
    }

    return compareStoredAndRecalculatedKpis(selectedAnalysis.kpis, recalculatedKpis);
  }, [selectedAnalysis, recalculatedKpis]);

  const mismatchCount = useMemo(
    () => comparedKpis.filter((kpi) => !kpi.matches).length,
    [comparedKpis]
  );

  if (loadingAuth) {
    return (
      <section className="precision-card relative z-10 mx-auto mt-8 w-full max-w-6xl rounded-2xl p-8 text-center">
        <p className="text-sm text-white/70">Chargement de la session...</p>
      </section>
    );
  }

  return (
    <section className="relative z-10 mx-auto w-full max-w-6xl space-y-6">
      <header className="precision-card rounded-2xl p-5 md:p-6">
        <p className="text-xs uppercase tracking-wide text-white/50">Test KPI</p>
        <h1 className="mt-1 text-2xl font-semibold text-white md:text-3xl">
          {`Avant / Calculs / Apr\u00E8s`}
        </h1>
        <p className="mt-2 text-sm text-white/65">
          Cette page lit uniquement les analyses stockees apres upload Excel/PDF. Aucune donnee n&apos;est en dur.
        </p>
        <div className="mt-3 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
          Source verifiee: Firestore + moteur KPI
        </div>
      </header>

      <section className="precision-card rounded-2xl p-5 md:p-6">
        <h2 className="text-sm font-semibold text-white">Analyse source</h2>
        <p className="mt-1 text-sm text-white/60">
          Selectionnez une analyse issue du pipeline Upload {">"} Parsing {">"} Mapping {">"} KPI {">"} Stockage.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            value={selectedAnalysis?.id ?? ""}
            onChange={(event) => setSelectedAnalysisId(event.target.value)}
            className="min-w-[280px] flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-quantis-gold/60"
            disabled={!analyses.length || loadingAnalyses}
          >
            {!analyses.length ? (
              <option value="">Aucune analyse disponible</option>
            ) : (
              analyses.map((analysis) => (
                <option key={analysis.id} value={analysis.id}>
                  {formatAnalysisOption(analysis)}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            onClick={() => {
              if (user) {
                void loadAnalyses(user.uid);
              }
            }}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
            disabled={loadingAnalyses || !user}
          >
            Rafraichir
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedAnalysis) {
                router.push("/analysis");
              }
            }}
            className="btn-gold-premium rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
            disabled={!selectedAnalysis}
          >
            Ouvrir la page détail
          </button>
        </div>

        {loadingAnalyses ? (
          <p className="mt-3 text-sm text-white/60">Chargement des analyses...</p>
        ) : null}

        {errorMessage ? (
          <div className="mt-3 rounded-xl border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {errorMessage}
          </div>
        ) : null}

        {selectedAnalysis ? (
          <div className="mt-4 grid gap-2 text-sm text-white/85 md:grid-cols-2">
            <p>
              Creee le:{" "}
              <span className="font-medium">
                {new Date(selectedAnalysis.createdAt).toLocaleString("fr-FR")}
              </span>
            </p>
            <p>
              Exercice:{" "}
              <span className="font-medium">
                {selectedAnalysis.fiscalYear !== null ? selectedAnalysis.fiscalYear : "Non renseigne"}
              </span>
            </p>
            <p className="md:col-span-2 text-white/80">
              Fichiers:{" "}
              <span className="font-medium">
                {selectedAnalysis.sourceFiles.length
                  ? selectedAnalysis.sourceFiles.map((file) => file.name).join(", ")
                  : "Aucun"}
              </span>
            </p>
          </div>
        ) : null}
      </section>

      {!selectedAnalysis ? (
        <section className="precision-card rounded-2xl p-5">
          <p className="text-sm text-white/65">
            Aucune analyse disponible. Depuis le dashboard, envoyez un fichier Excel pour alimenter cette page.
          </p>
        </section>
      ) : (
        <>
      <section className="precision-card rounded-2xl p-5 md:p-6">
        <h2 className="text-sm font-semibold text-white">1) Donnees inserees (Avant)</h2>
        <p className="mt-2 text-sm text-white/60">
          Donnees extraites depuis le fichier source, puis mappees vers le schema interne.
        </p>

        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-white/45">MappedData (champs non nuls)</p>
          {nonNullMappedEntries.length === 0 ? (
            <p className="mt-1 text-sm text-white/60">Aucune donnee numerique exploitable.</p>
          ) : (
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {nonNullMappedEntries.map((entry) => (
                <div key={entry.key} className="rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm">
                  <span className="font-mono text-white">{entry.key}</span>
                  <span className="ml-2 text-white/65">{formatNumber(entry.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <JsonPanel title="RawData (brut parse)" value={selectedAnalysis.rawData} />
          <JsonPanel title="MappedData (normalise)" value={selectedAnalysis.mappedData} />
        </div>
      </section>

      <section className="precision-card rounded-2xl p-5 md:p-6">
        <h2 className="text-sm font-semibold text-white">2) Calculs realises</h2>
        <p className="mt-2 text-sm text-white/60">
          Recalcul en direct avec le moteur `computeKpis(mappedData)` sur l&apos;analyse selectionnee.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/45">
              <tr>
                <th className="px-2 py-2">KPI</th>
                <th className="px-2 py-2">Formule</th>
                <th className="px-2 py-2">Resultat recalcule</th>
              </tr>
            </thead>
            <tbody>
              {KPI_FORMULA_CATALOG.map((item) => (
                <tr key={item.key} className="border-b border-white/10 last:border-b-0">
                  <td className="px-2 py-2 text-white">{item.label}</td>
                  <td className="px-2 py-2 font-mono text-xs text-white/55">{item.formula}</td>
                  <td className="px-2 py-2 text-white/85">
                    {formatMaybeNumber(recalculatedKpis?.[item.key] ?? null)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="precision-card rounded-2xl p-5 md:p-6">
        <h2 className="text-sm font-semibold text-white">3) Resultats (Apres)</h2>
        <div className="mt-2">
          {mismatchCount === 0 ? (
            <p className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              Verification OK: KPI stockes et KPI recalcules sont alignes.
            </p>
          ) : (
            <p className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {mismatchCount} KPI avec ecart entre la valeur stockee et la valeur recalculee.
            </p>
          )}
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/45">
              <tr>
                <th className="px-2 py-2">KPI</th>
                <th className="px-2 py-2">Stocke</th>
                <th className="px-2 py-2">Recalcule</th>
                <th className="px-2 py-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {comparedKpis.map((entry) => (
                <tr key={entry.key} className="border-b border-white/10 last:border-b-0">
                  <td className="px-2 py-2 font-mono text-white">{entry.key}</td>
                  <td className="px-2 py-2 text-white/85">{formatMaybeNumber(entry.stored)}</td>
                  <td className="px-2 py-2 text-white/85">{formatMaybeNumber(entry.recalculated)}</td>
                  <td className="px-2 py-2">
                    <span
                      className={
                        entry.matches
                          ? "rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-200"
                          : "rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-200"
                      }
                    >
                      {entry.matches ? "OK" : "Écart"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <JsonPanel title="KPI stockes (Firestore)" value={selectedAnalysis.kpis} />
          <JsonPanel title="KPI recalcules (computeKpis)" value={recalculatedKpis} />
        </div>
      </section>

      <section className="precision-card rounded-2xl p-5 md:p-6">
        <h2 className="text-sm font-semibold text-white">Complement debug parser</h2>
        <p className="mt-2 text-sm text-white/60">
          Detail des fichiers parses (feuilles lues, fiscalYear detecte, lignes d&apos;apercu).
        </p>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <JsonPanel title="ParsedData brut" value={selectedAnalysis.parsedData} />
          <div className="space-y-4">
            <KpiCardGroup title="KPI stockes non nuls" entries={storedKpis} />
            <KpiCardGroup title="KPI recalcules non nuls" entries={recomputedKpis} />
          </div>
        </div>
      </section>
        </>
      )}
    </section>
  );
}

function formatMaybeNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) {
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

function formatAnalysisOption(analysis: AnalysisRecord): string {
  const date = new Date(analysis.createdAt).toLocaleString("fr-FR");
  const firstFileName = analysis.sourceFiles[0]?.name ?? "Fichier inconnu";
  const otherCount = Math.max(analysis.sourceFiles.length - 1, 0);

  if (!otherCount) {
    return `${date} - ${firstFileName}`;
  }

  return `${date} - ${firstFileName} (+${otherCount})`;
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <section>
      <p className="text-xs uppercase tracking-wide text-white/45">{title}</p>
      <pre className="mt-2 max-h-80 overflow-auto rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white/85">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

function KpiCardGroup({
  title,
  entries
}: {
  title: string;
  entries: Array<{ key: string; value: number }>;
}) {
  return (
    <section>
      <p className="text-xs uppercase tracking-wide text-white/45">{title}</p>
      {entries.length ? (
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {entries.map((entry) => (
            <div key={entry.key} className="rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm">
              <span className="font-mono text-white">{entry.key}</span>
              <span className="ml-2 text-white/65">{formatNumber(entry.value)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-white/60">Aucune valeur non nulle.</p>
      )}
    </section>
  );
}
