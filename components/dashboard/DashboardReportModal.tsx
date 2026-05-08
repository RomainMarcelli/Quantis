// File: components/dashboard/DashboardReportModal.tsx
// Role: modale de sélection des tableaux de bord à inclure dans le rapport
// PDF mode "dashboard". Une fois la sélection validée, déclenche le
// download via downloadDashboardReport().
//
// L'utilisateur voit :
//   - Liste des onglets fixes (Création de valeur / Investissement /
//     Financement / Rentabilité) avec checkboxes
//   - Liste des dashboards custom (s'il en a créé)
//   - "Tout cocher" / "Tout décocher"
//   - Bouton "Générer le rapport"
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, FileText, Loader2, X } from "lucide-react";

import { downloadDashboardReport } from "@/lib/reports/downloadDashboardReport";
import { downloadFinancialReport } from "@/lib/reports/downloadFinancialReport";
import type { CalculatedKpis } from "@/types/analysis";

export type DashboardOption = {
  /** layoutId — `creation-valeur`, `investissement-bfr`, `custom:<uuid>`, ... */
  id: string;
  label: string;
  description?: string;
};

type ReportType = "synthese" | "dashboard";
type ReportFormat = "pdf" | "docx";

type DashboardReportModalProps = {
  open: boolean;
  onClose: () => void;
  analysisId: string;
  /** Tableaux disponibles pour le mode dashboard. */
  options: DashboardOption[];
  /** Pré-sélection initiale (par défaut : tous cochés). */
  initialSelection?: string[];
  /** Type de rapport pré-sélectionné. */
  defaultType?: ReportType;
  /**
   * Si défini, force le type de rapport et masque le sélecteur — utile
   * pour la page Tableau de bord qui ne propose QUE le mode dashboard
   * (l'export synthèse étant disponible depuis l'onglet Synthèse).
   */
  lockType?: ReportType;
  /**
   * KPIs effectifs côté client (avec overrides Bridge / temporality slider).
   * Transmis au serveur pour garantir la parité écran ↔ rapport. Utile en
   * mode synthèse uniquement — ignoré en mode dashboard.
   */
  effectiveKpis?: CalculatedKpis | null;
};

