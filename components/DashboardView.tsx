// components/DashboardView.tsx
// Vue client de l'espace de d�p�t avec DA premium coh�rente avec /analysis.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FlaskConical,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  RefreshCcw,
  Upload,
  User
} from "lucide-react";
import { UploadLanding } from "@/components/dashboard/UploadLanding";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { hasLocalAnalysisHint, setLocalAnalysisHint } from "@/lib/analysis/analysisAvailability";
import { ensureFolderName } from "@/lib/folders/activeFolder";
import { loadAppPreferences } from "@/lib/settings/appPreferences";
import { listUserAnalyses, saveAnalysisDraft } from "@/services/analysisStore";
import { firebaseAuthGateway } from "@/services/auth";
import { persistPendingAnalysisForUser } from "@/services/pendingAnalysisSync";
import type { AnalysisDraft, AnalysisRecord } from "@/types/analysis";
import type { AuthenticatedUser } from "@/types/auth";

export function DashboardView() {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasExistingAnalyses, setHasExistingAnalyses] = useState(hasLocalAnalysisHint);
  const [loadingAnalyses, setLoadingAnalyses] = useState(false);
  const [recentAnalyses, setRecentAnalyses] = useState<AnalysisRecord[]>([]);

  useEffect(() => {
    const unsubscribe = firebaseAuthGateway.subscribe((nextUser) => {
      if (!nextUser) {
        setUser(null);
        setLoadingAuth(false);
        router.replace("/login");
        return;
      }

      if (!nextUser.emailVerified) {
        void firebaseAuthGateway.signOut();
        setUser(null);
        setLoadingAuth(false);
        router.replace("/login");
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
        // Sécurise la transition post-inscription: on rattache d'abord une éventuelle
        // analyse locale créée en mode invité avant de lire l'historique Firestore.
        try {
          await persistPendingAnalysisForUser(currentUserId);
        } catch {
          // Non bloquant: on conserve le chargement normal de l'historique.
        }

        // On charge la presence d'analyses une seule fois pour piloter l'affichage
        // du bouton "Acceder aux dashboards" sur la page post-connexion.
        const analyses = await listUserAnalyses(currentUserId);
        const hasAnalyses = analyses.length > 0;
        if (isMounted) {
          setHasExistingAnalyses(hasAnalyses);
          setRecentAnalyses(analyses.slice(0, 6));
        }
        // Synchronise un hint local pour gerer les retours utilisateur meme
        // si la lecture Firestore echoue ponctuellement.
        setLocalAnalysisHint(hasAnalyses);
      } catch {
        // En cas d'erreur reseau/permission, on conserve le dernier etat connu
        // (localStorage) plutot que de masquer brutalement le bouton.
        if (isMounted) {
          setHasExistingAnalyses(hasLocalAnalysisHint());
          setRecentAnalyses([]);
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
      formData.append("source", "dashboard");
      files.forEach((file) => formData.append("files", file));

      const response = await fetch("/api/analyses", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as {
        analysisDraft?: AnalysisDraft;
        error?: string;
        detail?: string;
      };

      if (!response.ok || !payload.analysisDraft) {
        throw new Error(payload.detail ?? payload.error ?? "Le traitement du fichier a echoue.");
      }

      await saveAnalysisDraft(payload.analysisDraft);
      // Une analyse vient d'etre creee: on debloque explicitement le bouton
      // de navigation dashboard meme si l'utilisateur revient ensuite sur /dashboard.
      setHasExistingAnalyses(true);
      setLocalAnalysisHint(true);
      const preferences = loadAppPreferences();
      if (preferences.autoOpenAnalysisAfterUpload) {
        router.push("/analysis");
        return;
      }
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Erreur inattendue pendant le traitement du fichier."
      );
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
      <section className="precision-card relative z-10 mx-auto mt-8 w-full max-w-6xl rounded-2xl p-8 text-center">
        <p className="text-sm text-white/70">Chargement de la session...</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="precision-card relative z-10 mx-auto mt-8 w-full max-w-6xl rounded-2xl p-8 text-center">
        <p className="text-sm text-white/80">Votre session est expirée. Reconnectez-vous pour continuer.</p>
        <button
          type="button"
          onClick={() => router.replace("/login")}
          className="mt-4 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/85 hover:bg-white/10"
        >
          Se connecter
        </button>
      </section>
    );
  }

  return (
    <section className="relative z-10 mx-auto w-full max-w-6xl space-y-6">
      <header className="precision-card rounded-2xl p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <QuantisLogo withText={false} size={30} />
            <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">
              {"Espace de d\u00E9p\u00F4t "}
              <span className="text-quantis-gold">Quantis</span>
            </h1>
            <p className="mt-1 text-sm text-white/65">
              {"Connect\u00E9 en tant que "}
              {user?.displayName ?? user?.email}
            </p>
            <p className="mt-1 text-xs text-white/45">
              {"D\u00E9posez vos fichiers puis ouvrez votre analyse financi\u00E8re automatiquement."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                Upload
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                Parsing
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                KPI
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                Firestore
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {!loadingAnalyses && hasExistingAnalyses ? (
              <button
                type="button"
                onClick={() => router.push("/analysis")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-quantis-gold/35 bg-quantis-gold/15 px-4 py-2 text-sm font-medium text-quantis-gold transition-colors hover:bg-quantis-gold/25"
              >
                <LayoutDashboard className="h-4 w-4" />
                {"Acc\u00E9der aux dashboards"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => router.push("/upload")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition-colors hover:bg-white/10"
            >
              <Upload className="h-4 w-4" />
              Parcours upload guidé
            </button>
            <button
              type="button"
              onClick={() => router.push("/test-kpi")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition-colors hover:bg-white/10"
            >
              <FlaskConical className="h-4 w-4" />
              Page de test KPI
            </button>
            <button
              type="button"
              onClick={() => router.push("/account")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition-colors hover:bg-white/10"
            >
              <User className="h-4 w-4" />
              Mon compte
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 transition-colors hover:bg-rose-500/20"
            >
              <LogOut className="h-4 w-4" />
              {"Se d\u00E9connecter"}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60">
          <div className="flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5 text-quantis-gold" />
            <span>
              {"Le dashboard financier s\u2019affiche apr\u00E8s traitement dans la page d\u2019analyse."}
            </span>
          </div>
          {loadingAnalyses ? (
            <p className="mt-1 text-white/45">{"V\u00E9rification des analyses existantes..."}</p>
          ) : null}
        </div>
      </header>

      <UploadLanding loading={uploading} onUpload={handleUpload} />

      {errorMessage ? (
        <div className="precision-card rounded-xl border-rose-400/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      ) : null}

      <section className="precision-card rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Historique des analyses</h2>
            <p className="text-xs text-white/55">
              Accédez à vos analyses sans ré-uploader vos documents.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/analysis")}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
          >
            Voir tout l&apos;historique
          </button>
        </div>

        {loadingAnalyses ? (
          <p className="mt-3 text-sm text-white/60">Chargement de l&apos;historique...</p>
        ) : null}

        {!loadingAnalyses && recentAnalyses.length === 0 ? (
          <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/65">
            Aucune analyse enregistrée pour le moment.
          </p>
        ) : null}

        {recentAnalyses.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {recentAnalyses.map((analysis) => (
              <li
                key={analysis.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {analysis.fiscalYear ? `Exercice ${analysis.fiscalYear}` : "Analyse sans exercice"}
                  </p>
                  <p className="text-xs text-white/55">
                    {new Date(analysis.createdAt).toLocaleString("fr-FR")} • {analysis.folderName}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/analysis/${analysis.id}`)}
                    className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10"
                  >
                    Ouvrir
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/analysis/${analysis.id}`)}
                    className="inline-flex items-center gap-1 rounded-lg border border-quantis-gold/35 bg-quantis-gold/10 px-2.5 py-1.5 text-xs text-quantis-gold hover:bg-quantis-gold/20"
                  >
                    <RefreshCcw className="h-3.5 w-3.5" />
                    Relancer l&apos;analyse
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </section>
  );
}
