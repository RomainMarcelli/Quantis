"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadLanding } from "@/components/dashboard/UploadLanding";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { hasLocalAnalysisHint, setLocalAnalysisHint } from "@/lib/analysis/analysisAvailability";
import { ensureFolderName } from "@/lib/folders/activeFolder";
import { listUserAnalyses, saveAnalysisDraft } from "@/services/analysisStore";
import { firebaseAuthGateway } from "@/services/auth";
import type { AnalysisDraft } from "@/types/analysis";
import type { AuthenticatedUser } from "@/types/auth";

export function DashboardView() {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasExistingAnalyses, setHasExistingAnalyses] = useState(hasLocalAnalysisHint);
  const [loadingAnalyses, setLoadingAnalyses] = useState(false);

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
      setHasExistingAnalyses(false);
      return;
    }

    // On capture l'uid une fois pour eviter un acces a `user` potentiellement null
    // dans la closure asynchrone (exigence TypeScript en mode strict).
    const currentUserId = user.uid;
    let isMounted = true;

    async function loadAnalysesAvailability() {
      setLoadingAnalyses(true);
      try {
        // On charge la presence d'analyses une seule fois pour piloter l'affichage
        // du bouton "Acceder aux dashboards" sur la page post-connexion.
        const analyses = await listUserAnalyses(currentUserId);
        const hasAnalyses = analyses.length > 0;
        if (isMounted) {
          setHasExistingAnalyses(hasAnalyses);
        }
        // Synchronise un hint local pour gerer les retours utilisateur meme
        // si la lecture Firestore echoue ponctuellement.
        setLocalAnalysisHint(hasAnalyses);
      } catch {
        // En cas d'erreur reseau/permission, on conserve le dernier etat connu
        // (localStorage) plutot que de masquer brutalement le bouton.
        if (isMounted) {
          setHasExistingAnalyses(hasLocalAnalysisHint());
        }
      } finally {
        if (isMounted) {
          setLoadingAnalyses(false);
        }
      }
    }

    void loadAnalysesAvailability();

    return () => {
      isMounted = false;
    };
  }, [user]);

  async function handleUpload(files: File[]) {
    if (!user) {
      return;
    }

    const folderName = ensureFolderName();
    if (!folderName) {
      setErrorMessage("Un nom de dossier est requis pour continuer.");
      return;
    }

    setUploading(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("userId", user.uid);
      formData.append("folderName", folderName);
      files.forEach((file) => formData.append("files", file));

      const response = await fetch("/api/analyses", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as { analysisDraft?: AnalysisDraft; error?: string; detail?: string };

      if (!response.ok || !payload.analysisDraft) {
        throw new Error(payload.detail ?? payload.error ?? "Le traitement du fichier a echoue.");
      }

      await saveAnalysisDraft(payload.analysisDraft);
      // Une analyse vient d'etre creee: on debloque explicitement le bouton
      // de navigation dashboard meme si l'utilisateur revient ensuite sur /dashboard.
      setHasExistingAnalyses(true);
      setLocalAnalysisHint(true);
      router.push("/analysis");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inattendue pendant le traitement du fichier.");
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
          <QuantisLogo />
          <h1 className="mt-1 text-2xl font-semibold text-quantis-carbon">Espace de depot</h1>
          <p className="mt-1 text-sm text-quantis-slate">
            Connecte en tant que {user?.displayName ?? user?.email}
          </p>
          <p className="mt-1 text-xs text-quantis-slate">
            Le dashboard financier s&apos;affiche apres traitement dans la page d&apos;analyse.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!loadingAnalyses && hasExistingAnalyses ? (
            <button
              type="button"
              onClick={() => router.push("/analysis")}
              className="rounded-xl border border-quantis-mist bg-white px-4 py-2 text-sm font-medium text-quantis-carbon hover:bg-quantis-paper"
            >
              Acceder aux dashboards
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => router.push("/test-kpi")}
            className="rounded-xl border border-quantis-mist bg-white px-4 py-2 text-sm font-medium text-quantis-carbon hover:bg-quantis-paper"
          >
            Page de test KPI
          </button>
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
    </section>
  );
}
