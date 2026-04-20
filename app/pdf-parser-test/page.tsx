"use client";

import { FormEvent, useEffect, useState } from "react";
import { AnalysisResultPanel } from "@/components/pdf-parser/AnalysisResultPanel";
import { ProcessingLoader } from "@/components/ProcessingLoader";
import { useProcessingMetrics } from "@/hooks/useProcessingMetrics";
import { firebaseAuthGateway } from "@/services/auth";
import type { AuthenticatedUser } from "@/types/auth";
import { fetchParserHistory, fetchProgressSnapshot, uploadPdfWithProgress } from "./parserApiClient";
import type {
  ParserErrorPayload,
  ParserHistoryResponse,
  ParserProgressPayload,
  ParserResponse
} from "./types";

export default function PdfParserTestPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(() => firebaseAuthGateway.getCurrentUser());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("En attente");
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [uploadStatusCode, setUploadStatusCode] = useState<number | null>(null);
  const [responsePayload, setResponsePayload] = useState<ParserResponse | null>(null);
  const [historyPayload, setHistoryPayload] = useState<ParserHistoryResponse | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  const { elapsedSeconds, estimatedDurationSeconds, remainingSeconds, startRun, stopRun } =
    useProcessingMetrics();

  useEffect(() => {
    const unsubscribe = firebaseAuthGateway.subscribe((nextUser) => {
      setUser(nextUser);
    });

    return unsubscribe;
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile || isSubmitting) {
      return;
    }

    const startedAt = startRun();
    const requestId = createRequestId();
    let progressPollTimerId: number | null = null;
    let progressPollStartTimeoutId: number | null = null;
    let isPollingRequestInFlight = false;
    let shouldStopPolling = false;

    setIsSubmitting(true);
    setUploadStatusCode(null);
    setResponsePayload(null);
    setNetworkError(null);
    setApiErrorMessage(null);
    setProgress(0);
    setCurrentStep("Upload du document...");

    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken || !user?.uid) {
        throw new Error("Session utilisateur requise. Connectez-vous pour tester le parser.");
      }

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("userId", user.uid);
      formData.append("requestId", requestId);

      const runProgressPolling = () => {
        if (shouldStopPolling) {
          return;
        }

        progressPollTimerId = window.setInterval(() => {
          if (isPollingRequestInFlight || shouldStopPolling) {
            return;
          }

          isPollingRequestInFlight = true;
          void fetchProgressSnapshot(idToken, requestId)
            .then((progressPayload) => {
              if (!progressPayload || shouldStopPolling) {
                return;
              }

              const nextProgress =
                progressPayload.status === "completed"
                  ? 99
                  : Math.min(95, Math.max(20, Math.round(progressPayload.progress)));

              setProgress((previous) => Math.max(previous, nextProgress));
              setCurrentStep(resolveProgressStepLabel(progressPayload));

              if (progressPayload.status === "failed" && progressPayload.error) {
                setApiErrorMessage((previous) => previous ?? progressPayload.error);
                shouldStopPolling = true;
                if (progressPollTimerId !== null) {
                  window.clearInterval(progressPollTimerId);
                  progressPollTimerId = null;
                }
              }

              if (progressPayload.status === "completed") {
                shouldStopPolling = true;
                if (progressPollTimerId !== null) {
                  window.clearInterval(progressPollTimerId);
                  progressPollTimerId = null;
                }
              }
            })
            .catch(() => {
              // Non bloquant: le polling peut echouer temporairement.
            })
            .finally(() => {
              isPollingRequestInFlight = false;
            });
        }, 1000);
      };

      progressPollStartTimeoutId = window.setTimeout(runProgressPolling, 900);

      const uploadResult = await uploadPdfWithProgress({
        idToken,
        formData,
        onUploadProgress: (uploadEvent) => {
          if (!uploadEvent.lengthComputable || uploadEvent.total <= 0) {
            return;
          }

          const uploadProgress = Math.round((uploadEvent.loaded / uploadEvent.total) * 20);
          setProgress((previous) => Math.max(previous, clampProgress(uploadProgress)));
          setCurrentStep("Upload du document...");
        }
      });

      setUploadStatusCode(uploadResult.statusCode);
      setResponsePayload(uploadResult.payload);

      if (!uploadResult.payload.success) {
        setApiErrorMessage(resolveApiErrorMessage(uploadResult.payload));
      }

      shouldStopPolling = true;
      if (progressPollTimerId !== null) {
        window.clearInterval(progressPollTimerId);
        progressPollTimerId = null;
      }

      setProgress(100);
      setCurrentStep(
        uploadResult.statusCode >= 200 && uploadResult.statusCode < 300
          ? "Traitement termine."
          : "Traitement termine avec erreur."
      );
    } catch (error) {
      setNetworkError(error instanceof Error ? error.message : "Erreur reseau inconnue.");
      setProgress(100);
      setCurrentStep("Traitement termine avec erreur.");
    } finally {
      shouldStopPolling = true;
      if (progressPollStartTimeoutId !== null) {
        window.clearTimeout(progressPollStartTimeoutId);
      }
      if (progressPollTimerId !== null) {
        window.clearInterval(progressPollTimerId);
      }
      stopRun(startedAt);
      setIsSubmitting(false);
    }
  }

  async function handleLoadHistory() {
    if (isLoadingHistory) {
      return;
    }

    setIsLoadingHistory(true);
    setNetworkError(null);

    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) {
        throw new Error("Session utilisateur requise pour charger l'historique.");
      }

      const payload = await fetchParserHistory(idToken);
      setHistoryPayload(payload);
    } catch (error) {
      setNetworkError(error instanceof Error ? error.message : "Erreur reseau inconnue.");
    } finally {
      setIsLoadingHistory(false);
    }
  }

  return (
    <main className="premium-analysis-root relative mx-auto min-h-screen w-full overflow-hidden px-4 py-10">
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />

      <section className="relative z-10 mx-auto w-full max-w-5xl">
        <article className="precision-card rounded-2xl p-6 md:p-8">
          <header className="card-header">
            <p className="text-xs uppercase tracking-[0.2em] text-white/55">Debug Document AI</p>
            <h1 className="mt-3 text-2xl font-semibold text-white md:text-3xl">Test du parser PDF</h1>
            <p className="mt-3 max-w-3xl text-sm text-white/70">
              Cette page envoie un PDF a <code>/api/pdf-parser</code>, sauvegarde l&apos;analyse Firestore
              et affiche les donnees utiles pour validation.
            </p>
            <p className="mt-2 text-xs text-white/55">
              Session: {user ? `${user.email ?? user.uid}` : "non connecte"}
            </p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-white/85" htmlFor="pdf-file">
                Fichier PDF
              </label>
              <input
                id="pdf-file"
                type="file"
                accept="application/pdf,.pdf"
                className="block w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white/85 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white/90 hover:file:bg-white/20"
                onChange={(changeEvent) => {
                  const file = changeEvent.currentTarget.files?.[0] ?? null;
                  setSelectedFile(file);
                }}
              />
              <p className="mt-2 text-xs text-white/60">
                {selectedFile
                  ? `Selection: ${selectedFile.name} (${Math.round(selectedFile.size / 1024)} KB)`
                  : "Selectionnez un PDF de liasse fiscale."}
              </p>
            </div>

            <button
              type="submit"
              className="btn-gold-premium rounded-xl px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55"
              disabled={!selectedFile || isSubmitting || !user}
            >
              {isSubmitting ? "Extraction en cours..." : "Tester /api/pdf-parser"}
            </button>
            <button
              type="button"
              onClick={handleLoadHistory}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/85 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-55"
              disabled={isLoadingHistory || !user}
            >
              {isLoadingHistory ? "Chargement..." : "Charger historique PDF"}
            </button>
          </form>

          <ProcessingLoader
            isVisible={isSubmitting}
            progress={progress}
            currentStep={currentStep}
            elapsedSeconds={elapsedSeconds}
            remainingSeconds={isSubmitting ? remainingSeconds : null}
          />

          <div className="mt-6 space-y-3">
            <AnalysisResultPanel
              responsePayload={responsePayload}
              statusCode={uploadStatusCode}
              networkError={networkError}
              apiErrorMessage={apiErrorMessage}
              elapsedSeconds={elapsedSeconds}
              estimatedDurationSeconds={estimatedDurationSeconds}
              remainingSeconds={isSubmitting ? remainingSeconds : null}
            />

            {responsePayload && responsePayload.success ? (
              <button
                type="button"
                onClick={() => {
                  const diagnostic = {
                    exportedAt: new Date().toISOString(),
                    parserVersion: responsePayload.parserVersion ?? null,
                    confidenceScore: responsePayload.confidenceScore,
                    warnings: responsePayload.warnings,
                    principalFinancials: responsePayload.quantisData,
                    mappedData: responsePayload.mappedData ?? responsePayload.debugData?.mappedData ?? null,
                    kpis: responsePayload.kpis ?? responsePayload.debugData?.kpis ?? null,
                    pdfExtraction: responsePayload.pdfExtraction ?? null,
                    persistence: responsePayload.persistence,
                    execution: {
                      elapsedSeconds: Math.round(elapsedSeconds * 10) / 10,
                      estimatedDurationSeconds
                    }
                  };
                  const blob = new Blob([JSON.stringify(diagnostic, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `diagnostic-${Date.now()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="rounded-xl border border-quantis-gold/30 bg-quantis-gold/10 px-4 py-2 text-sm font-medium text-quantis-gold transition-colors hover:bg-quantis-gold/20"
              >
                📥 Exporter diagnostic complet
              </button>
            ) : null}

            {process.env.NODE_ENV === "development" ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const res = await fetch("/api/vision-logs");
                    const data = await res.json();
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `vision-logs-${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10"
                >
                  📋 Logs Vision LLM
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch("/api/vision-logs", { method: "DELETE" });
                  }}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10"
                >
                  🗑️ Vider les logs
                </button>
              </div>
            ) : null}

            {historyPayload && historyPayload.success ? (
              <div className="rounded-xl border border-white/10 bg-black/35 p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-white/55">Historique PDF</p>
                {historyPayload.analyses.length === 0 ? (
                  <p className="text-xs text-white/60">Aucune analyse enregistree.</p>
                ) : (
                  <ul className="space-y-2">
                    {historyPayload.analyses.slice(0, 6).map((analysis) => (
                      <li
                        key={analysis.id}
                        className="rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/80"
                      >
                        <p className="font-medium text-white/90">
                          {new Date(analysis.createdAt).toLocaleString("fr-FR")}
                        </p>
                        <p>ID: {analysis.id}</p>
                        <p>Confiance: {analysis.confidenceScore}</p>
                        <p>
                          CA: {analysis.quantisData.ca ?? "n/a"} | Resultat net:{" "}
                          {analysis.quantisData.netResult ?? "n/a"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </article>
      </section>
    </main>
  );
}

function resolveProgressStepLabel(progressPayload: ParserProgressPayload): string {
  if (progressPayload.status === "completed") {
    return "Finalisation de la reponse...";
  }

  if (progressPayload.status === "failed") {
    return "Traitement en echec.";
  }

  return progressPayload.currentStep || "Traitement en cours...";
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pdf-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function resolveApiErrorMessage(payload: ParserErrorPayload): string {
  if (payload.code === "PDF_PAGE_LIMIT_EXCEEDED") {
    const pageCount = payload.pageCount;
    const maxPages = payload.maxPages;
    if (typeof pageCount === "number" && typeof maxPages === "number") {
      return `Le PDF contient ${pageCount} pages. La limite actuelle est ${maxPages} pages. Essayez une version reduite ou contactez l'equipe pour activer un traitement asynchrone.`;
    }
    return "Le PDF depasse la limite de pages autorisee pour le traitement en ligne. Essayez une version reduite du document.";
  }

  return payload.detail ?? payload.error;
}
