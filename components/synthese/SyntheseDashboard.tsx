// File: components/synthese/SyntheseDashboard.tsx
// Role: Synthèse — vue cockpit principal, désormais 100% personnalisable.
// Le seul élément fixe est le Vyzor Score (forme variera en Phase 2).
// Tous les autres blocs (chart d'évolution, KPI cards, recommandation,
// alertes, plan d'action, tiles fiscales) sont des widgets ajoutables /
// supprimables / réordonnables / redimensionnables via CustomizableDashboard.
"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Calendar } from "lucide-react";
import { useBridgeStatus } from "@/lib/banking/useBridgeStatus";
import { resolveDisponibilitesOverride } from "@/lib/banking/disponibilitesOverride";
import { CustomizableDashboard } from "@/components/dashboard/widgets/CustomizableDashboard";
import type { SyntheseViewModel } from "@/lib/synthese/syntheseViewModel";
import type { SourceMetadata } from "@/types/connectors";
import type { AnalysisRecord, CalculatedKpis } from "@/types/analysis";
import type { BankingSource } from "@/types/dataSources";
import type { DashboardLayout, WidgetInstance } from "@/types/dashboard";

type SyntheseDashboardProps = {
  greetingName: string;
  companyName: string;
  analysisCreatedAt: string;
  /** Callback déclenché à la sélection du format dans le menu déroulant. */
  onDownloadFinancialReport?: (format: "pdf" | "docx") => void;
  onExportData?: () => void;
  onReupload: () => void;
  onManualEntry: () => void;
  synthese: SyntheseViewModel;
  parserVersion?: "v1" | "v2";
  sourceMetadata?: SourceMetadata | null;
  /**
   * KPIs courants déjà filtrés sur la période sélectionnée par la
   * TemporalityBar (recomputeKpisForPeriod côté SyntheseView). C'est *cette*
   * structure qui doit alimenter les widgets — pas `currentAnalysis.kpis`
   * qui contient les KPI annuels figés au moment du sync.
   */
  currentKpis?: CalculatedKpis | null;
  /** KPIs période antérieure pour la variation +/-X% sur les KpiCard widgets. */
  previousKpis?: CalculatedKpis | null;
  /** Historique du dossier — alimente le mode annuel des charts. */
  analyses?: AnalysisRecord[];
  /** Analyse courante — son dailyAccounting alimente le mode mensuel. */
  currentAnalysis?: AnalysisRecord | null;
  /** Libellé période ("Exercice 2026") pour les sources statiques. */
  periodLabel?: string | null;
  /** Slot bouton "Simuler un scénario" — placé dans le bandeau meta haut. */
  simulationSlot?: ReactNode;
  /** ID Firebase de l'utilisateur — clé de persistance Firestore du layout. */
  userId?: string | null;
  /**
   * Sélecteur d'année rendu sous le titre pour les sources statiques (PDF /
   * Excel). Quand fourni avec ≥ 2 options, on affiche une mini barre
   * "Année" + dropdown ; sinon on n'affiche rien (cas dynamique : le parent
   * passe `temporalitySlot` à la place avec la TemporalityBar complète).
   */
  yearOptions?: { value: string; label: string }[];
  selectedYearValue?: string;
  onYearChange?: (value: string) => void;
  /**
   * Slot pour la `TemporalityBar` (mode dynamique). Rendu sous le titre, à la
   * place du sélecteur statique. Le parent décide lequel passer.
   * @deprecated brief 09/05/2026 — la TemporalityBar est désormais portée
   *  par le AppHeader (ligne 2). Cette prop reste pour compat mais n'est
   *  plus consommée par la SyntheseView.
   */
  temporalitySlot?: ReactNode;
  /**
   * Source banque active de l'utilisateur (toggle de /documents). Si
   * différent de "bridge", on N'override PAS `disponibilites` avec le solde
   * Bridge — la valeur reste celle calculée par la source comptable active
   * (post-fix MyUnisoft 12 mois). Cf. brief data-sources : "désactiver
   * Bridge désactive l'override Disponibilités".
   */
  activeBankingSource?: BankingSource | null;
  /**
   * Mode édition controlled — quand fourni, le state isEditing est piloté
   * par le parent (cf. brief Header unifié 09/05/2026, le bouton
   * "Personnaliser" est désormais dans la ligne 2 du AppHeader).
   */
  isEditingControlled?: boolean;
  onEditingChange?: (next: boolean) => void;
};

