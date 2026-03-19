"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserAnalysisById } from "@/services/analysisStore";
import { firebaseAuthGateway } from "@/services/auth";
import type { AnalysisRecord } from "@/types/analysis";
import type { AuthenticatedUser } from "@/types/auth";

type AnalysisDetailViewProps = {
  analysisId: string;
};

export function AnalysisDetailView({ analysisId }: AnalysisDetailViewProps) {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  useEffect(() => {
    if (!user) {
      return;
    }

    void loadAnalysis(user.uid, analysisId);
  }, [user, analysisId]);

  async function loadAnalysis(userId: string, id: string) {
    setLoadingAnalysis(true);
    setErrorMessage(null);

    try {
      const current = await getUserAnalysisById(userId, id);
      if (!current) {
        setAnalysis(null);
        setErrorMessage("Analyse introuvable ou inaccessible.");
        return;
      }

      setAnalysis(current);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Erreur inattendue pendant le chargement."
      );
    } finally {
      setLoadingAnalysis(false);
    }
  }

  if (loadingAuth) {
    return (
      <section className="quantis-panel p-8 text-center">
        <p className="text-sm text-quantis-slate">Chargement de la session...</p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="quantis-panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-quantis-slate">Quantis</p>
          <h1 className="mt-1 text-2xl font-semibold text-quantis-carbon">Inspection d&apos;analyse</h1>
          <p className="mt-1 text-sm text-quantis-slate">
            Identifiant: <span className="font-mono">{analysisId}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="quantis-primary px-4 py-2 text-sm font-medium"
        >
          Retour au tableau de bord
        </button>
      </header>

      {loadingAnalysis ? (
        <div className="quantis-panel px-4 py-3 text-sm text-quantis-slate">Chargement de l&apos;analyse...</div>
      ) : null}

      {errorMessage ? (
        <div className="quantis-panel border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {analysis ? (
        <>
          <section className="quantis-panel p-5">
            <h2 className="text-sm font-semibold text-quantis-carbon">Metadonnees</h2>
            <div className="mt-3 grid gap-2 text-sm text-quantis-carbon md:grid-cols-2">
              <p>
                Creee le: <span className="font-medium">{new Date(analysis.createdAt).toLocaleString("fr-FR")}</span>
              </p>
              <p>
                Exercice:{" "}
                <span className="font-medium">
                  {analysis.fiscalYear !== null ? analysis.fiscalYear : "Non renseigne"}
                </span>
              </p>
              <p>
                Utilisateur: <span className="font-mono">{analysis.userId}</span>
              </p>
              <p>
                Fichiers source:{" "}
                <span className="font-medium">
                  {analysis.sourceFiles.length > 0 ? analysis.sourceFiles.map((file) => file.name).join(", ") : "Aucun"}
                </span>
              </p>
            </div>
          </section>

          <JsonPanel title="Donnees brutes (rawData)" value={analysis.rawData} />
          <JsonPanel title="Donnees mappees (mappedData)" value={analysis.mappedData} />
          <JsonPanel title="Indicateurs (kpis)" value={analysis.kpis} />
          <JsonPanel title="Detail parser (parsedData)" value={analysis.parsedData} />
        </>
      ) : null}
    </section>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="quantis-panel p-5">
      <h2 className="text-sm font-semibold text-quantis-carbon">{title}</h2>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-quantis-paper p-4 text-xs text-quantis-carbon">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}
