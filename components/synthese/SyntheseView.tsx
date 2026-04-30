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
  Receipt,
  Settings,
  Sparkles,
  UserCircle2,
  Bot
} from "lucide-react";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { useDelayedFlag } from "@/lib/ui/useDelayedFlag";
import { getActiveFolderName } from "@/lib/folders/activeFolder";
import { downloadFinancialReport } from "@/lib/reports/downloadFinancialReport";
import { exportAnalysisDataAsJson } from "@/lib/export/exportAnalysisData";
import {
  buildSyntheseYearOptions,
  filterAnalysesByYear,
  resolveAnalysisYear,
  SYNTHESIS_CURRENT_YEAR_KEY
} from "@/lib/synthese/synthesePeriod";
import { buildSyntheseViewModel } from "@/lib/synthese/syntheseViewModel";
import { listUserAnalyses } from "@/services/analysisStore";
import {
  findPreviousAnalysisByFiscalYear,
  normalizeAnalysisFolderName,
  sortAnalysesByFiscalYear
} from "@/services/analysisHistory";
import { firebaseAuthGateway } from "@/services/auth";
import { persistPendingAnalysisForUser } from "@/services/pendingAnalysisSync";
import { getUserProfile } from "@/services/userProfileStore";
import type { AnalysisRecord } from "@/types/analysis";
import type { AuthenticatedUser } from "@/types/auth";
import { SyntheseDashboard } from "@/components/synthese/SyntheseDashboard";
import { TemporalityBar } from "@/components/temporality/TemporalityBar";
import { useTemporality } from "@/lib/temporality/temporalityContext";
import { recomputeKpisForPeriod } from "@/lib/temporality/recomputeKpisForPeriod";
import { computeAvailableRange, shouldShowTemporalityBar } from "@/lib/temporality/availableRange";
import { resolveActiveAnalysis } from "@/lib/source/activeSource";
import { useActiveAnalysisId } from "@/lib/source/useActiveAnalysisId";
import { ActiveSourceBadge } from "@/components/source/ActiveSourceBadge";
import { SimulationToggleButton } from "@/components/simulation/SimulationWidget";
import {
  consumeSearchTarget,
  routeMatchesPath,
  SEARCH_NAVIGATE_EVENT,
  scrollToSearchTarget,
  type SearchNavigationTarget
} from "@/lib/search/globalSearch";
import {
  readSidebarCollapsedPreference,
  writeSidebarCollapsedPreference
} from "@/lib/ui/sidebarPreference";

