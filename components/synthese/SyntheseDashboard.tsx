// File: components/synthese/SyntheseDashboard.tsx
// Role: Synthèse — vue cockpit principal, désormais 100% personnalisable.
// Le seul élément fixe est le Vyzor Score (forme variera en Phase 2).
// Tous les autres blocs (chart d'évolution, KPI cards, recommandation,
// alertes, plan d'action, tiles fiscales) sont des widgets ajoutables /
// supprimables / réordonnables / redimensionnables via CustomizableDashboard.
"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Calendar, CalendarRange, ChevronDown, Download, Radio } from "lucide-react";
import { SourceBadge } from "@/components/analysis/SourceBadge";
import { useBridgeStatus } from "@/lib/banking/useBridgeStatus";
import { resolveDisponibilitesOverride } from "@/lib/banking/disponibilitesOverride";
import {
  CustomizableDashboard,
  DashboardActions
} from "@/components/dashboard/widgets/CustomizableDashboard";
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
}: SyntheseDashboardProps) {
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

  // Mode édition — état lifté pour pouvoir mettre Personnaliser dans le
  // bandeau title haut (au lieu de near "Mes widgets" comme avant).
  const [isEditing, setIsEditing] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportMenuPos, setExportMenuPos] = useState<{ top: number; right: number } | null>(null);
  const exportButtonRef = useRef<HTMLButtonElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  // Click hors du menu OU de son bouton → fermeture. Le menu est portalisé
  // (rendu dans document.body), il faut donc tester les deux refs.
  useEffect(() => {
    if (!exportMenuOpen) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      const inButton = exportButtonRef.current?.contains(target);
      const inMenu = exportMenuRef.current?.contains(target);
      if (!inButton && !inMenu) setExportMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [exportMenuOpen]);

  function toggleExportMenu() {
    if (exportMenuOpen) {
      setExportMenuOpen(false);
      return;
    }
    // Position le menu juste sous le bouton, ancré à droite (alignement).
    const rect = exportButtonRef.current?.getBoundingClientRect();
    if (rect) {
      setExportMenuPos({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
    setExportMenuOpen(true);
  }
  // L'ouverture du picker reste interne à CustomizableDashboard, mais on
  // tracke aussi le `isSaving` via un nudge state. Pour V1 : pas de feedback
  // visuel custom dans le header — l'animation interne au CustomizableDashboard
  // suffit.
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

  return (
    <section className="space-y-4">
      {/* Bandeau titre Synthèse — remonté en haut (avant le meta) pour donner
          immédiatement le contexte de la page. Le toggle Personnaliser est
          ici uniquement (pas de bouton "+ Ajouter un widget" pour éviter le
          doublon avec celui rendu par CustomizableDashboard quand isEditing). */}
      <header className="fade-up relative z-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">Synthèse</h1>
          <p className="text-sm text-quantis-muted">
            Bonjour {greetingName}, voici la vue d&apos;ensemble de vos indicateurs clés.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="interactive-badge flex items-center gap-2 rounded border border-white/10 bg-white/[0.02] px-3 py-1">
            <div
              className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10B981]"
              data-live-pulse
            />
            <span className="text-[10px] font-medium uppercase tracking-widest text-white/80">
              {analysisModeLabel}
            </span>
          </div>

          <DashboardActions
            isEditing={isEditing}
            isSaving={false}
            onToggleEditing={() => setIsEditing(!isEditing)}
            onOpenPicker={() => {
              // No-op : "+ Ajouter un widget" est rendu par CustomizableDashboard
              // (showAddButton=false ici pour éviter le doublon).
            }}
            showAddButton={false}
          />
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

      {/* Bandeau meta consolidé (entreprise / date / source / actions) —
          repositionné après le titre+période pour libérer le haut de page. */}
      <header className="precision-card fade-up relative z-10 flex flex-col gap-3 rounded-2xl px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-quantis-muted">{companyName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/70">
            <span>Analyse du {new Date(analysisCreatedAt).toLocaleString("fr-FR")}</span>
            <SourceBadge sourceMetadata={sourceMetadata} analysisCreatedAt={analysisCreatedAt} />
            {periodLabel ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-white/75">
                <CalendarRange className="h-3 w-3 text-white/55" />
                {periodLabel}
              </span>
            ) : null}
            {parserVersion === "v2" && (
              <span className="inline-block rounded-full bg-emerald-900/40 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                Parser V2
              </span>
            )}
            {liveBalance !== null && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-900/40 px-2 py-0.5 text-[11px] font-medium text-emerald-300"
                title="Soldes bancaires temps réel via Bridge"
              >
                <Radio className="h-3 w-3 animate-pulse" />
                Live
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {simulationSlot}
          {onDownloadFinancialReport ? (
            <button
              ref={exportButtonRef}
              type="button"
              onClick={toggleExportMenu}
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              className="inline-flex items-center gap-1.5 rounded-lg border border-quantis-gold/30 bg-quantis-gold/10 px-3 py-1.5 text-xs font-medium text-quantis-gold hover:bg-quantis-gold/20"
            >
              <Download className="h-3.5 w-3.5" />
              Exporter la synthèse
              <ChevronDown className="h-3 w-3" />
            </button>
          ) : null}
          {onExportData ? (
            <button
              type="button"
              onClick={onExportData}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/50 hover:bg-white/5 hover:text-white/70"
            >
              Exporter données
            </button>
          ) : null}
        </div>
      </header>

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

      {/* Menu format export — portalisé dans document.body pour ne pas être
          clippé par l'overflow du parent precision-card. Position calculée
          en `fixed` à partir du rect du bouton. */}
      {exportMenuOpen && exportMenuPos && onDownloadFinancialReport && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={exportMenuRef}
              role="menu"
              style={{
                position: "fixed",
                top: exportMenuPos.top,
                right: exportMenuPos.right,
                zIndex: 60,
              }}
              className="w-32 overflow-hidden rounded-md border border-white/10 bg-quantis-base/95 shadow-xl backdrop-blur"
            >
              {(["pdf", "docx"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setExportMenuOpen(false);
                    onDownloadFinancialReport(f);
                  }}
                  className="block w-full px-3 py-2 text-left text-xs text-white/85 hover:bg-white/[0.04]"
                >
                  {f === "pdf" ? "PDF" : "Word"}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
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