export function DashboardReportModal({
  open,
  onClose,
  analysisId,
  options,
  initialSelection,
  defaultType = "synthese",
  lockType,
  effectiveKpis,
}: DashboardReportModalProps) {
  const [reportType, setReportType] = useState<ReportType>(lockType ?? defaultType);
  const [reportFormat, setReportFormat] = useState<ReportFormat>("pdf");
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [formatMenuPos, setFormatMenuPos] = useState<{ top: number; right: number } | null>(null);
  const formatButtonRef = useRef<HTMLButtonElement | null>(null);
  const formatMenuRef = useRef<HTMLDivElement | null>(null);

  function toggleFormatMenu() {
    if (formatMenuOpen) {
      setFormatMenuOpen(false);
      return;
    }
    const rect = formatButtonRef.current?.getBoundingClientRect();
    if (rect) {
      // Place le menu AU-DESSUS du bouton (le footer en bas pourrait le couper).
      setFormatMenuPos({
        top: rect.top - 6 - 70, // 70px ~ hauteur du menu (2 items)
        right: window.innerWidth - rect.right,
      });
    }
    setFormatMenuOpen(true);
  }
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (initialSelection) return new Set(initialSelection);
    return new Set(options.map((o) => o.id));
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReportType(lockType ?? defaultType);
      setReportFormat("pdf");
      setFormatMenuOpen(false);
      setSelected(new Set(initialSelection ?? options.map((o) => o.id)));
      setErrorMsg(null);
    }
  }, [open, initialSelection, options, defaultType, lockType]);

  // Click hors du menu OU du bouton format → fermeture. Le menu est dans
  // un Portal séparé, donc on teste les deux refs.
  useEffect(() => {
    if (!formatMenuOpen) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      const inButton = formatButtonRef.current?.contains(target);
      const inMenu = formatMenuRef.current?.contains(target);
      if (!inButton && !inMenu) setFormatMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [formatMenuOpen]);

  const allSelected = useMemo(
    () => options.length > 0 && options.every((o) => selected.has(o.id)),
    [options, selected],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(options.map((o) => o.id)));
  }

  async function handleSubmit() {
    setIsLoading(true);
    setErrorMsg(null);
    if (reportType === "synthese") {
      const err = await downloadFinancialReport({
        analysisId,
        format: reportFormat,
        effectiveKpis: effectiveKpis ?? null,
      });
      setIsLoading(false);
      if (err) {
        const msg =
          err.kind === "http" ? err.message :
          err.kind === "network" ? "Erreur réseau. Réessaie." :
          "Session expirée. Reconnecte-toi.";
        setErrorMsg(msg);
        return;
      }
      onClose();
      return;
    }
    // mode dashboard
    if (selected.size === 0) {
      setIsLoading(false);
      setErrorMsg("Sélectionne au moins un tableau de bord.");
      return;
    }
    const dashboardIds = options.filter((o) => selected.has(o.id)).map((o) => o.id);
    const err = await downloadDashboardReport({
      analysisId,
      dashboardIds,
      format: reportFormat,
      effectiveKpis: effectiveKpis ?? null,
    });
    setIsLoading(false);
    if (err) {
      const msg =
        err.kind === "http" ? err.message :
        err.kind === "network" ? "Erreur réseau. Réessaie." :
        "Session expirée. Reconnecte-toi.";
      setErrorMsg(msg);
      return;
    }
    onClose();
  }

  if (!open) return null;
  if (typeof document === "undefined") return null; // SSR guard
  const submitLabel = reportType === "synthese"
    ? "Générer la synthèse"
    : `Générer (${selected.size})`;

  // Portail vers document.body — sinon un ancêtre `transform` (precision-card,
  // motion.div, etc.) casse `position: fixed` et la modale apparaît décentrée
  // (souvent trop bas).
  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sélectionner les tableaux à inclure"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="precision-card relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — titre et sous-titre adaptés au mode (verrouillé ou non). */}
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
              Exporter en PDF
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              {lockType === "dashboard"
                ? "Choisis les tableaux à inclure"
                : lockType === "synthese"
                ? "Exporter la synthèse"
                : "Choisis le format du rapport"}
            </h2>
            <p className="mt-1 text-xs text-white/55">
              {lockType === "dashboard"
                ? "Une section par tableau coché, avec ses widgets actuels."
                : lockType === "synthese"
                ? "Synthèse complète en 8 pages."
                : "Synthèse complète (8 pages) ou sélection de tableaux de bord à inclure."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-white/65 hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Sélecteur de type — masqué quand `lockType` impose un mode. */}
        {!lockType ? (
        <div className="border-b border-white/10 px-5 py-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setReportType("synthese")}
              aria-pressed={reportType === "synthese"}
              className={`rounded-lg border px-3 py-2.5 text-left transition ${
                reportType === "synthese"
                  ? "border-quantis-gold/40 bg-quantis-gold/10"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              <p className={`text-sm font-medium ${reportType === "synthese" ? "text-quantis-gold" : "text-white"}`}>
                Synthèse complète
              </p>
              <p className="mt-0.5 text-[11px] text-white/55">
                8 pages : score, bilan, CdR, ratios.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setReportType("dashboard")}
              aria-pressed={reportType === "dashboard"}
              className={`rounded-lg border px-3 py-2.5 text-left transition ${
                reportType === "dashboard"
                  ? "border-quantis-gold/40 bg-quantis-gold/10"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              <p className={`text-sm font-medium ${reportType === "dashboard" ? "text-quantis-gold" : "text-white"}`}>
                Tableaux de bord
              </p>
              <p className="mt-0.5 text-[11px] text-white/55">
                Choisis les tableaux à inclure.
              </p>
            </button>
          </div>
        </div>
        ) : null}

        {/* Toggle all — visible uniquement en mode dashboard */}
        {reportType === "dashboard" ? (
          <div className="border-b border-white/10 px-5 py-2">
            <button
              type="button"
              onClick={toggleAll}
              className="text-[11px] font-medium uppercase tracking-wide text-white/60 hover:text-white"
            >
              {allSelected ? "Tout décocher" : "Tout cocher"}
            </button>
          </div>
        ) : null}

        {/* List — uniquement la sélection des tableaux en mode dashboard.
            Le mode synthèse n'a pas de liste (rien à choisir). */}
        <div className={reportType === "synthese" ? "" : "flex-1 overflow-y-auto px-3 py-2"}>
          {reportType === "synthese" ? null : options.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-white/45">
              Aucun tableau de bord disponible. Crée-en un dans le menu.
            </p>
          ) : (
            <ul className="space-y-1">
              {options.map((opt) => {
                const isOn = selected.has(opt.id);
                return (
                  <li key={opt.id}>
                    <button
                      type="button"
                      onClick={() => toggle(opt.id)}
                      aria-pressed={isOn}
                      className={`flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition ${
                        isOn ? "bg-quantis-gold/10 ring-1 ring-quantis-gold/30" : "hover:bg-white/[0.04]"
                      }`}
                    >
                      <span
                        className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          isOn
                            ? "border-quantis-gold bg-quantis-gold/80 text-quantis-base"
                            : "border-white/25"
                        }`}
                      >
                        {isOn ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                      </span>
                      <span className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">{opt.label}</p>
                        {opt.description ? (
                          <p className="mt-0.5 text-[11px] text-white/55">{opt.description}</p>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Sélecteur de format — dropdown compact "Format : PDF ▼".
            Le menu est portalisé en bas pour ne pas être recouvert par le
            footer (z-index conflict) — sinon le clic sur "Word" tombait
            sur le bouton "Générer" derrière. */}
        <div className="border-t border-white/10 px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
              Format
            </span>
            <button
              ref={formatButtonRef}
              type="button"
              onClick={toggleFormatMenu}
              aria-haspopup="listbox"
              aria-expanded={formatMenuOpen}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white hover:border-white/20"
            >
              {reportFormat === "pdf" ? "PDF" : "Word"}
              <ChevronDown className="h-3 w-3 text-white/55" />
            </button>
          </div>
        </div>

        {/* Error */}
        {errorMsg ? (
          <p className="border-t border-rose-500/20 bg-rose-500/5 px-5 py-2 text-xs text-rose-300">
            {errorMsg}
          </p>
        ) : null}

        {/* Footer */}
        <footer className="flex gap-2 border-t border-white/10 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/65 hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || (reportType === "dashboard" && selected.size === 0)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-quantis-gold/40 bg-quantis-gold/15 px-3 py-2 text-sm font-medium text-quantis-gold hover:bg-quantis-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            {isLoading ? "Génération…" : submitLabel}
          </button>
        </footer>
      </div>
    </div>
  );

  // Menu format — portalisé séparément pour qu'il rende AU-DESSUS du
  // footer de la modale (le footer a son propre contexte de stacking).
  const formatMenu = formatMenuOpen && formatMenuPos ? (
    <div
      ref={formatMenuRef}
      role="listbox"
      style={{
        position: "fixed",
        top: formatMenuPos.top,
        right: formatMenuPos.right,
        zIndex: 200,
      }}
      className="w-32 overflow-hidden rounded-md border border-white/10 bg-quantis-base/95 shadow-2xl backdrop-blur"
    >
      {(["pdf", "docx"] as const).map((f) => (
        <button
          key={f}
          type="button"
          role="option"
          aria-selected={reportFormat === f}
          onClick={() => {
            setReportFormat(f);
            setFormatMenuOpen(false);
          }}
          className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition ${
            reportFormat === f
              ? "bg-quantis-gold/10 text-quantis-gold"
              : "text-white/80 hover:bg-white/[0.04]"
          }`}
        >
          {f === "pdf" ? "PDF" : "Word"}
          {reportFormat === f ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
        </button>
      ))}
    </div>
  ) : null;

  return createPortal(
    <>
      {modal}
      {formatMenu}
    </>,
    document.body,
  );
}
