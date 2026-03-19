"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Folder,
  Gauge,
  LayoutDashboard,
  Lock,
  LogOut,
  Plus,
  Settings,
  Sparkles,
  Upload,
  UserCircle2
} from "lucide-react";
import { buildAnalysisDashboardViewModel, type DashboardSeverity } from "@/lib/dashboard/analysisDashboardViewModel";
import { clearLocalAnalysisHint, setLocalAnalysisHint } from "@/lib/analysis/analysisAvailability";
import { DEFAULT_FOLDER_NAME, ensureFolderName, getActiveFolderName, setActiveFolderName } from "@/lib/folders/activeFolder";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { getUserAnalysisById, listUserAnalyses, saveAnalysisDraft } from "@/services/analysisStore";
import { firebaseAuthGateway } from "@/services/auth";
import { getUserProfile } from "@/services/userProfileStore";
import type { AnalysisDraft, AnalysisRecord } from "@/types/analysis";
import type { AuthenticatedUser } from "@/types/auth";

type AnalysisDetailViewProps = {
  analysisId?: string;
};

type FolderFileItem = {
  name: string;
  createdAt: string;
};

const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv", ".pdf"];

export function AnalysisDetailView({ analysisId }: AnalysisDetailViewProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null);
  const [allAnalyses, setAllAnalyses] = useState<AnalysisRecord[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string>(getActiveFolderName() ?? DEFAULT_FOLDER_NAME);
  const [greetingName, setGreetingName] = useState("Utilisateur");
  const [companyName, setCompanyName] = useState("Quantis");
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

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

    void loadDashboardData(user, analysisId);
  }, [user, analysisId]);

  useEffect(() => {
    if (currentFolder.trim()) {
      setActiveFolderName(currentFolder);
    }
  }, [currentFolder]);

  const analysesInCurrentFolder = useMemo(
    () => allAnalyses.filter((item) => normalizeFolderName(item.folderName) === normalizeFolderName(currentFolder)),
    [allAnalyses, currentFolder]
  );

  useEffect(() => {
    if (!allAnalyses.length) {
      return;
    }

    if (!analysis) {
      if (analysesInCurrentFolder.length) {
        setAnalysis(analysesInCurrentFolder[0]);
      }
      return;
    }

    if (normalizeFolderName(analysis.folderName) !== normalizeFolderName(currentFolder)) {
      setAnalysis(analysesInCurrentFolder[0] ?? null);
    }
  }, [analysis, analysesInCurrentFolder, allAnalyses, currentFolder]);

  const folderNames = useMemo(() => {
    const set = new Set<string>();
    allAnalyses.forEach((item) => set.add(normalizeFolderName(item.folderName)));
    set.add(normalizeFolderName(currentFolder));
    return Array.from(set).sort((left, right) => left.localeCompare(right, "fr"));
  }, [allAnalyses, currentFolder]);

  const sourceFiles = useMemo<FolderFileItem[]>(() => {
    const deduped = new Map<string, FolderFileItem>();
    analysesInCurrentFolder
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .forEach((item) => {
        item.sourceFiles.forEach((file) => {
          const key = file.name.toLowerCase();
          if (!deduped.has(key)) {
            deduped.set(key, {
              name: file.name,
              createdAt: item.createdAt
            });
          }
        });
      });

    return Array.from(deduped.values());
  }, [analysesInCurrentFolder]);

  const dashboardView = useMemo(
    () => (analysis ? buildAnalysisDashboardViewModel(analysis.kpis) : null),
    [analysis]
  );

  async function loadDashboardData(currentUser: AuthenticatedUser, targetAnalysisId?: string) {
    setLoadingAnalysis(true);
    setErrorMessage(null);

    try {
      const [history, profile] = await Promise.all([
        listUserAnalyses(currentUser.uid),
        getUserProfile(currentUser.uid)
      ]);

      setAllAnalyses(history);
      setGreetingName(resolveFirstName(currentUser, profile?.firstName));
      setCompanyName(profile?.companyName?.trim() || "Quantis");

      if (!history.length) {
        // Aucun historique: on retire l'indicateur local d'existence d'analyses.
        clearLocalAnalysisHint();
        setAnalysis(null);
        setCurrentFolder(getActiveFolderName() ?? DEFAULT_FOLDER_NAME);
        setErrorMessage("Aucune analyse disponible. Deposez un fichier pour afficher le dashboard.");
        return;
      }

      // Historique present: on force l'indicateur local pour harmoniser /dashboard.
      setLocalAnalysisHint(true);

      let selected: AnalysisRecord | null = null;
      if (targetAnalysisId) {
        selected = history.find((item) => item.id === targetAnalysisId) ?? null;
        if (!selected) {
          const fetched = await getUserAnalysisById(currentUser.uid, targetAnalysisId);
          selected = fetched;
        }
      }

      if (!selected) {
        const storedFolder = getActiveFolderName();
        if (storedFolder) {
          selected = history.find((item) => normalizeFolderName(item.folderName) === normalizeFolderName(storedFolder)) ?? null;
        }
      }

      selected = selected ?? history[0];

      setAnalysis(selected);
      setCurrentFolder(normalizeFolderName(selected.folderName));
      setActiveFolderName(normalizeFolderName(selected.folderName));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Erreur inattendue pendant le chargement."
      );
    } finally {
      setLoadingAnalysis(false);
    }
  }

  async function handleUploadFiles(files: File[]) {
    if (!user || !files.length) {
      return;
    }

    const folderName = ensureFolderName(currentFolder);
    if (!folderName) {
      setErrorMessage("Le nom de dossier est requis pour ajouter des fichiers.");
      return;
    }

    setUploading(true);
    setErrorMessage(null);
    setInfoMessage(null);

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

      const saved = await saveAnalysisDraft(payload.analysisDraft);
      setAllAnalyses((current) => [saved, ...current]);
      setLocalAnalysisHint(true);
      setCurrentFolder(normalizeFolderName(saved.folderName));
      setAnalysis(saved);
      setInfoMessage("Fichier traite avec succes. Dashboard mis a jour.");
      router.replace("/analysis");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inattendue pendant l'ajout du fichier.");
    } finally {
      setUploading(false);
    }
  }

  function handleNewFolder() {
    const next = ensureFolderName(null);
    if (!next) {
      return;
    }
    setCurrentFolder(normalizeFolderName(next));
    setInfoMessage(`Dossier actif: ${normalizeFolderName(next)}`);
  }

  function onInputFilesSelected(fileList: FileList | null) {
    if (!fileList) {
      return;
    }

    const filtered = Array.from(fileList).filter((file) => {
      const name = file.name.toLowerCase();
      return ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension));
    });

    if (!filtered.length) {
      setErrorMessage("Aucun fichier supporte detecte. Formats: .xlsx .xls .csv .pdf");
      return;
    }

    void handleUploadFiles(filtered);
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
    <section className="space-y-4">
      <header className="quantis-panel flex items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-3">
          <QuantisLogo withText={false} size={28} />
          <div>
            <p className="text-sm font-semibold text-quantis-carbon">{companyName}</p>
            <p className="text-xs text-quantis-slate">Plateforme financiere</p>
          </div>
        </div>

        <div className="hidden text-sm font-medium text-quantis-carbon md:block">Dashboard</div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/settings")}
            className="rounded-xl border border-quantis-mist bg-white p-2 text-quantis-carbon hover:bg-quantis-paper"
            aria-label="Parametres"
            title="Parametres"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => router.push("/pricing")}
            className="rounded-xl border border-quantis-mist bg-white p-2 text-quantis-carbon hover:bg-quantis-paper"
            aria-label="Offres"
            title="Offre Free (verrouille)"
          >
            <Lock className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => router.push("/account?from=analysis")}
            className="rounded-xl border border-quantis-mist bg-white p-2 text-quantis-carbon hover:bg-quantis-paper"
            aria-label="Compte"
            title="Compte"
          >
            <UserCircle2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-quantis-mist bg-white p-2 text-quantis-carbon hover:bg-quantis-paper"
            aria-label="Se deconnecter"
            title="Se deconnecter"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {loadingAnalysis ? (
        <div className="quantis-panel px-4 py-3 text-sm text-quantis-slate">Chargement de l&apos;analyse...</div>
      ) : null}

      {errorMessage ? (
        <div className="quantis-panel border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {infoMessage ? (
        <div className="quantis-panel border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {infoMessage}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="quantis-panel h-fit p-4 lg:sticky lg:top-4">
          <nav className="space-y-1 text-sm">
            <NavRow icon={<LayoutDashboard className="h-4 w-4" />} active>
              Dashboard
            </NavRow>
            <NavRow icon={<Sparkles className="h-4 w-4" />} disabled>
              Analyses (Bientot)
            </NavRow>
            <NavRow icon={<Sparkles className="h-4 w-4" />} disabled>
              Documents (Bientot)
            </NavRow>
            <NavRow icon={<UserCircle2 className="h-4 w-4" />} onClick={() => router.push("/account?from=analysis")}>
              Compte
            </NavRow>
          </nav>

          <div className="mt-4 rounded-xl border border-quantis-mist bg-quantis-paper p-3">
            <p className="text-[11px] uppercase tracking-wide text-quantis-slate">Compte</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-quantis-carbon text-sm font-semibold text-white">
                {greetingName.charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="text-sm font-medium text-quantis-carbon">{greetingName}</p>
                <p className="text-xs text-quantis-slate">Free</p>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-quantis-slate">Projects</p>
              <button
                type="button"
                onClick={handleNewFolder}
                className="rounded p-1 text-quantis-slate hover:bg-quantis-paper hover:text-quantis-carbon"
                aria-label="Nouveau dossier"
                title="Nouveau dossier"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 space-y-1">
              {folderNames.map((folderName) => {
                const isActive = normalizeFolderName(folderName) === normalizeFolderName(currentFolder);
                const count = allAnalyses.filter((item) => normalizeFolderName(item.folderName) === normalizeFolderName(folderName)).length;
                return (
                  <button
                    key={folderName}
                    type="button"
                    onClick={() => setCurrentFolder(normalizeFolderName(folderName))}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
                      isActive ? "bg-quantis-paper text-quantis-carbon" : "text-quantis-slate hover:bg-quantis-paper"
                    }`}
                  >
                    <Folder className="h-4 w-4" />
                    <span className="min-w-0 flex-1 truncate text-sm">{folderName}</span>
                    <span className="text-[11px]">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 border-t border-quantis-mist pt-4">
            <p className="text-xs uppercase tracking-wide text-quantis-slate">Source files</p>
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {sourceFiles.length === 0 ? (
                <p className="px-1 text-xs text-quantis-slate">Aucun fichier dans ce dossier.</p>
              ) : (
                sourceFiles.map((file) => (
                  <div key={`${file.name}-${file.createdAt}`} className="rounded-lg border border-quantis-mist bg-white px-2 py-1.5">
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-3.5 w-3.5 text-quantis-slate" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-quantis-carbon">{file.name}</p>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-quantis-slate">
                          <span>{new Date(file.createdAt).toLocaleDateString("fr-FR")}</span>
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-quantis-mist bg-white p-3 text-center">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".xlsx,.xls,.csv,.pdf"
              className="hidden"
              onChange={(event) => {
                onInputFilesSelected(event.target.files);
                event.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full rounded-lg px-2 py-3 text-xs text-quantis-carbon hover:bg-quantis-paper disabled:cursor-not-allowed disabled:opacity-60"
              onDrop={(event) => {
                event.preventDefault();
                onInputFilesSelected(event.dataTransfer.files);
              }}
              onDragOver={(event) => event.preventDefault()}
            >
              <Upload className="mx-auto h-4 w-4 text-quantis-slate" />
              <p className="mt-2 font-medium">Drag and drop</p>
              <p className="text-[11px] text-quantis-slate">or click to browse</p>
            </button>
          </div>
        </aside>

        <div className="space-y-6">
          <header className="quantis-panel p-5">
            <p className="text-xs uppercase tracking-wide text-quantis-slate">Analyse financiere</p>
            <h1 className="mt-1 text-3xl font-semibold text-quantis-carbon">Hello {greetingName}</h1>
            <p className="mt-1 text-sm text-quantis-slate">Voici un apercu de votre situation financiere</p>
            <p className="mt-2 text-xs text-quantis-slate">
              Dossier {currentFolder} - Mise a jour {analysis ? new Date(analysis.createdAt).toLocaleString("fr-FR") : "N/D"}
            </p>
          </header>

          {analysis && dashboardView ? (
            <>
              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {dashboardView.topCards.map((card) => (
                  <article key={card.id} className="quantis-panel p-4">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-quantis-slate">
                      {cardIcon(card.id)}
                      <span>{card.label}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-2xl font-semibold text-quantis-carbon">{formatMetric(card.value, card.format)}</p>
                      <StatusDot severity={card.severity} />
                    </div>
                  </article>
                ))}
              </section>

              <section className="quantis-panel p-5">
                <p className="text-xs uppercase tracking-wide text-quantis-slate">Suggestions</p>
                <div className="quantis-input mt-3 flex items-center gap-2 px-3 py-3 text-sm text-quantis-carbon">
                  <Sparkles className="h-4 w-4 text-quantis-slate" />
                  <span>Puis-je investir 80kEUR ?</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {dashboardView.suggestions.slice(1).map((suggestion) => (
                    <span
                      key={suggestion}
                      className="rounded-full border border-quantis-mist bg-white px-3 py-1.5 text-xs text-quantis-carbon"
                    >
                      {suggestion}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-quantis-slate">
                  Cette zone sera assistee par IA dans une prochaine version.
                </p>
              </section>

              <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <article className="quantis-panel p-5">
                  <p className="text-xs uppercase tracking-wide text-quantis-slate">Sante globale</p>
                  <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-center">
                    <ScoreRing value={dashboardView.score.value} severity={dashboardView.score.severity} />
                    <div>
                      <p className="text-lg font-semibold text-quantis-carbon">Sante globale</p>
                      <p className="text-sm text-quantis-slate">{dashboardView.score.label}</p>
                    </div>
                  </div>
                </article>

                <article className="quantis-panel p-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-wide text-quantis-slate">Alertes</p>
                    <span className="rounded-full bg-quantis-paper px-2 py-1 text-xs font-medium text-quantis-carbon">
                      {dashboardView.alerts.count}
                    </span>
                  </div>

                  {dashboardView.alerts.items.length === 0 ? (
                    <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      Aucune anomalie detectee.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {dashboardView.alerts.items.map((alert) => (
                        <li
                          key={alert.id}
                          className={`rounded-xl border-l-4 px-3 py-2 ${alertContainerClass(alert.severity)}`}
                        >
                          <div className="flex items-start gap-2">
                            <AlertTriangle className={`mt-0.5 h-4 w-4 ${alertColorClass(alert.severity)}`} />
                            <div>
                              <p className="text-sm font-medium text-quantis-carbon">{alert.title}</p>
                              <p className="text-xs text-quantis-slate">{alert.description}</p>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              </section>

              <section className="grid gap-4 xl:grid-cols-2">
                {dashboardView.sections.map((section) => (
                  <article key={section.id} className="quantis-panel p-5">
                    <h2 className="text-sm font-semibold text-quantis-carbon">{section.title}</h2>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {section.metrics.map((metric) => (
                        <div key={String(metric.key)} className="rounded-xl border border-quantis-mist bg-white px-3 py-2">
                          <p className="text-xs text-quantis-slate">{metric.label}</p>
                          <p className="mt-1 text-sm font-semibold text-quantis-carbon">
                            {formatMetric(metric.value, metric.format)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </section>

              <details className="quantis-panel p-5">
                <summary className="cursor-pointer text-sm font-semibold text-quantis-carbon">
                  Donnees source (debug)
                </summary>
                <div className="mt-4 grid gap-4 xl:grid-cols-3">
                  <JsonPanel title="rawData" value={analysis.rawData} />
                  <JsonPanel title="mappedData" value={analysis.mappedData} />
                  <JsonPanel title="kpis" value={analysis.kpis} />
                </div>
              </details>
            </>
          ) : (
            <section className="quantis-panel p-5">
              <p className="text-sm text-quantis-slate">
                Ce dossier ne contient pas encore d&apos;analyse. Ajoutez un fichier pour demarrer.
              </p>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}

function resolveFirstName(user: AuthenticatedUser, profileFirstName?: string): string {
  if (profileFirstName && profileFirstName.trim()) {
    return profileFirstName.trim();
  }

  if (user.displayName && user.displayName.trim()) {
    return user.displayName.trim().split(" ")[0] || "Utilisateur";
  }

  if (user.email) {
    return user.email.split("@")[0] || "Utilisateur";
  }

  return "Utilisateur";
}

function normalizeFolderName(folderName?: string | null): string {
  const cleaned = folderName?.trim();
  return cleaned || DEFAULT_FOLDER_NAME;
}

function formatMetric(
  value: number | null,
  format: "currency" | "percent" | "days" | "ratio" | "years" | "months" | "number"
): string {
  if (value === null) {
    return "N/D";
  }

  if (format === "currency") {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0
    }).format(value);
  }

  if (format === "percent") {
    const normalized = Math.abs(value) <= 1 ? value * 100 : value;
    return `${normalized.toFixed(1)}%`;
  }

  if (format === "days") {
    return `${value.toFixed(0)} j`;
  }

  if (format === "years") {
    return `${value.toFixed(1)} ans`;
  }

  if (format === "months") {
    return `${value.toFixed(1)} mois`;
  }

  if (format === "ratio") {
    return value.toFixed(2);
  }

  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0
  }).format(value);
}

function NavRow({
  children,
  icon,
  active,
  disabled,
  onClick
}: {
  children: ReactNode;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
        active
          ? "bg-quantis-paper text-quantis-carbon"
          : disabled
            ? "cursor-not-allowed text-quantis-slate/70"
            : "text-quantis-carbon hover:bg-quantis-paper"
      }`}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function StatusDot({ severity }: { severity: DashboardSeverity }) {
  const className =
    severity === "green"
      ? "bg-emerald-500"
      : severity === "orange"
        ? "bg-amber-500"
        : severity === "red"
          ? "bg-rose-600"
          : "bg-slate-400";

  return <span className={`h-2.5 w-2.5 rounded-full ${className}`} />;
}

function ScoreRing({ value, severity }: { value: number | null; severity: DashboardSeverity }) {
  const [animatedValue, setAnimatedValue] = useState(0);
  const previousValueRef = useRef(0);
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const clampedTarget = value === null ? 0 : Math.max(0, Math.min(100, value));

  useEffect(() => {
    const start = performance.now();
    const duration = 900;
    const from = previousValueRef.current;
    const to = clampedTarget;
    let frame = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedValue(from + (to - from) * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        previousValueRef.current = to;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clampedTarget]);

  const progress = (animatedValue / 100) * circumference;
  const dashOffset = circumference - progress;

  const ringColor =
    severity === "green"
      ? "stroke-emerald-500"
      : severity === "orange"
        ? "stroke-amber-500"
        : severity === "red"
          ? "stroke-rose-600"
          : "stroke-slate-400";

  const glowColor =
    severity === "green"
      ? "rgba(16,185,129,0.18)"
      : severity === "orange"
        ? "rgba(245,158,11,0.2)"
        : severity === "red"
          ? "rgba(225,29,72,0.18)"
          : "rgba(148,163,184,0.18)";

  return (
    <div className="relative h-36 w-36 quantis-score-ring">
      <div
        className="absolute inset-3 rounded-full quantis-score-ring__glow"
        style={{ background: glowColor }}
        aria-hidden="true"
      />
      <svg className="relative h-36 w-36 -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={radius} className="fill-none stroke-quantis-mist/70" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          className={`fill-none ${ringColor}`}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-full border border-quantis-mist bg-white/85 px-4 py-3 text-center shadow-sm">
          <Gauge className="mx-auto h-4 w-4 text-quantis-slate" />
          <p className="mt-1 text-lg font-semibold text-quantis-carbon">
            {value === null ? "N/D" : `${Math.round(animatedValue)}%`}
          </p>
        </div>
      </div>
    </div>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <section>
      <p className="text-xs uppercase tracking-wide text-quantis-slate">{title}</p>
      <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-quantis-paper p-3 text-xs text-quantis-carbon">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

function alertColorClass(severity: "green" | "orange" | "red"): string {
  if (severity === "red") {
    return "text-rose-600";
  }
  if (severity === "orange") {
    return "text-amber-500";
  }
  return "text-emerald-500";
}

function alertContainerClass(severity: "green" | "orange" | "red"): string {
  if (severity === "red") {
    return "border-rose-400 bg-rose-50";
  }
  if (severity === "orange") {
    return "border-amber-400 bg-amber-50";
  }
  return "border-emerald-400 bg-emerald-50";
}

function cardIcon(cardId: "cash" | "health" | "alerts" | "runway"): ReactNode {
  if (cardId === "cash") {
    return <Upload className="h-3.5 w-3.5" />;
  }
  if (cardId === "health") {
    return <Gauge className="h-3.5 w-3.5" />;
  }
  if (cardId === "alerts") {
    return <AlertTriangle className="h-3.5 w-3.5" />;
  }
  return <Sparkles className="h-3.5 w-3.5" />;
}
