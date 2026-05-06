// File: components/synthese/SyntheseView.tsx
// Role: charge les données utilisateur + analyses et affiche la page /synthèse dans la DA premium existante.
"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
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
import { CreateDashboardModal } from "@/components/dashboard/widgets/CreateDashboardModal";
import { useUserDashboards } from "@/hooks/useUserDashboards";
import { useDelayedFlag } from "@/lib/ui/useDelayedFlag";
import { getActiveFolderName } from "@/lib/folders/activeFolder";
import { useActiveFolderName } from "@/lib/folders/useActiveFolderName";
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
import { useAuthenticatedUser } from "@/components/auth/AuthGate";
import type { AnalysisRecord } from "@/types/analysis";
import type { AuthenticatedUser } from "@/types/auth";
import { SyntheseDashboard } from "@/components/synthese/SyntheseDashboard";
import { TemporalityBar } from "@/components/temporality/TemporalityBar";
import { useTemporality } from "@/lib/temporality/temporalityContext";
import { recomputeKpisForPeriod } from "@/lib/temporality/recomputeKpisForPeriod";
import { computePreviousPeriod } from "@/lib/temporality/computePreviousPeriod";
import { computeAvailableRange, shouldShowTemporalityBar } from "@/lib/temporality/availableRange";
import { useAiChat } from "@/components/ai/AiChatProvider";
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
  const { user } = useAuthenticatedUser();

  const [greetingName, setGreetingName] = useState("Utilisateur");
  const [companyName, setCompanyName] = useState("Quantis");
  const [sector, setSector] = useState<string | null>(null);
  const [allAnalyses, setAllAnalyses] = useState<AnalysisRecord[]>([]);
  const [selectedYearValue, setSelectedYearValue] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingSearchTarget, setPendingSearchTarget] = useState<SearchNavigationTarget | null>(null);
  const [createDashboardOpen, setCreateDashboardOpen] = useState(false);
  // Liste des dashboards custom de l'user — alimente le sous-menu "Tableau de
  // bord" de la sidebar (visible aussi depuis Synthèse pour navigation rapide).
  const userDashboards = useUserDashboards(user?.uid ?? null);
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
    setIsSidebarCollapsed(readSidebarCollapsedPreference());
    setIsSidebarPreferenceReady(true);
  }, []);

  useEffect(() => {
    if (!isSidebarPreferenceReady) {
      return;
    }
    writeSidebarCollapsedPreference(isSidebarCollapsed);
  }, [isSidebarCollapsed, isSidebarPreferenceReady]);

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
  // Dossier actif (sources statiques multi-exercices). Réactif → un changement
  // dans Documents propage immédiatement la nouvelle source ici.
  const activeFolderName = useActiveFolderName();

  const analysisPair = useMemo(() => {
    if (!analysesBySelectedYear.length) {
      return { current: null as AnalysisRecord | null, previous: null as AnalysisRecord | null };
    }

    // Priorité 1 : `activeAnalysisId` explicitement défini ET présent dans la
    //              sélection courante → l'analyse spécifique gagne (override
    //              utilisé pour connexion dynamique épinglée par exemple).
    //              Si l'ID est null OU absent du filtre annuel, on saute.
    // Priorité 2 : `activeFolderName` défini → la liasse de l'année courante
    //              dans ce dossier gagne sur la priorité automatique. C'est
    //              ce qui permet à un dossier statique d'écraser la connexion
    //              Pennylane (qui sinon gagnerait par sa priorité métier).
    // Priorité 3 : aucune source explicite → règle automatique
    //              (dynamique > FEC > upload, plus récent en cas d'égalité).
    let current: AnalysisRecord | null = null;
    if (activeAnalysisId) {
      current = analysesBySelectedYear.find((a) => a.id === activeAnalysisId) ?? null;
    }
    if (!current && activeFolderName) {
      current = resolveCurrentAnalysis(analysesBySelectedYear, activeFolderName);
    }
    if (!current) {
      // Pas de source explicite : on retombe sur le résolveur automatique
      // (resolveActiveAnalysis avec id null applique la priorité métier).
      current = resolveActiveAnalysis(analysesBySelectedYear, null);
    }
    if (!current) {
      return { current: null as AnalysisRecord | null, previous: null as AnalysisRecord | null };
    }

    const previous = findPreviousAnalysisByFiscalYear({
      analyses: allAnalyses,
      currentAnalysis: current,
      preferSameFolder: true
    });

    return { current, previous };
  }, [allAnalyses, analysesBySelectedYear, activeAnalysisId, activeFolderName]);

  // Pousse l'analyse courante au provider du chat IA — permet au backend
  // d'enrichir les réponses Claude avec les données réelles (kpis, mappedData)
  // sans que chaque tooltip ait à passer l'analysisId à la main.
  const { setAnalysisContext } = useAiChat();
  useEffect(() => {
    setAnalysisContext(analysisPair.current?.id ?? null);
    return () => setAnalysisContext(null);
  }, [analysisPair.current?.id, setAnalysisContext]);

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

  // KPIs de la période ANTÉRIEURE de même durée — pour calculer la
  // variation +/-X% sur chaque carte. On recalcule via la même fonction
  // que la période courante. null si :
  //   - pas d'analyse sélectionnée,
  //   - pas de dailyAccounting (source statique : pas de variation
  //     intra-exercice exploitable),
  //   - bornes invalides.
  const previousKpis = useMemo(() => {
    if (!analysisPair.current) return null;
    if (!shouldShowTemporalityBar(analysisPair.current)) return null;
    const prev = computePreviousPeriod(temporality.periodStart, temporality.periodEnd);
    if (!prev) return null;
    return recomputeKpisForPeriod(
      analysisPair.current,
      prev.periodStart,
      prev.periodEnd
    ).kpis;
  }, [analysisPair.current, temporality.periodStart, temporality.periodEnd]);

  const synthese = useMemo(() => {
    if (!analysisPair.current || !effective) return null;
    return buildSyntheseViewModel(effective.kpis, analysisPair.previous?.kpis ?? null, sector);
  }, [analysisPair, effective, sector]);

  useEffect(() => {
    if (!yearOptions.length) return;
    const optionExists = yearOptions.some((option) => option.value === selectedYearValue);
    if (!optionExists || !selectedYearValue) {
      setSelectedYearValue(yearOptions[0]!.value);
    }
  }, [yearOptions, selectedYearValue]);

  // Sync ponctuel de l'année lors d'un CHANGEMENT d'analyse active.
  //
  // L'utilisateur a cliqué "Utiliser comme source" sur une liasse — on sync
  // l'année à celle de la liasse cliquée pour qu'elle soit immédiatement
  // visible. Mais on ne re-sync PAS perpétuellement : si l'utilisateur change
  // ensuite l'année à la main pour explorer une autre liasse du même dossier,
  // on respecte ce choix (sinon le sélecteur d'année serait inutile pour les
  // sources statiques multi-exercices). On utilise un ref pour ne déclencher
  // l'effet qu'à la TRANSITION de la valeur, pas à chaque render.
  const previousActiveAnalysisIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeAnalysisId === previousActiveAnalysisIdRef.current) return;
    previousActiveAnalysisIdRef.current = activeAnalysisId;
    if (!activeAnalysisId) return;
    const target = allAnalyses.find((a) => a.id === activeAnalysisId);
    if (!target) return;
    setSelectedYearValue(String(resolveAnalysisYear(target)));
  }, [activeAnalysisId, allAnalyses]);

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
          dashboardSubmenu={{
            // Sous-onglets fixes du Tableau de bord + dashboards custom user.
            // Depuis Synthèse, cliquer redirige vers /analysis ; activeId est
            // undefined car aucun onglet n'est "actif" sur cette page.
            items: [
              { id: "creation-valeur", label: "Création de valeur", kind: "fixed" as const },
              { id: "investissement-bfr", label: "Investissement", kind: "fixed" as const },
              { id: "financement", label: "Financement", kind: "fixed" as const },
              { id: "rentabilite", label: "Rentabilité", kind: "fixed" as const },
              ...userDashboards.dashboards.map((d) => ({
                id: d.id,
                label: d.name,
                kind: "custom" as const
              }))
            ],
            activeId: undefined,
            onSelectItem: () => router.push("/analysis"),
            onCreate: user ? () => setCreateDashboardOpen(true) : undefined,
            onDelete: async (id) => {
              await userDashboards.deleteDashboard(id);
            }
          }}
        />

        {/* Modale de création de dashboard custom — accessible depuis le
            sous-menu de la sidebar. Après création on bascule directement
            sur /analysis pour que l'user voie son nouveau dashboard. */}
        <CreateDashboardModal
          open={createDashboardOpen}
          onClose={() => setCreateDashboardOpen(false)}
          onConfirm={async (name) => {
            const newId = await userDashboards.createDashboard(name);
            setCreateDashboardOpen(false);
            if (newId) router.push("/analysis");
          }}
        />

        <div className="space-y-4">
          {analysisPair.current && synthese ? (
            <SyntheseDashboard
              greetingName={greetingName}
              companyName={companyName}
              analysisCreatedAt={analysisPair.current.createdAt}
              getDownloadInput={() => ({
                companyName,
                greetingName,
                analysisCreatedAt: analysisPair.current!.createdAt,
                selectedYearLabel,
                synthese,
                kpis: analysisPair.current!.kpis,
                mappedData: analysisPair.current!.mappedData
              })}
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
              previousKpis={previousKpis}
              analyses={allAnalyses}
              currentAnalysis={analysisPair.current}
              periodLabel={
                shouldShowTemporalityBar(analysisPair.current)
                  ? null
                  : analysisPair.current.fiscalYear
                    ? `Exercice ${analysisPair.current.fiscalYear}`
                    : null
              }
              simulationSlot={
                effective ? <SimulationToggleButton mappedData={effective.mappedData} /> : null
              }
              userId={user?.uid ?? null}
              // Sélecteur dynamique (TemporalityBar complète) sous le titre
              // pour les sources Pennylane/MyUnisoft/Odoo qui ont un
              // dailyAccounting. Pour les sources statiques on passe à la
              // place yearOptions/selectedYearValue/onYearChange — la
              // SyntheseDashboard rend alors une mini-bar "Année" simple.
              temporalitySlot={
                shouldShowTemporalityBar(analysisPair.current) ? (
                  <TemporalityBar
                    availableRange={computeAvailableRange(analysisPair.current!)}
                    daysInPeriod={effective?.isFiltered ? effective.filterSummary.daysInPeriod : null}
                    rightLabel={
                      effective?.isFiltered
                        ? `${effective.filterSummary.daysInPeriod} jour(s) avec écritures sur la période`
                        : undefined
                    }
                  />
                ) : null
              }
              yearOptions={yearOptions}
              selectedYearValue={selectedYearValue}
              onYearChange={setSelectedYearValue}
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
