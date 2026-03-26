// File: components/synthese/SyntheseView.tsx
// Role: charge les données utilisateur + analyses et affiche la page /synthèse dans la DA premium existante.
"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  LayoutDashboard,
  Lock,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  UserCircle2
} from "lucide-react";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar";
import { getActiveFolderName } from "@/lib/folders/activeFolder";
import { downloadSyntheseReport } from "@/lib/synthese/downloadSyntheseReport";
import {
  buildSyntheseYearOptions,
  filterAnalysesByYear,
  SYNTHESIS_CURRENT_YEAR_KEY
} from "@/lib/synthese/synthesePeriod";
import { buildSyntheseViewModel } from "@/lib/synthese/syntheseViewModel";
import { listUserAnalyses } from "@/services/analysisStore";
import { firebaseAuthGateway } from "@/services/auth";
import { persistPendingAnalysisForUser } from "@/services/pendingAnalysisSync";
import { getUserProfile } from "@/services/userProfileStore";
import type { AnalysisRecord } from "@/types/analysis";
import type { AuthenticatedUser } from "@/types/auth";
import { SyntheseDashboard } from "@/components/synthese/SyntheseDashboard";
import {
  consumeSearchTarget,
  routeMatchesPath,
  SEARCH_NAVIGATE_EVENT,
  scrollToSearchTarget,
  type SearchNavigationTarget
} from "@/lib/search/globalSearch";

