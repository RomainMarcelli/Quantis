"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { firebaseAuthGateway } from "@/services/auth";
import type { AuthenticatedUser } from "@/types/auth";

type ParserSuccessPayload = {
  success: true;
  rawText: string;
  pages: unknown[];
  entities: unknown[];
  tables: unknown[];
  quantisData: {
    ca: number | null;
    totalCharges: number | null;
    netResult: number | null;
    totalAssets: number | null;
    equity: number | null;
    debts: number | null;
  };
  persistence: {
    saved: boolean;
    analysisId: string | null;
    warning: string | null;
  };
};

type ParserErrorPayload = {
  success: false;
  error: string;
  detail?: string;
};

type ParserResponse = ParserSuccessPayload | ParserErrorPayload;

export default function PdfParserTestPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(() => firebaseAuthGateway.getCurrentUser());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [responsePayload, setResponsePayload] = useState<ParserResponse | null>(null);
  const [historyPayload, setHistoryPayload] = useState<unknown>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  const formattedJson = useMemo(() => {
    if (!responsePayload) {
      return "";
    }
    return JSON.stringify(responsePayload, null, 2);
  }, [responsePayload]);

  const formattedHistoryJson = useMemo(() => {
    if (!historyPayload) {
      return "";
    }
    return JSON.stringify(historyPayload, null, 2);
  }, [historyPayload]);

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

    setIsSubmitting(true);
    setStatusCode(null);
    setResponsePayload(null);
    setNetworkError(null);

    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken || !user?.uid) {
        throw new Error("Session utilisateur requise. Connectez-vous pour tester le parser.");
      }

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("userId", user.uid);

      const response = await fetch("/api/pdf-parser", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`
        },
        body: formData
      });

      const payload = (await response.json()) as ParserResponse;
      setStatusCode(response.status);
      setResponsePayload(payload);
    } catch (error) {
      setNetworkError(error instanceof Error ? error.message : "Erreur reseau inconnue.");
    } finally {
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

      const response = await fetch("/api/pdf-parser", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${idToken}`
        }
      });

      const payload = (await response.json()) as unknown;
      setHistoryPayload(payload);
      setStatusCode(response.status);
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
              et affiche la reponse JSON brute.
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
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
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

          <div className="mt-6 space-y-3">
            {networkError ? (
              <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                Erreur reseau: {networkError}
              </p>
            ) : null}

            {statusCode !== null ? (
              <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85">
                Statut HTTP: <span className="font-semibold">{statusCode}</span>
              </p>
            ) : null}

            {formattedJson ? (
              <div className="rounded-xl border border-white/10 bg-black/35 p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-white/55">Reponse JSON</p>
                <pre className="max-h-[62vh] overflow-auto rounded-lg bg-black/35 p-3 text-xs text-emerald-200">
                  {formattedJson}
                </pre>
              </div>
            ) : null}

            {formattedHistoryJson ? (
              <div className="rounded-xl border border-white/10 bg-black/35 p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-white/55">
                  Historique Firestore JSON
                </p>
                <pre className="max-h-[40vh] overflow-auto rounded-lg bg-black/35 p-3 text-xs text-sky-200">
                  {formattedHistoryJson}
                </pre>
              </div>
            ) : null}
          </div>
        </article>
      </section>
    </main>
  );
}
