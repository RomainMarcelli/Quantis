// File: components/dashboard/widgets/CreateDashboardModal.tsx
// Role: modal compacte pour créer un nouveau dashboard custom Phase 4.
// L'utilisateur saisit le nom (ex. "Pilotage commercial", "Vue banquier"),
// confirme, et le parent (DashboardFinancialTestMenu) appelle createDashboard.
"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";

type CreateDashboardModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
  isCreating?: boolean;
};

const SUGGESTIONS = [
  "Pilotage commercial",
  "Vue banquier",
  "Conseil d'administration",
  "Reporting hebdo",
  "Analyse mensuelle"
];

export function CreateDashboardModal({
  open,
  onClose,
  onConfirm,
  isCreating
}: CreateDashboardModalProps) {
  const [name, setName] = useState("");

  if (!open) return null;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
    setName("");
  }

  function handleClose() {
    setName("");
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nouveau tableau de bord"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center"
      onClick={handleClose}
    >
      <form
        className="precision-card relative flex w-full max-w-md flex-col gap-4 rounded-t-2xl p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">Phase 4</p>
            <h2 className="text-lg font-semibold text-white">Nouveau tableau de bord</h2>
            <p className="mt-1 text-xs text-white/55">
              Crée un dashboard 100 % personnalisable, sans contrainte de catégorie.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fermer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-white/65 hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
            Nom du dashboard
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Pilotage commercial"
            autoFocus
            maxLength={60}
            className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-quantis-gold/40 focus:outline-none"
          />
        </label>

        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setName(suggestion)}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/55 hover:border-quantis-gold/30 hover:text-quantis-gold"
            >
              <Sparkles className="h-3 w-3" />
              {suggestion}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/65 hover:bg-white/5 hover:text-white"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={!name.trim() || isCreating}
            className="flex-1 rounded-lg border border-quantis-gold/40 bg-quantis-gold/15 px-3 py-2 text-sm font-medium text-quantis-gold hover:bg-quantis-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isCreating ? "Création…" : "Créer"}
          </button>
        </div>
      </form>
    </div>
  );
}
