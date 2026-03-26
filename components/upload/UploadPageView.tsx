"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  FileSpreadsheet,
  Plus,
  RefreshCcw,
  Upload
} from "lucide-react";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { COMPANY_SIZE_OPTIONS, SECTOR_OPTIONS } from "@/lib/onboarding/options";
import type { CompanySizeValue, SectorValue } from "@/lib/onboarding/options";
import { DEFAULT_FOLDER_NAME, ensureFolderName, setActiveFolderName } from "@/lib/folders/activeFolder";
import { validateUploadInput } from "@/lib/upload/uploadValidation";
import { setLocalAnalysisHint } from "@/lib/analysis/analysisAvailability";
import { getPendingAnalysisDraft, savePendingAnalysisDraft } from "@/lib/analysis/pendingAnalysis";
import { saveAnalysisDraft } from "@/services/analysisStore";
import { firebaseAuthGateway } from "@/services/auth";
import type { AnalysisDraft } from "@/types/analysis";
import type { AuthenticatedUser } from "@/types/auth";

export function UploadPageView() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [user, setUser] = useState<AuthenticatedUser | null>(() => firebaseAuthGateway.getCurrentUser());
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [companySize, setCompanySize] = useState<CompanySizeValue | "">("");
  const [sector, setSector] = useState<SectorValue | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ files?: string; companySize?: string; sector?: string; general?: string }>(
    {}
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const shouldShowContextFields = !user;

  useEffect(() => {
    const unsubscribe = firebaseAuthGateway.subscribe((nextUser) => {
      setUser(nextUser);
    });
    return unsubscribe;
  }, []);

  const selectedFilesLabel = useMemo(() => {
    if (!selectedFiles.length) {
      return "Aucun fichier sélectionné";
    }
    if (selectedFiles.length === 1) {
      return selectedFiles[0]?.name ?? "1 fichier sélectionné";
    }
    return `${selectedFiles.length} fichiers Excel sélectionnés`;
  }, [selectedFiles]);

  function onDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    appendFiles(Array.from(event.dataTransfer.files));
  }

  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? Array.from(event.target.files) : [];
    appendFiles(files);
    event.target.value = "";
  }

  function appendFiles(files: File[]) {
    if (!files.length) {
      return;
    }

    setSelectedFiles((current) => {
      const deduped = files.filter(
        (nextFile) =>
          !current.some(
            (currentFile) =>
              currentFile.name === nextFile.name &&
              currentFile.size === nextFile.size &&
              currentFile.lastModified === nextFile.lastModified
          )
      );
      return [...current, ...deduped];
    });

    setSuccessMessage(null);
    setErrors((current) => ({ ...current, files: undefined, general: undefined }));
  }

  function resetUploadForm() {
    setSelectedFiles([]);
    setCompanySize("");
    setSector("");
    setErrors({});
    setSuccessMessage(null);
  }

  async function requestAnalysisDraft(targetUserId: string): Promise<AnalysisDraft> {
    const folderName = ensureFolderName(DEFAULT_FOLDER_NAME) ?? DEFAULT_FOLDER_NAME;
    const formData = new FormData();
    formData.append("userId", targetUserId);
    formData.append("folderName", folderName);
    formData.append("companySize", companySize);
    formData.append("sector", sector);
    formData.append("source", "upload");
    selectedFiles.forEach((file) => formData.append("files", file));

    const response = await fetch("/api/analyses", {
      method: "POST",
      body: formData
    });
    const payload = (await response.json()) as {
      analysisDraft?: AnalysisDraft;
      error?: string;
      detail?: string;
    };

    if (!response.ok || !payload.analysisDraft) {
      throw new Error(payload.detail ?? payload.error ?? "Le traitement du fichier a échoué.");
    }

    return payload.analysisDraft;
  }

  async function onSubmit() {
    const validation = validateUploadInput(
      selectedFiles,
      { companySize, sector },
      { requireContext: shouldShowContextFields }
    );
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});
    setSuccessMessage(null);

    try {
      if (!user) {
        // Flow invité: on calcule l'analyse tout de suite, puis on la garde localement
        // pour la rattacher au vrai userId juste après inscription/connexion.
        const temporaryUserId = `guest-${Date.now()}`;
        const pendingDraft = await requestAnalysisDraft(temporaryUserId);
        savePendingAnalysisDraft(pendingDraft);
        if (!getPendingAnalysisDraft()) {
          throw new Error(
            "Impossible de sauvegarder temporairement l'analyse sur cet appareil. Connectez-vous puis réessayez l'import."
          );
        }
        setLocalAnalysisHint(true);

        const params = new URLSearchParams();
        params.set("companySize", companySize);
        params.set("sector", sector);
        params.set("next", "/synthese");
        router.push(`/register?${params.toString()}`);
        return;
      }

      const persistedDraft = await requestAnalysisDraft(user.uid);
      await saveAnalysisDraft(persistedDraft);
      setActiveFolderName(persistedDraft.folderName);
      setLocalAnalysisHint(true);
      setSuccessMessage("Analyse créée avec succès. Redirection vers la synthèse...");
      router.push("/synthese");
    } catch (error) {
      setErrors({
        general: error instanceof Error ? error.message : "Erreur inattendue pendant la création de l'analyse."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="relative z-10 mx-auto w-full max-w-5xl space-y-5">
      <header className="precision-card rounded-2xl p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/10 bg-transparent p-1.5">
              <QuantisLogo withText={false} size={34} imageClassName="h-8 w-8 object-contain" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-quantis-gold">Import Excel</p>
              <h1 className="mt-1 text-2xl font-semibold text-white md:text-3xl">
                Lancez votre <span className="text-quantis-gold">analyse financière</span>
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/85 transition-colors hover:bg-white/10"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Accueil
            </Link>
            {user ? (
              <Link
                href="/synthese"
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/85 transition-colors hover:bg-white/10"
              >
                Synthèse
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <section className="precision-card rounded-2xl p-5 md:p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <StepCard step="1" title="Ajoutez vos fichiers" />
          <StepCard step="2" title={shouldShowContextFields ? "Choisissez votre contexte" : "Contexte déjà enregistré"} />
          <StepCard step="3" title="Lancez l'analyse" />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={onFileInput}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`mt-5 flex w-full items-center gap-3 rounded-xl border border-dashed px-4 py-5 text-left transition-colors ${
            isDragging
              ? "border-quantis-gold/80 bg-quantis-gold/10"
              : "border-white/20 bg-white/5 hover:border-quantis-gold/50 hover:bg-white/10"
          }`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/30">
            <Upload className="h-4 w-4 text-quantis-gold" />
          </span>
          <span className="space-y-1">
            <span className="block text-sm font-semibold text-white">Déposez vos fichiers Excel ici</span>
            <span className="block text-xs text-white/65">Formats acceptés : .xlsx, .xls, .csv</span>
          </span>
        </button>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/80">
          <span className="inline-flex items-center gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5 text-quantis-gold" />
            {selectedFilesLabel}
          </span>
          {selectedFiles.length > 0 ? (
            <button
              type="button"
              onClick={() => setSelectedFiles([])}
              className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/80 transition-colors hover:bg-white/10"
            >
              Vider
            </button>
          ) : null}
        </div>
        {errors.files ? <InlineError message={errors.files} /> : null}

        {shouldShowContextFields ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-white">Nombre d&apos;employés</span>
              <div className="relative">
                <select
                  value={companySize}
                  onChange={(event) => setCompanySize(event.target.value as CompanySizeValue | "")}
                  className="quantis-input w-full appearance-none rounded-xl border-white/20 bg-black/30 px-3 py-2.5 pr-9 text-sm text-white outline-none"
                >
                  <option value="">Sélectionner une tranche</option>
                  {COMPANY_SIZE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} - {option.range}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/55" />
              </div>
              {errors.companySize ? <InlineError message={errors.companySize} /> : null}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-white">Secteur d&apos;activité</span>
              <div className="relative">
                <select
                  value={sector}
                  onChange={(event) => setSector(event.target.value as SectorValue | "")}
                  className="quantis-input w-full appearance-none rounded-xl border-white/20 bg-black/30 px-3 py-2.5 pr-9 text-sm text-white outline-none"
                >
                  <option value="">Sélectionner un secteur</option>
                  {SECTOR_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/55" />
              </div>
              {errors.sector ? <InlineError message={errors.sector} /> : null}
            </label>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/65">
            Votre profil entreprise est déjà enregistré. Vous pouvez lancer l&apos;analyse directement.
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={isSubmitting}
            className="rounded-xl bg-quantis-gold px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Analyse en cours..." : "Lancer l'analyse"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/upload/manual")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white/85 transition-colors hover:bg-white/10"
          >
            <Plus className="h-4 w-4" />
            Saisie manuelle
          </button>

          <button
            type="button"
            onClick={resetUploadForm}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white/85 transition-colors hover:bg-white/10"
          >
            <RefreshCcw className="h-4 w-4" />
            Recommencer
          </button>
        </div>

        {!user ? (
          <p className="mt-4 text-xs text-white/55">
            Créez un compte après validation pour sauvegarder l&apos;analyse et l&apos;historique.
          </p>
        ) : null}

        {errors.general ? <InlineError message={errors.general} /> : null}
        {successMessage ? (
          <p className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
            {successMessage}
          </p>
        ) : null}
      </section>
    </section>
  );
}

function StepCard({ step, title }: { step: string; title: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">Étape {step}</p>
      <p className="mt-1 text-sm font-medium text-white">{title}</p>
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return <p className="mt-2 text-sm text-rose-300">{message}</p>;
}
