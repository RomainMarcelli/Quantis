// File: components/dashboard/widgets/KpiTargetEditor.tsx
// Role: modale de configuration des cibles utilisateur sur un KPI —
// alertes (seuil + sens) et objectifs (cible + sens d'optimisation).
// Ouverte depuis l'action menu d'un widget en mode édition.

"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Plus, Target, Trash2, X } from "lucide-react";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import type {
  KpiAlert, KpiAlertCondition, KpiObjective, KpiObjectiveDirection,
} from "@/types/kpiTargets";

type Tab = "alerts" | "objectives";

type Props = {
  open: boolean;
  onClose: () => void;
  kpiId: string;
  alerts: KpiAlert[];
  objectives: KpiObjective[];
  /** Valeur courante du KPI — figée comme baseline de l'objectif à sa
   *  création (point de départ de la barre de progression). */
  currentValue?: number | null;
  onSaveAlert: (a: Omit<KpiAlert, "id"> & { id?: string }) => Promise<KpiAlert>;
  onSaveObjective: (o: Omit<KpiObjective, "id"> & { id?: string }) => Promise<KpiObjective>;
  onRemoveAlert: (id: string) => Promise<void>;
  onRemoveObjective: (id: string) => Promise<void>;
};

export function KpiTargetEditor({
  open, onClose, kpiId,
  alerts, objectives, currentValue,
  onSaveAlert, onSaveObjective, onRemoveAlert, onRemoveObjective,
}: Props) {
  const [tab, setTab] = useState<Tab>("alerts");
  const [draftAlert, setDraftAlert] = useState<{ threshold: string; condition: KpiAlertCondition; label: string }>({
    threshold: "", condition: "below", label: "",
  });
  const [draftObjective, setDraftObjective] = useState<{ target: string; direction: KpiObjectiveDirection; label: string; deadline: string }>({
    target: "", direction: "max", label: "", deadline: "",
  });

  useEffect(() => {
    if (open) {
      setTab("alerts");
      setDraftAlert({ threshold: "", condition: "below", label: "" });
      setDraftObjective({ target: "", direction: "max", label: "", deadline: "" });
    }
  }, [open]);

  const def = useMemo(() => getKpiDefinition(kpiId), [kpiId]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  async function handleAddAlert() {
    const value = parseFloat(draftAlert.threshold.replace(",", "."));
    if (!Number.isFinite(value)) return;
    await onSaveAlert({
      kpiId,
      condition: draftAlert.condition,
      threshold: value,
      label: draftAlert.label.trim() || undefined,
      enabled: true,
    });
    setDraftAlert({ threshold: "", condition: "below", label: "" });
  }

  async function handleAddObjective() {
    const value = parseFloat(draftObjective.target.replace(",", "."));
    if (!Number.isFinite(value)) return;
    // Baseline = valeur du KPI à l'instant T de la création de l'objectif.
    // Stockée une seule fois pour figer le point de départ de la barre — le
    // ratio de progression sera (current − baseline) / (target − baseline).
    const baselineValue =
      typeof currentValue === "number" && Number.isFinite(currentValue)
        ? currentValue
        : undefined;
    await onSaveObjective({
      kpiId,
      target: value,
      direction: draftObjective.direction,
      label: draftObjective.label.trim() || undefined,
      deadline: draftObjective.deadline || undefined,
      baselineValue,
      enabled: true,
    });
    setDraftObjective({ target: "", direction: "max", label: "", deadline: "" });
  }

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Définir alertes et objectifs"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="precision-card relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
              Cibles
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              {def?.label ?? kpiId}
            </h2>
            <p className="mt-1 text-xs text-white/55">
              Définissez des alertes et des objectifs sur ce KPI.
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

        {/* Tabs */}
        <nav className="flex gap-1 border-b border-white/10 px-5 pt-3">
          {([
            { id: "alerts", label: "Alertes", icon: Bell },
            { id: "objectives", label: "Objectifs", icon: Target },
          ] as const).map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={isActive}
                className={`relative inline-flex items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                  isActive ? "text-white" : "text-white/45 hover:text-white/70"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {isActive ? (
                  <span className="absolute bottom-[-1px] left-3 right-3 h-[2px] bg-quantis-gold" />
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "alerts" ? (
            <>
              {/* Liste des alertes existantes */}
              {alerts.length > 0 ? (
                <ul className="mb-4 space-y-1.5">
                  {alerts.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-xs">
                      <span className="flex-1 truncate text-white/85">
                        <span className="font-medium text-white">
                          {a.condition === "above" ? "≥" : "≤"} {a.threshold}
                        </span>
                        {a.label ? <span className="ml-2 text-white/55">— {a.label}</span> : null}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveAlert(a.id)}
                        aria-label="Supprimer"
                        className="rounded p-1 text-white/40 hover:bg-rose-500/10 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-4 text-xs text-white/55">Aucune alerte définie pour ce KPI.</p>
              )}

              {/* Ajout d'une nouvelle alerte */}
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
                  Nouvelle alerte
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={draftAlert.condition}
                    onChange={(e) => setDraftAlert({ ...draftAlert, condition: e.target.value as KpiAlertCondition })}
                    className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-white focus:border-quantis-gold/40 focus:outline-none"
                  >
                    <option value="below" className="bg-quantis-base">Si valeur en-dessous de</option>
                    <option value="above" className="bg-quantis-base">Si valeur au-dessus de</option>
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draftAlert.threshold}
                    onChange={(e) => setDraftAlert({ ...draftAlert, threshold: e.target.value })}
                    placeholder="Seuil (ex. 50000)"
                    className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-white placeholder:text-white/35 focus:border-quantis-gold/40 focus:outline-none"
                  />
                </div>
                <input
                  type="text"
                  value={draftAlert.label}
                  onChange={(e) => setDraftAlert({ ...draftAlert, label: e.target.value })}
                  placeholder="Libellé (optionnel) — ex. Trésorerie critique"
                  className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-white placeholder:text-white/35 focus:border-quantis-gold/40 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddAlert}
                  disabled={!draftAlert.threshold.trim()}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-quantis-gold/40 bg-quantis-gold/15 px-2.5 py-1.5 text-xs font-medium text-quantis-gold hover:bg-quantis-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter l'alerte
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Liste des objectifs existants */}
              {objectives.length > 0 ? (
                <ul className="mb-4 space-y-1.5">
                  {objectives.map((o) => (
                    <li key={o.id} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-xs">
                      <span className="flex-1 truncate text-white/85">
                        <span className="font-medium text-white">
                          {o.direction === "max" ? "Atteindre ≥" : "Rester ≤"} {o.target}
                        </span>
                        {o.label ? <span className="ml-2 text-white/55">— {o.label}</span> : null}
                        {o.deadline ? <span className="ml-2 text-white/45">· {o.deadline}</span> : null}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveObjective(o.id)}
                        aria-label="Supprimer"
                        className="rounded p-1 text-white/40 hover:bg-rose-500/10 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-4 text-xs text-white/55">Aucun objectif défini pour ce KPI.</p>
              )}

              {/* Ajout d'un nouvel objectif */}
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
                  Nouvel objectif
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={draftObjective.direction}
                    onChange={(e) => setDraftObjective({ ...draftObjective, direction: e.target.value as KpiObjectiveDirection })}
                    className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-white focus:border-quantis-gold/40 focus:outline-none"
                  >
                    <option value="max" className="bg-quantis-base">Atteindre au moins</option>
                    <option value="min" className="bg-quantis-base">Rester au plus à</option>
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draftObjective.target}
                    onChange={(e) => setDraftObjective({ ...draftObjective, target: e.target.value })}
                    placeholder="Cible (ex. 1000000)"
                    className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-white placeholder:text-white/35 focus:border-quantis-gold/40 focus:outline-none"
                  />
                </div>
                <input
                  type="text"
                  value={draftObjective.label}
                  onChange={(e) => setDraftObjective({ ...draftObjective, label: e.target.value })}
                  placeholder="Libellé (optionnel) — ex. Objectif T2 2026"
                  className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-white placeholder:text-white/35 focus:border-quantis-gold/40 focus:outline-none"
                />
                <input
                  type="date"
                  value={draftObjective.deadline}
                  onChange={(e) => setDraftObjective({ ...draftObjective, deadline: e.target.value })}
                  className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-white focus:border-quantis-gold/40 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddObjective}
                  disabled={!draftObjective.target.trim()}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-quantis-gold/40 bg-quantis-gold/15 px-2.5 py-1.5 text-xs font-medium text-quantis-gold hover:bg-quantis-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter l'objectif
                </button>
              </div>
            </>
          )}
        </div>

        <footer className="flex justify-end border-t border-white/10 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/65 hover:bg-white/5 hover:text-white"
          >
            Fermer
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
