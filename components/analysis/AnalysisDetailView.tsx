// File: components/analysis/AnalysisDetailView.tsx
// Role: assemble la page /analysis (et /analysis/[id]) avec dashboard premium, dossiers, upload et debug.
"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Folder,
  LayoutDashboard,
  Lock,
  LogOut,
  Plus,
  Settings,
  Sparkles,
  Upload,
  UserCircle2
} from "lucide-react";
import { buildAnalysisDashboardViewModel } from "@/lib/dashboard/analysisDashboardViewModel";
import { toPremiumKpis } from "@/lib/dashboard/premiumDashboardAdapter";
import { clearLocalAnalysisHint, setLocalAnalysisHint } from "@/lib/analysis/analysisAvailability";
import {
  DEFAULT_FOLDER_NAME,
  ensureFolderName,
  getActiveFolderName,
  getKnownFolderNames,
  registerKnownFolderName,
  setActiveFolderName
} from "@/lib/folders/activeFolder";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
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
  const [knownFolders, setKnownFolders] = useState<string[]>(() => getKnownFolderNames());
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
      setKnownFolders(registerKnownFolderName(currentFolder));
    }
  }, [currentFolder]);

  useEffect(() => {
    // Les dossiers deja utilises dans l'historique sont memorises localement
    // pour permettre de jongler entre plusieurs dossiers, meme avant nouvel upload.
    if (!allAnalyses.length) {
      return;
    }

    allAnalyses.forEach((item) => registerKnownFolderName(item.folderName));
    setKnownFolders(getKnownFolderNames());
  }, [allAnalyses]);

  useEffect(() => {
    // Contrainte produit: /analysis doit rester en mode dark par defaut.
    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "dark");

    return () => {
      if (previousTheme) {
        root.setAttribute("data-theme", previousTheme);
        return;
      }
      root.removeAttribute("data-theme");
    };
  }, []);

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
    knownFolders.forEach((folderName) => set.add(normalizeFolderName(folderName)));
    set.add(normalizeFolderName(currentFolder));
    return Array.from(set).sort((left, right) => left.localeCompare(right, "fr"));
  }, [allAnalyses, currentFolder, knownFolders]);

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

  // Adaptateur UI premium: isole les cles de presentation sans toucher la logique metier.
  const premiumKpis = useMemo(
    () => (analysis ? toPremiumKpis(analysis.kpis) : null),
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
      setKnownFolders(registerKnownFolderName(saved.folderName));
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
    // Creation non bloquante: un clic sur "+" cree toujours un dossier unique.
    const next = buildNextFolderName(folderNames);
    setCurrentFolder(normalizeFolderName(next));
    setKnownFolders(registerKnownFolderName(next));
    setInfoMessage(`Dossier cree et actif: ${normalizeFolderName(next)}`);
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
      <section className="precision-card rounded-2xl p-8 text-center">
        <p className="text-sm text-white/70">Chargement de la session...</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {/* Bandeau d'actions globales conserve (settings/offres/compte/logout) avec skin premium dark. */}
      <header className="precision-card flex items-center justify-between gap-3 rounded-2xl px-5 py-3">
        <div className="flex items-center gap-3">
          <QuantisLogo withText={false} size={28} />
          <div>
            <p className="text-sm font-semibold text-white">{companyName}</p>
            <p className="text-xs text-white/55">Plateforme financiere</p>
          </div>
        </div>

        <div className="hidden text-sm font-medium text-white md:block">Dashboard</div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/settings")}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
            aria-label="Parametres"
            title="Parametres"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => router.push("/pricing")}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
            aria-label="Offres"
            title="Offre Free (verrouille)"
          >
            <Lock className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => router.push("/account?from=analysis")}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
            aria-label="Compte"
            title="Compte"
          >
            <UserCircle2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
            aria-label="Se deconnecter"
            title="Se deconnecter"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {loadingAnalysis ? (
        <div className="precision-card rounded-2xl px-4 py-3 text-sm text-white/70">Chargement de l&apos;analyse...</div>
      ) : null}

      {errorMessage ? (
        <div className="precision-card rounded-2xl border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {errorMessage}
        </div>
      ) : null}

      {infoMessage ? (
        <div className="precision-card rounded-2xl border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {infoMessage}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Sidebar metier: dossiers + fichiers + upload, conservee mais re-skinee premium. */}
        <aside className="precision-card h-fit rounded-2xl p-4 lg:sticky lg:top-4">
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

          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/50">Compte</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm font-semibold text-white">
                {greetingName.charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="text-sm font-medium text-white">{greetingName}</p>
                <p className="text-xs text-white/55">Free</p>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-white/50">Projects</p>
              <button
                type="button"
                onClick={handleNewFolder}
                className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
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
                      isActive ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
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

          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="text-xs uppercase tracking-wide text-white/50">Source files</p>
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {sourceFiles.length === 0 ? (
                <p className="px-1 text-xs text-white/55">Aucun fichier dans ce dossier.</p>
              ) : (
                sourceFiles.map((file) => (
                  <div key={`${file.name}-${file.createdAt}`} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-3.5 w-3.5 text-white/55" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-white">{file.name}</p>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/55">
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

          <div className="mt-4 rounded-xl border border-dashed border-white/20 bg-black/15 p-3 text-center">
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
              className="w-full rounded-lg px-2 py-3 text-xs text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              onDrop={(event) => {
                event.preventDefault();
                onInputFilesSelected(event.dataTransfer.files);
              }}
              onDragOver={(event) => event.preventDefault()}
            >
              <Upload className="mx-auto h-4 w-4 text-white/60" />
              <p className="mt-2 font-medium">Drag and drop</p>
              <p className="text-[11px] text-white/55">or click to browse</p>
            </button>
          </div>
        </aside>

        <div className="space-y-6">
          {analysis && dashboardView && premiumKpis ? (
            <DashboardLayout
              // Le key force un remount propre quand on change d'analyse (reset slider IA local).
              key={analysis.id}
              companyName={companyName}
              greetingName={greetingName}
              kpis={premiumKpis}
            >
              {/* Les blocs existants restent presents en sections secondaires sous le bento premium. */}
              <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <article className="precision-card rounded-2xl p-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-wide text-white/60">Alertes</p>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-white">
                      {dashboardView.alerts.count}
                    </span>
                  </div>

                  {dashboardView.alerts.items.length === 0 ? (
                    <p className="mt-3 rounded-xl border border-emerald-200/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
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
                              <p className="text-sm font-medium text-white">{alert.title}</p>
                              <p className="text-xs text-white/65">{alert.description}</p>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>

                <article className="precision-card rounded-2xl p-5">
                  <h2 className="text-sm font-semibold text-white">KPI par blocs metier</h2>
                  <div className="mt-3 grid gap-2">
                    {dashboardView.sections.map((section) => (
                      <div key={section.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-white/60">{section.title}</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {section.metrics.map((metric) => (
                            <div key={String(metric.key)} className="rounded-lg border border-white/10 px-2 py-1.5">
                              <p className="text-[11px] text-white/55">{metric.label}</p>
                              <p className="text-xs font-semibold text-white">
                                {formatMetric(metric.value, metric.format)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
{/* 
              <details className="precision-card rounded-2xl p-5">
                <summary className="cursor-pointer text-sm font-semibold text-white">
                  Donnees source (debug)
                </summary>
                <div className="mt-4 grid gap-4 xl:grid-cols-3">
                  <JsonPanel title="rawData" value={analysis.rawData} />
                  <JsonPanel title="mappedData" value={analysis.mappedData} />
                  <JsonPanel title="kpis" value={analysis.kpis} />
                </div>
              </details> */}
            </DashboardLayout>
          ) : (
            <section className="precision-card rounded-2xl p-5">
              <p className="text-sm text-white/70">
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

function buildNextFolderName(existingFolderNames: string[]): string {
  const takenNames = new Set(existingFolderNames.map((folderName) => folderName.toLowerCase()));
  let index = 1;

  while (takenNames.has(`nouveau dossier ${index}`.toLowerCase())) {
    index += 1;
  }

  return `Nouveau dossier ${index}`;
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
          ? "bg-white/10 text-white"
          : disabled
            ? "cursor-not-allowed text-white/40"
            : "text-white/75 hover:bg-white/10 hover:text-white"
      }`}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <section>
      <p className="text-xs uppercase tracking-wide text-white/60">{title}</p>
      <pre className="mt-2 max-h-80 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/80">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

function alertColorClass(severity: "green" | "orange" | "red"): string {
  if (severity === "red") {
    return "text-rose-300";
  }
  if (severity === "orange") {
    return "text-amber-300";
  }
  return "text-emerald-300";
}

function alertContainerClass(severity: "green" | "orange" | "red"): string {
  if (severity === "red") {
    return "border-rose-500/70 bg-rose-500/10";
  }
  if (severity === "orange") {
    return "border-amber-500/60 bg-amber-500/10";
  }
  return "border-emerald-500/60 bg-emerald-500/10";
}