// ─── Default layout Synthèse ───────────────────────────────────────────
// Reprend exactement le contenu de l'ancien cockpit fixe :
//   - Vyzor Score
//   - Courbe d'évolution multi-séries
//   - 3 KPI cards (CA, Trésorerie, EBE)
//   - Recommandation IA, plan d'action, alertes
//   - Tiles fiscales TVA + IS
// L'utilisateur peut tout réordonner / redimensionner / supprimer — y compris
// le Vyzor Score, qu'il peut rajouter ensuite via le picker s'il le souhaite.
const DEFAULT_SYNTHESE_LAYOUT: DashboardLayout = {
  id: "synthese",
  widgets: [
    // Vyzor Score : viz composite (jauge + 4 piliers + message) — exige
    // hauteur L (560 px+ natif) et largeur M minimum.
    { id: "default-quantis-score", kpiId: "synthese:score", vizType: "quantisScore", size: "M", height: "L" },
    // Charts pleine largeur sur 2 rangées (440 px) — confortable pour
    // lire les axes + légende.
    { id: "default-evolution", kpiId: "synthese:evolution", vizType: "evolutionChart", size: "L", height: "M" },
    // 3 KPI cards en ligne (col-4 chacun, 1 rangée).
    { id: "default-ca", kpiId: "ca", vizType: "kpiCard", size: "S", height: "S" },
    { id: "default-tresorerie", kpiId: "disponibilites", vizType: "kpiCard", size: "S", height: "S" },
    { id: "default-ebe", kpiId: "ebe", vizType: "kpiCard", size: "S", height: "S" },
    // Bandeau IA pleine largeur, hauteur compacte.
    { id: "default-reco", kpiId: "synthese:recommendation", vizType: "aiInsight", size: "L", height: "S" },
    // Listes actions + alertes côte à côte (col-6 chacun, 2 rangées).
    { id: "default-actions", kpiId: "synthese:actions", vizType: "actionList", size: "M", height: "M" },
    { id: "default-alerts", kpiId: "synthese:alerts", vizType: "alertList", size: "M", height: "M" },
    // Tiles fiscales (TVA + IS) en S × S.
    { id: "default-tva", kpiId: "tva_a_payer", vizType: "kpiCard", size: "S", height: "S" },
    { id: "default-is", kpiId: "provision_is", vizType: "kpiCard", size: "S", height: "S" }
  ] as WidgetInstance[]
};

