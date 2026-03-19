"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnalysisHistory } from "@/components/dashboard/AnalysisHistory";
import { KpiSummary } from "@/components/dashboard/KpiSummary";
import { UploadLanding } from "@/components/dashboard/UploadLanding";
import { listUserAnalyses, saveAnalysisDraft } from "@/services/analysisStore";
import { firebaseAuthGateway } from "@/services/auth";
import type { AnalysisDraft, AnalysisRecord } from "@/types/analysis";
import type { AuthenticatedUser } from "@/types/auth";

export function DashboardView() {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
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

    void loadHistory(user.uid);
  }, [user]);

  const selectedAnalysis = useMemo(
    () => analyses.find((analysis) => analysis.id === selectedAnalysisId) ?? analyses[0] ?? null,
    [analyses, selectedAnalysisId]
  );

  async function loadHistory(userId: string) {
    setLoadingHistory(true);
    setErrorMessage(null);

    try {
      const nextAnalyses = await listUserAnalyses(userId);
      setAnalyses(nextAnalyses);
      if (nextAnalyses.length > 0) {
        setSelectedAnalysisId(nextAnalyses[0].id);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unexpected error while loading history.");
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleUpload(files: File[]) {
    if (!user) {
      return;
    }

    setUploading(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("userId", user.uid);
      files.forEach((file) => formData.append("files", file));

      const response = await fetch("/api/analyses", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as { analysisDraft?: AnalysisDraft; error?: string; detail?: string };

      if (!response.ok || !payload.analysisDraft) {
        throw new Error(payload.detail ?? payload.error ?? "Upload pipeline failed.");
      }

      const savedAnalysis = await saveAnalysisDraft(payload.analysisDraft);
      setAnalyses((current) => [savedAnalysis, ...current]);
      setSelectedAnalysisId(savedAnalysis.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unexpected error while processing upload.");
    } finally {
      setUploading(false);
    }
  }

  async function handleLogout() {
    await firebaseAuthGateway.signOut();
    router.replace("/");
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
          <h1 className="mt-1 text-2xl font-semibold text-quantis-carbon">Dashboard financier</h1>
          <p className="mt-1 text-sm text-quantis-slate">
            Connecte en tant que {user?.displayName ?? user?.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/account")}
            className="rounded-xl border border-quantis-mist bg-white px-4 py-2 text-sm font-medium text-quantis-carbon hover:bg-quantis-paper"
          >
            Mon compte
          </button>
          <button type="button" onClick={handleLogout} className="quantis-primary px-4 py-2 text-sm font-medium">
            Se deconnecter
          </button>
        </div>
      </header>

      <UploadLanding loading={uploading} onUpload={handleUpload} />

      {errorMessage ? <div className="quantis-panel border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div> : null}

      {loadingHistory ? <div className="quantis-panel px-4 py-3 text-sm text-quantis-slate">Chargement de l&apos;historique...</div> : null}

      <KpiSummary kpis={selectedAnalysis?.kpis ?? null} />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <AnalysisHistory
          analyses={analyses}
          selectedAnalysisId={selectedAnalysis?.id ?? null}
          onSelect={(id) => setSelectedAnalysisId(id)}
        />

        <section className="quantis-panel p-5">
          <h2 className="text-sm font-semibold text-quantis-carbon">Derniere extraction</h2>
          {selectedAnalysis ? (
            <>
              <p className="mt-1 text-xs text-quantis-slate">
                Creee le {new Date(selectedAnalysis.createdAt).toLocaleString("fr-FR")}
              </p>
              <div className="mt-4 space-y-2 text-sm text-quantis-carbon">
                <p>Revenue: {formatCurrency(selectedAnalysis.financialFacts.revenue)}</p>
                <p>Expenses: {formatCurrency(selectedAnalysis.financialFacts.expenses)}</p>
                <p>Payroll: {formatCurrency(selectedAnalysis.financialFacts.payroll)}</p>
                <p>Tresorerie: {formatCurrency(selectedAnalysis.financialFacts.treasury)}</p>
                <p>BFR (receivables + inventory - payables): {formatCurrency(selectedAnalysis.kpis.workingCapital)}</p>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-quantis-slate">Charge tes premiers fichiers pour afficher les resultats.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "N/A";
  }

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(value);
}
