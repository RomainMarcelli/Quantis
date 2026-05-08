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
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { CreateDashboardModal } from "@/components/dashboard/widgets/CreateDashboardModal";
import { useUserDashboards } from "@/hooks/useUserDashboards";
import { useDelayedFlag } from "@/lib/ui/useDelayedFlag";
import { useActiveDataSource } from "@/hooks/useActiveDataSource";
import { resolveCurrentAnalysisForSource } from "@/lib/source/resolveSourceAnalyses";
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
import { computePreviousPeriod } from "@/lib/temporality/computePreviousPeriod";
import { computeAvailableRange, shouldShowTemporalityBar } from "@/lib/temporality/availableRange";
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
  const [companyName, setCompanyName] = useState("Vyzor");
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

  // Source active : lue depuis Firestore via le hook unifié.
  // Si l'utilisateur n'a rien sélectionné (toggle binaire vert/rouge dans
  // /documents), `activeAccountingSource` est null → on n'affiche pas de
  // dashboard, on guide l'utilisateur à choisir.
  const { activeAccountingSource, activeFecFolderName, activeBankingSource } = useActiveDataSource({
    analyses: allAnalyses,
  });

  const analysisPair = useMemo(() => {
    if (!analysesBySelectedYear.length || !activeAccountingSource) {
      return { current: null as AnalysisRecord | null, previous: null as AnalysisRecord | null };
    }

    // Filtre par source comptable active (helper pur, testé unitairement).
    const current = resolveCurrentAnalysisForSource(
      analysesBySelectedYear,
      activeAccountingSource,
      activeFecFolderName
    );

    if (!current) {
      return { current: null as AnalysisRecord | null, previous: null as AnalysisRecord | null };
    }

    const previous = findPreviousAnalysisByFiscalYear({
      analyses: allAnalyses,
      currentAnalysis: current,
      preferSameFolder: true
    });

    return { current, previous };
  }, [allAnalyses, analysesBySelectedYear, activeAccountingSource, activeFecFolderName]);

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

  // Sync ponctuel du year selector lors d'un CHANGEMENT de source active.
  //
  // Quand l'utilisateur bascule via le toggle binaire vert/rouge dans
  // /documents (ex. Pennylane → FEC), on aligne le year selector sur le
  // dernier exercice disponible dans la nouvelle source. Sinon le sélecteur
  // resterait sur une année inexistante dans la nouvelle source.
  // Ref pour ne déclencher qu'à la TRANSITION de la valeur, pas à chaque render.
  const previousAccountingSourceRef = useRef<typeof activeAccountingSource>(null);
  const previousFecFolderRef = useRef<string | null>(null);
  useEffect(() => {
    const transitioned =
      activeAccountingSource !== previousAccountingSourceRef.current ||
      activeFecFolderName !== previousFecFolderRef.current;
    previousAccountingSourceRef.current = activeAccountingSource;
    previousFecFolderRef.current = activeFecFolderName;
    if (!transitioned || !activeAccountingSource) return;
    const matching = allAnalyses.filter((a) => {
      const provider = a.sourceMetadata?.provider ?? null;
      if (activeAccountingSource === "fec") {
        if (provider !== "fec" && provider !== "upload") return false;
        if (activeFecFolderName) {
          return (
            (a.folderName ?? "").trim().toLowerCase() ===
            activeFecFolderName.toLowerCase()
          );
        }
        return true;
      }
      return provider === activeAccountingSource;
    });
    if (!matching.length) return;
    const latest = sortAnalysesByFiscalYear(matching, "desc")[0];
    if (!latest) return;
    setSelectedYearValue(String(resolveAnalysisYear(latest)));
  }, [activeAccountingSource, activeFecFolderName, allAnalyses]);

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
      setCompanyName(profile?.companyName?.trim() || "Vyzor");
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
      <AppHeader
        companyName={companyName}
        contextBadge={<ActiveSourceBadge analysis={analysisPair.current} />}
      />

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
              onExportData={() => {
                if (!analysisPair.current) return;
                exportAnalysisDataAsJson({ analysis: analysisPair.current, companyName });
              }}
              onReupload={() => router.push("/upload")}
              onManualEntry={() => router.push("/upload/manual")}
              onDownloadFinancialReport={async (format) => {
                // Le format est choisi via le menu déroulant du bouton (PDF
                // ou Word). On pousse les KPIs effectifs pour garantir la
                // parité écran ↔ rapport.
                if (!analysisPair.current) return;
                const err = await downloadFinancialReport({
                  analysisId: analysisPair.current.id,
                  effectiveKpis: effective?.kpis ?? null,
                  format,
                });
                if (err) console.warn("[financial-report] download failed", err);
              }}
              synthese={synthese}
              parserVersion={analysisPair.current.parserVersion}
              sourceMetadata={analysisPair.current.sourceMetadata ?? null}
              currentKpis={effective?.kpis ?? null}
              previousKpis={previousKpis}
              analyses={allAnalyses}
              currentAnalysis={analysisPair.current}
              activeBankingSource={activeBankingSource}
              periodLabel={
                shouldShowTemporalityBar(analysisPair.current)
                  ? null
                  : analysisPair.current.fiscalYear
                    ? `Exercice ${analysisPair.current.fiscalYear}`
                    : null
              }
              simulationSlot={
                effective ? (
                  <SimulationToggleButton
                    mappedData={effective.mappedData}
                    portalContainerId="simulation-portal-container"
                  />
                ) : null
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
