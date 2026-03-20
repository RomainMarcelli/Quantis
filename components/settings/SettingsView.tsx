// File: components/settings/SettingsView.tsx
// Role: page de parametres applicatifs (preferences metier + securite session) avec la DA premium de /analysis.
"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Download, Save, ShieldCheck, SlidersHorizontal, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { FeedbackToast } from "@/components/ui/FeedbackToast";
import {
  type ExportFormat,
  type AppPreferences,
  loadAppPreferences,
  resetAppPreferences,
  saveAppPreferences
} from "@/lib/settings/appPreferences";

type ToastState = { type: "success" | "error" | "info"; message: string } | null;

export function SettingsView() {
  const router = useRouter();
  const [preferences, setPreferences] = useState<AppPreferences>(() => loadAppPreferences());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    // Cette page conserve la meme ambiance visuelle premium que /analysis.
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
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function updatePreference<Key extends keyof AppPreferences>(key: Key, value: AppPreferences[Key]) {
    setPreferences((currentPreferences) => ({
      ...currentPreferences,
      [key]: value
    }));
  }

  async function handleSavePreferences() {
    setSaving(true);
    try {
      const savedPreferences = saveAppPreferences(preferences);
      setPreferences(savedPreferences);
      setToast({
        type: "success",
        message: "Parametres enregistres avec succes."
      });
    } catch {
      setToast({
        type: "error",
        message: "Impossible d'enregistrer les parametres."
      });
    } finally {
      setSaving(false);
    }
  }

  function handleResetPreferences() {
    const resetPreferences = resetAppPreferences();
    setPreferences(resetPreferences);
    setToast({
      type: "info",
      message: "Parametres reinitialises."
    });
  }

  return (
    <section className="premium-analysis-root relative space-y-6 overflow-hidden rounded-2xl p-4 md:p-8">
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />
      {toast ? <FeedbackToast type={toast.type} message={toast.message} /> : null}

      <header className="precision-card relative z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <QuantisLogo withText={false} size={24} />
          <div>
            <h1 className="text-2xl font-semibold text-white">Parametres</h1>
            <p className="text-sm text-white/60">Configuration essentielle de votre espace Quantis.</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.push("/analysis")}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85 hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour dashboard
        </button>
      </header>

      <section className="precision-card relative z-10 space-y-4 rounded-2xl p-5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-quantis-gold" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/85">Preferences metier</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs uppercase tracking-wide text-white/60">Exercice fiscal par defaut</span>
            <input
              type="number"
              min={2000}
              max={2100}
              value={preferences.defaultFiscalYear ?? ""}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                if (!event.target.value) {
                  updatePreference("defaultFiscalYear", null);
                  return;
                }
                updatePreference("defaultFiscalYear", Number.isNaN(nextValue) ? null : nextValue);
              }}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-quantis-gold/60"
              placeholder="Ex: 2026"
            />
            <p className="text-xs text-white/45">Preselectionne l&apos;annee dans les futurs ecrans de filtre.</p>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs uppercase tracking-wide text-white/60">Format d&apos;export prefere</span>
            <select
              value={preferences.preferredExportFormat}
              onChange={(event) => updatePreference("preferredExportFormat", event.target.value as ExportFormat)}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-quantis-gold/60"
            >
              <option value="xlsx">Excel (.xlsx)</option>
              <option value="csv">CSV (.csv)</option>
              <option value="pdf">PDF (.pdf)</option>
            </select>
            <p className="text-xs text-white/45">Utilise ce format comme choix par defaut pour les exports.</p>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <ToggleRow
            label="Afficher la section debug"
            hint="Permet d&apos;afficher rawData / mappedData / kpis dans les vues d&apos;analyse."
            checked={preferences.showDebugSection}
            onChange={(nextChecked) => updatePreference("showDebugSection", nextChecked)}
          />
          <ToggleRow
            label="Ouvrir automatiquement l'analyse"
            hint="Apres upload, ouvre directement le dashboard d&apos;analyse detaille."
            checked={preferences.autoOpenAnalysisAfterUpload}
            onChange={(nextChecked) => updatePreference("autoOpenAnalysisAfterUpload", nextChecked)}
          />
          <ToggleRow
            label="Confirmation actions destructives"
            hint="Exige une validation explicite avant suppression dossier/analyses."
            checked={preferences.confirmDestructiveActions}
            onChange={(nextChecked) => updatePreference("confirmDestructiveActions", nextChecked)}
          />
        </div>
      </section>

      <section className="precision-card relative z-10 space-y-4 rounded-2xl p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-quantis-gold" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/85">Securite et session</h2>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-sm text-white/80">
            Le mode nuit est impose globalement pour garantir une experience visuelle coherente.
          </p>
          <p className="mt-2 text-xs text-white/50">
            Astuce: la suppression complete du compte reste disponible dans l&apos;onglet Compte.
          </p>
        </div>
      </section>

      <section className="precision-card relative z-10 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleResetPreferences}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            <RotateCcw className="h-4 w-4" />
            Reinitialiser
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSavePreferences}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-quantis-gold/90 px-4 py-2 text-sm font-medium text-black hover:bg-quantis-gold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Download className="h-4 w-4 animate-pulse" /> : <Save className="h-4 w-4" />}
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </section>
    </section>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white/90">{label}</p>
          <p className="mt-1 text-xs text-white/45">{hint}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`relative h-6 w-11 rounded-full border transition-colors ${
            checked
              ? "border-quantis-gold/60 bg-quantis-gold/35"
              : "border-white/20 bg-white/10"
          }`}
        >
          <span
            className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${
              checked ? "left-6" : "left-1"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