export function SyntheseView() {
  const router = useRouter();

  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [greetingName, setGreetingName] = useState("Utilisateur");
  const [companyName, setCompanyName] = useState("Quantis");
  const [sector, setSector] = useState<string | null>(null);
  const [allAnalyses, setAllAnalyses] = useState<AnalysisRecord[]>([]);
  const [selectedYearValue, setSelectedYearValue] = useState<string>(SYNTHESIS_CURRENT_YEAR_KEY);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [pendingSearchTarget, setPendingSearchTarget] = useState<SearchNavigationTarget | null>(null);

  // Référence utilisée pour l'option "Année en cours" dans le sélecteur de synthèse.
  const currentCalendarYear = new Date().getFullYear();

  useEffect(() => {
    // La page synthèse reprend le thème sombre premium pour rester cohérente avec /analysis.
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

  useEffect(() => {
    const initialTarget = consumeSearchTarget();
    if (initialTarget) {
      setPendingSearchTarget(initialTarget);
    }

    const onSearchNavigate = (event: Event) => {
      const detail = (event as CustomEvent<SearchNavigationTarget>).detail;
      if (!detail) {
        return;
      }
      setPendingSearchTarget(detail);
    };

    window.addEventListener(SEARCH_NAVIGATE_EVENT, onSearchNavigate as EventListener);
    return () => window.removeEventListener(SEARCH_NAVIGATE_EVENT, onSearchNavigate as EventListener);
  }, []);

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
    });

    return unsubscribe;
  }, [router]);

  useEffect(() => {
    if (!user) {
      return;
    }

    void loadSyntheseData(user);
  }, [user]);

  const yearOptions = useMemo(
    () => buildSyntheseYearOptions(allAnalyses, currentCalendarYear),
    [allAnalyses, currentCalendarYear]
  );

  const analysesBySelectedYear = useMemo(
    () => filterAnalysesByYear(allAnalyses, selectedYearValue, currentCalendarYear),
    [allAnalyses, selectedYearValue, currentCalendarYear]
  );
  const selectedYearLabel = useMemo(
    () =>
      yearOptions.find((option) => option.value === selectedYearValue)?.label ??
      `Année en cours (${currentCalendarYear})`,
    [currentCalendarYear, selectedYearValue, yearOptions]
  );

  const analysisPair = useMemo(() => {
    if (!analysesBySelectedYear.length) {
      return { current: null as AnalysisRecord | null, previous: null as AnalysisRecord | null };
    }

    // On conserve la logique de priorité dossier actif déjà utilisée sur /analysis.
    return resolveCurrentAndPreviousAnalysis(analysesBySelectedYear, getActiveFolderName());
  }, [analysesBySelectedYear]);

  const synthese = useMemo(() => {
    if (!analysisPair.current) {
      return null;
    }
    return buildSyntheseViewModel(analysisPair.current.kpis, analysisPair.previous?.kpis ?? null, sector);
  }, [analysisPair, sector]);

  useEffect(() => {
    // Si l'option active n'existe plus après reload, on revient sur "Année en cours".
    const optionExists = yearOptions.some((option) => option.value === selectedYearValue);
    if (!optionExists) {
      setSelectedYearValue(SYNTHESIS_CURRENT_YEAR_KEY);
    }
  }, [yearOptions, selectedYearValue]);

  useEffect(() => {
    // UX: si "Année en cours" n'a pas de données, on bascule automatiquement
    // vers la dernière année disponible pour éviter une page vide sans contrôle visible.
    if (!allAnalyses.length) {
      return;
    }

    if (
      selectedYearValue === SYNTHESIS_CURRENT_YEAR_KEY &&
      analysesBySelectedYear.length === 0 &&
      yearOptions.length > 1
    ) {
      setSelectedYearValue(yearOptions[1]!.value);
    }
  }, [allAnalyses.length, analysesBySelectedYear.length, selectedYearValue, yearOptions]);

  useEffect(() => {
    if (!pendingSearchTarget) {
      return;
    }
    if (!routeMatchesPath("/synthese", pendingSearchTarget.route)) {
      return;
    }
    if (!pendingSearchTarget.refId) {
      setPendingSearchTarget(null);
      return;
    }
    void scrollToSearchTarget(pendingSearchTarget.refId).finally(() => {
      setPendingSearchTarget(null);
    });
  }, [pendingSearchTarget, analysisPair.current?.id]);

  async function loadSyntheseData(currentUser: AuthenticatedUser) {
    setLoading(true);
    setErrorMessage(null);

    try {
      // Si une analyse "invité" existe, on la rattache d'abord au compte connecté.
      // Cette étape garantit qu'aucune analyse n'est perdue après inscription.
      try {
        await persistPendingAnalysisForUser(currentUser.uid);
      } catch {
        // Non bloquant: on conserve la lecture des analyses existantes et
        // la donnée locale restera disponible pour une prochaine tentative.
      }

      const [history, profile] = await Promise.all([
        listUserAnalyses(currentUser.uid),
        getUserProfile(currentUser.uid)
      ]);

      setGreetingName(resolveFirstName(currentUser, profile?.firstName));
      setCompanyName(profile?.companyName?.trim() || "Quantis");
      setSector(profile?.sector ?? null);
      setAllAnalyses(history);

      if (!history.length) {
        setErrorMessage(
          "Aucune analyse disponible pour le moment. Importez un fichier pour démarrer votre analyse financière."
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Impossible de charger la synthèse pour le moment."
      );
    } finally {
      setLoading(false);
    }
  }

  async function onLogout() {
    await firebaseAuthGateway.signOut();
    router.replace("/");
  }

  return (
    <section className="space-y-4">
      <header className="precision-card flex items-center justify-between gap-3 rounded-2xl px-5 py-3">
        <div className="flex items-center gap-3">
          <QuantisLogo withText={false} size={28} />
          <div>
            <p className="text-sm font-semibold text-white">{companyName}</p>
            <p className="text-xs text-white/55">Plateforme financière</p>
          </div>
        </div>

        <div className="hidden min-w-[320px] flex-1 px-4 md:block">
          <GlobalSearchBar placeholder="Rechercher un KPI, une alerte ou une section..." />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed((previous) => !previous)}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 transition hover:bg-white/10"
            aria-label={isSidebarCollapsed ? "Ouvrir le menu latéral" : "Fermer le menu latéral"}
            title={isSidebarCollapsed ? "Ouvrir le menu latéral" : "Fermer le menu latéral"}
          >
            {isSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => router.push("/settings")}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
            aria-label="Paramètres"
            title="Paramètres"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => router.push("/pricing")}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
            aria-label="Offres"
            title="Offre Free (verrouillée)"
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
            onClick={() => void onLogout()}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
            aria-label="Se déconnecter"
            title="Se déconnecter"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>
      <div className="md:hidden">
        <GlobalSearchBar placeholder="Rechercher..." />
      </div>

      {loading ? (
        <div className="precision-card rounded-2xl px-4 py-3 text-sm text-white/70">Chargement de la synthèse...</div>
      ) : null}

      {errorMessage ? (
        <div className="precision-card rounded-2xl border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {errorMessage}
        </div>
      ) : null}

      <div className={`relative grid gap-6 ${isSidebarCollapsed ? "grid-cols-1" : "lg:grid-cols-[280px_1fr]"}`}>
        {!isSidebarCollapsed ? (
        <aside className="precision-card relative h-fit rounded-2xl p-4 lg:sticky lg:top-4">
          <nav className="space-y-1 text-sm">
            <NavRow icon={<Sparkles className="h-4 w-4" />} active>
              Synthèse
            </NavRow>
            <NavRow icon={<LayoutDashboard className="h-4 w-4" />} onClick={() => router.push("/analysis")}>
              Tableau de bord
            </NavRow>
            <NavRow icon={<FileText className="h-4 w-4" />} onClick={() => router.push("/documents")}>
              Documents
            </NavRow>
          </nav>

          {yearOptions.length > 1 ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
              <label htmlFor="sidebar-synthese-year" className="text-[11px] uppercase tracking-wide text-white/50">
                Année de synthèse
              </label>
              <select
                id="sidebar-synthese-year"
                value={selectedYearValue}
                onChange={(event) => setSelectedYearValue(event.target.value)}
                className="mt-2 w-full rounded-lg border border-white/20 bg-black/35 px-3 py-2 text-sm text-white outline-none transition focus:border-quantis-gold/70"
              >
                {yearOptions.map((option) => (
                  <option key={option.value} value={option.value} className="bg-[#10141f] text-white">
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => router.push("/account?from=analysis")}
            className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-left transition-colors hover:bg-white/10"
            aria-label="Ouvrir le compte"
          >
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
          </button>
        </aside>
        ) : null}

        <div>
          {analysisPair.current && synthese ? (
            <SyntheseDashboard
              greetingName={greetingName}
              companyName={companyName}
              analysisCreatedAt={analysisPair.current.createdAt}
              onDownloadReport={() => {
                if (!analysisPair.current) {
                  return;
                }
                void downloadSyntheseReport({
                  companyName,
                  greetingName,
                  analysisCreatedAt: analysisPair.current.createdAt,
                  selectedYearLabel,
                  synthese
                });
              }}
              onReupload={() => router.push("/upload")}
              onManualEntry={() => router.push("/upload/manual")}
              synthese={synthese}
            />
          ) : (
            <section className="precision-card rounded-2xl p-5">
              <p className="text-sm text-white/70">
                {allAnalyses.length === 0
                  ? "Déposez un fichier dans l'espace dashboard pour débloquer la synthèse."
                  : "Aucune synthèse disponible pour l'année sélectionnée."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/upload")}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                >
                  Ré-uploader un fichier
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/upload/manual")}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                >
                  Saisie manuelle
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}

// Sélectionne l'analyse courante puis la période précédente (priorité au dossier actif).
function resolveCurrentAndPreviousAnalysis(
  analyses: AnalysisRecord[],
  activeFolderName: string | null
): { current: AnalysisRecord; previous: AnalysisRecord | null } {
  const sorted = [...analyses].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const normalizedActiveFolder = normalizeFolderName(activeFolderName);

  const current =
    sorted.find((analysis) => normalizeFolderName(analysis.folderName) === normalizedActiveFolder) ?? sorted[0];

  const sameFolderHistory = sorted.filter(
    (analysis) =>
      analysis.id !== current.id &&
      normalizeFolderName(analysis.folderName) === normalizeFolderName(current.folderName)
  );

  const previous = sameFolderHistory[0] ?? sorted.find((analysis) => analysis.id !== current.id) ?? null;
  return { current, previous };
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
  return folderName?.trim() || "";
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