export function SyntheseDashboard({
  greetingName,
  companyName,
  analysisCreatedAt,
  onDownloadFinancialReport,
  onExportData,
  synthese,
  parserVersion,
  sourceMetadata,
  currentKpis,
  previousKpis,
  analyses = [],
  currentAnalysis = null,
  periodLabel = null,
  simulationSlot = null,
  userId = null,
  yearOptions,
  selectedYearValue,
  onYearChange,
  temporalitySlot = null,
  activeBankingSource = null,
  isEditingControlled,
  onEditingChange,
}: SyntheseDashboardProps) {
  void temporalitySlot; // @deprecated brief 09/05/2026 — non rendu
  // Bridge connecté → on substitue le solde "Disponibilités" par le solde
  // bancaire temps réel UNIQUEMENT si l'utilisateur a activé Bridge via le
  // toggle de /documents (`activeBankingSource === "bridge"`).
  //
  // Sinon : on ignore Bridge même si la connexion est techniquement active —
  // c'est l'engagement du brief data-sources ("désactiver Bridge désactive
  // l'override Disponibilités"). Conséquence : la valeur affichée reste
  // celle calculée par la source comptable active (MyUnisoft / Pennylane /
  // FEC), respecte la TemporalityBar et reste cohérente avec /etats-financiers.
  const bridgeStatus = useBridgeStatus();
  const rawBalance =
    bridgeStatus.status?.connected && typeof bridgeStatus.status.totalBalance === "number"
      ? bridgeStatus.status.totalBalance
      : null;
  const liveBalance = resolveDisponibilitesOverride({
    activeBankingSource,
    liveBalance: rawBalance,
  });

  // Surcharge des disponibilités quand Bridge est actif (toggle ON + connexion
  // OK) — utilisé par les widgets KpiCard qui affichent "disponibilites".
  //
  // On s'appuie sur `currentKpis` (KPI déjà filtrés sur la période sélectionnée
  // par la TemporalityBar côté SyntheseView). Avant le fix temporality du
  // 06/05/2026, on lisait `currentAnalysis.kpis` qui contient les KPI ANNUELS
  // figés — changer le mois n'avait aucun effet sur les valeurs.
  const effectiveKpis = useMemo<CalculatedKpis>(() => {
    const baseKpis = currentKpis ?? currentAnalysis?.kpis ?? ({} as CalculatedKpis);
    if (liveBalance === null) {
      return baseKpis;
    }
    return {
      ...baseKpis,
      disponibilites: liveBalance
    };
  }, [currentKpis, currentAnalysis, liveBalance]);

  // Mode édition — controlled si le parent fournit `isEditingControlled`
  // (cf. brief 09/05/2026 — bouton Personnaliser dans la ligne 2 du
  // AppHeader). Fallback uncontrolled pour les call sites qui ne lèvent
  // pas encore le state.
  const [internalIsEditing, setInternalIsEditing] = useState(false);
  const isEditing = isEditingControlled ?? internalIsEditing;
  const setIsEditing = (next: boolean | ((v: boolean) => boolean)) => {
    const nextValue = typeof next === "function" ? next(isEditing) : next;
    if (onEditingChange) onEditingChange(nextValue);
    else setInternalIsEditing(nextValue);
  };
  // Phase 3 brief 09/05/2026 — le menu d'export multi-format (PDF/Word)
  // a été retiré : le bouton "Exporter la synthèse" déclenche désormais
  // le download direct depuis SyntheseView (un seul format = PDF).
  const analysisModeLabel = resolveAnalysisModeLabel(currentAnalysis);

  // Sélecteur d'année statique (sources PDF/Excel) — rendu UNIQUEMENT si le
  // parent ne fournit pas déjà un `temporalitySlot` (mode dynamique). Un
  // sélecteur statique n'a de sens qu'à partir de 2 années comparables.
  const showStaticYearBar =
    !temporalitySlot &&
    yearOptions !== undefined &&
    yearOptions.length > 1 &&
    selectedYearValue !== undefined &&
    onYearChange !== undefined;

  // Phase 3 brief 09/05/2026 — analysisModeLabel n'est plus consommé par
  // le bandeau "ANALYSE DYNAMIQUE" (supprimé). On garde le calcul pour
  // compat éventuelle (ex. tests existants).
  void analysisModeLabel;

  return (
    <section className="space-y-4">
      {/* Bandeau titre Synthèse — refonte 09/05/2026 :
          - Titre + sous-titre "Bonjour …" conservés.
          - Badge "ANALYSE DYNAMIQUE" supprimé (bruit visuel inutile).
          - DashboardActions (Personnaliser) déplacé dans la ligne 2 du
            AppHeader (cf. brief Header unifié). */}
      <header className="fade-up relative z-10 flex flex-col items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">Synthèse</h1>
          <p className="text-sm text-quantis-muted">
            Bonjour {greetingName}, voici la vue d&apos;ensemble de vos indicateurs clés.
          </p>
        </div>
      </header>

      {/* Sélecteur de période — soit la TemporalityBar complète (sources
          dynamiques : Pennylane/MyUnisoft/Odoo), soit une mini-bar "Année"
          (sources statiques PDF/Excel). Placée juste sous le titre — le
          sélecteur jadis présent dans la sidebar a été retiré (doublon). */}
      {temporalitySlot ? temporalitySlot : null}
      {showStaticYearBar ? (
        <div className="precision-card flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3" data-scroll-reveal-ignore>
          <div className="flex items-center gap-2 text-white/60">
            <Calendar className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">Période</span>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
            <button
              type="button"
              className="rounded-md bg-quantis-gold px-3 py-1 text-xs font-medium text-black"
              aria-pressed
            >
              Année
            </button>
          </div>
          <select
            id="synthese-year-static"
            value={selectedYearValue}
            onChange={(event) => onYearChange?.(event.target.value)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white outline-none transition hover:bg-white/10 focus:border-quantis-gold/70"
          >
            {yearOptions!.map((option) => (
              <option key={option.value} value={option.value} className="bg-[#10141f] text-white">
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Bandeau meta supprimé — brief 09/05/2026.
          L'info entreprise/source est désormais portée par AppHeader
          ligne 1 (companyName + contextBadge). Les boutons Simuler /
          Exporter la synthèse / Personnaliser vivent dans la ligne 2
          du AppHeader (headerActions de SyntheseView). */}

      {/* Container Portal pour le simulateur — quand l'utilisateur clique
          "Simuler un scénario" dans le header, le widget se rend ici via
          createPortal pour prendre toute la largeur (vs slot étroit du
          header). Vide quand le simulateur est fermé (aucun render =
          aucun espace réservé visible). */}
      <div id="simulation-portal-container" />

      {/* Grille widgets pleine largeur : aucun élément n'est pinned hors-grille,
          le Vyzor Score est lui-même un widget marqué `isFixed:true` dans le
          default layout (non supprimable, repositionnable). L'utilisateur peut
          mettre des widgets au-dessus, à côté ou en-dessous du score. */}
      <CustomizableDashboard
        userId={userId}
        layoutId="synthese"
        defaultLayout={DEFAULT_SYNTHESE_LAYOUT}
        kpis={effectiveKpis}
        previousKpis={previousKpis}
        analyses={analyses}
        currentAnalysis={currentAnalysis}
        mappedData={currentAnalysis?.mappedData ?? null}
        synthese={synthese}
        controlledIsEditing={isEditing}
        onEditingChange={setIsEditing}
        hideHeaderTitle
      />

    </section>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

// Construit un CalculatedKpis "complet" à partir du SyntheseViewModel + de
// l'analyse courante. Les widgets KpiCard ont besoin de l'objet complet
// (pour pouvoir rendre n'importe quel KPI ajouté par l'utilisateur), pas
// seulement les 3 du cockpit. On utilise donc `currentAnalysis.kpis` comme
// source de vérité, en surchargeant `disponibilites` plus tard si Bridge
// est connecté (cf. effectiveKpis).
// Choisit le badge à afficher en tête de page selon la nature de l'analyse :
// "Analyse dynamique" si un dailyAccounting exploitable est présent (sources
// synchronisées Pennylane / MyUnisoft / Odoo / FEC), "Analyse statique" pour
// les uploads PDF / Excel.
function resolveAnalysisModeLabel(analysis: AnalysisRecord | null | undefined): string {
  const hasDaily = (analysis?.dailyAccounting?.length ?? 0) > 0;
  return hasDaily ? "Analyse dynamique" : "Analyse statique";
}