export function SyntheseView() {
  const router = useRouter();

  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [greetingName, setGreetingName] = useState("Utilisateur");
  const [companyName, setCompanyName] = useState("Quantis");
  const [sector, setSector] = useState<string | null>(null);
  const [allAnalyses, setAllAnalyses] = useState<AnalysisRecord[]>([]);
  const [selectedYearValue, setSelectedYearValue] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingSearchTarget, setPendingSearchTarget] = useState<SearchNavigationTarget | null>(null);
  // Le loader visible n'apparaît que si la requête dépasse 400 ms — sinon
  // on évite un flash désagréable sur les chargements rapides.
  const showSlowLoader = useDelayedFlag(loading);
  // L'état replié de la sidebar est désormais géré par AppSidebar lui-même.

  // Référence utilisée pour l'option "Année en cours" dans le sélecteur de synthèse.
  const currentCalendarYear = new Date().getFullYear();

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

  // Source active : si l'utilisateur a explicitement choisi une analyse via
  // Documents → "Utiliser comme source active" (localStorage `quantis.activeAnalysis`),
  // on la prend en priorité absolue. Sinon fallback : connexion dynamique > FEC > upload,
  // la plus récente à priorité égale. Implémenté dans `resolveActiveAnalysis`.
  const activeAnalysisId = useActiveAnalysisId();

  const analysisPair = useMemo(() => {
    if (!analysesBySelectedYear.length) {
      return { current: null as AnalysisRecord | null, previous: null as AnalysisRecord | null };
    }

    // Priorité 1 : analyse explicitement marquée active (si dans la sélection courante).
    // Priorité 2 : règle métier source dynamique > FEC > upload (le plus récent gagne).
    // Priorité 3 (fallback historique) : dossier actif → 1ère analyse triée fiscalYear desc.
    const fromActive = resolveActiveAnalysis(analysesBySelectedYear, activeAnalysisId);
    const current =
      fromActive ?? resolveCurrentAnalysis(analysesBySelectedYear, getActiveFolderName());
    if (!current) {
      return { current: null as AnalysisRecord | null, previous: null as AnalysisRecord | null };
    }

    const previous = findPreviousAnalysisByFiscalYear({
      analyses: allAnalyses,
      currentAnalysis: current,
      preferSameFolder: true
    });

    return { current, previous };
  }, [allAnalyses, analysesBySelectedYear, activeAnalysisId]);

  // Filtre temporel global. Si l'analyse a un dailyAccounting (source dynamique Pennylane),
  // les KPI flow (CA, VA, EBITDA…) sont recalculés sur la période sélectionnée. Les KPI bilan
  // (BFR, dispo, total_cp…) restent ceux du snapshot, car ils sont à un instant T.
  const temporality = useTemporality();
  const effective = useMemo(() => {
    if (!analysisPair.current) return null;
    return recomputeKpisForPeriod(
      analysisPair.current,
      temporality.periodStart,
      temporality.periodEnd
    );
  }, [analysisPair.current, temporality.periodStart, temporality.periodEnd]);

  const synthese = useMemo(() => {
    if (!analysisPair.current || !effective) {
      return null;
    }
    return buildSyntheseViewModel(effective.kpis, analysisPair.previous?.kpis ?? null, sector);
  }, [analysisPair, effective, sector]);

  useEffect(() => {
    if (!yearOptions.length) return;
    const optionExists = yearOptions.some((option) => option.value === selectedYearValue);
    if (!optionExists || !selectedYearValue) {
      setSelectedYearValue(yearOptions[0]!.value);
    }
  }, [yearOptions, selectedYearValue]);

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
    void scrollToSearchTarget(pendingSearchTarget.refId, pendingSearchTarget.query).finally(() => {
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
    <section className="w-full space-y-4">
      <header className="precision-card flex items-center justify-between gap-3 rounded-2xl px-5 py-3">
        <div className="flex items-center gap-3">
          <QuantisLogo withText={false} size={28} />
          <div>
            <p className="text-sm font-semibold text-white">{companyName}</p>
            <p className="text-xs text-white/55">Plateforme financière</p>
          </div>
          <div className="ml-2 hidden lg:block">
            <ActiveSourceBadge analysis={analysisPair.current} />
          </div>
        </div>

        <div className="hidden min-w-[320px] flex-1 px-4 md:block">
          <GlobalSearchBar placeholder="Rechercher un KPI, une alerte ou une section..." />
        </div>

        <div className="flex items-center gap-2">
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

      {/* Loader retardé : n'apparaît que si la requête dépasse 400 ms.
          Évite le flash sous le header pour les chargements rapides. */}
      {showSlowLoader ? (
        <div className="precision-card rounded-2xl px-4 py-3 text-sm text-white/70">Chargement de la synthèse...</div>
      ) : null}

      {errorMessage ? (
        <div className="precision-card rounded-2xl border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {errorMessage}
        </div>
      ) : null}

      <div className="relative grid gap-6 grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)]">
        <AppSidebar
          activeRoute="synthese"
          accountFirstName={greetingName}
          contextSlot={
            yearOptions.length > 1 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <label htmlFor="sidebar-synthese-year" className="text-[10px] font-mono uppercase tracking-wide text-white/45">
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
            ) : null
          }
        />

        <div className="space-y-4">
          {/* Filtre temporel global. On ne l'affiche que si l'analyse active a
              du `dailyAccounting` exploitable — sinon (source statique PDF/Excel
              avec un seul exercice annuel) la barre ne sert à rien et on
              affiche juste "Exercice YYYY" en texte simple. */}
          {shouldShowTemporalityBar(analysisPair.current) ? (
            <TemporalityBar
              availableRange={computeAvailableRange(analysisPair.current!)}
              daysInPeriod={effective?.isFiltered ? effective.filterSummary.daysInPeriod : null}
              rightLabel={
                effective?.isFiltered
                  ? `${effective.filterSummary.daysInPeriod} jour(s) avec écritures sur la période`
                  : undefined
              }
            />
          ) : analysisPair.current ? (
            <div
              className="precision-card rounded-2xl px-4 py-3 text-sm text-white/70"
              data-scroll-reveal-ignore
            >
              <span className="text-xs uppercase tracking-wider text-white/45">Période · </span>
              <span className="font-semibold text-white">
                Exercice {analysisPair.current.fiscalYear ?? "(non renseigné)"}
              </span>
              <span className="ml-2 text-xs text-white/45">— source statique, vue annuelle uniquement</span>
            </div>
          ) : null}

          {/* Simulation What-If : visible uniquement quand on a un mappedData
              exploitable. SimulationToggleButton gère lui-même son propre
              état ouvert/fermé pour rester découplé du parent. */}
          {analysisPair.current && effective ? (
            <SimulationToggleButton mappedData={effective.mappedData} />
          ) : null}

          {analysisPair.current && synthese ? (
            <SyntheseDashboard
              greetingName={greetingName}
              companyName={companyName}
              analysisCreatedAt={analysisPair.current.createdAt}
              onExportData={() => {
                if (!analysisPair.current) return;
                exportAnalysisDataAsJson({ analysis: analysisPair.current, companyName });
              }}
              onReupload={() => router.push("/upload")}
              onManualEntry={() => router.push("/upload/manual")}
              onDownloadFinancialReport={async () => {
                if (!analysisPair.current) return;
                const err = await downloadFinancialReport({ analysisId: analysisPair.current.id });
                if (err) {
                  // Erreur silencieuse — log debug, le bouton n'a pas de feedback UX dédié.
                  console.warn("[financial-report] download failed", err);
                }
              }}
              synthese={synthese}
              parserVersion={analysisPair.current.parserVersion}
              sourceMetadata={analysisPair.current.sourceMetadata ?? null}
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

// Sélectionne l'analyse courante en priorisant le dossier actif.
function resolveCurrentAnalysis(
  analyses: AnalysisRecord[],
  activeFolderName: string | null
): AnalysisRecord | null {
  const sorted = sortAnalysesByFiscalYear(analyses, "desc");
  if (!sorted.length) {
    return null;
  }

  const normalizedActiveFolder = normalizeAnalysisFolderName(activeFolderName);

  return (
    sorted.find(
      (analysis) => normalizeAnalysisFolderName(analysis.folderName) === normalizedActiveFolder
    ) ?? sorted[0]
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

// (NavRow déplacé dans `components/layout/AppSidebar.tsx` — source unique
// pour la navigation latérale.)
