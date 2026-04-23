"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileSpreadsheet,
  FileText,
  Plus,
  RefreshCcw,
  Upload,
  X
} from "lucide-react";
import { useProductTour } from "@/hooks/useProductTour";
import { QuantisSelect } from "@/components/ui/QuantisSelect";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { UploadProcessingOverlay } from "@/components/upload/UploadProcessingOverlay";
import {
  ONBOARDING_UPLOAD_CONTEXT_COMPLETED_EVENT,
  ONBOARDING_UPLOAD_FILE_ADDED_EVENT
} from "@/lib/onboarding/events";
import {
  COMPANY_SIZE_OPTIONS,
  OTHER_SECTOR_OPTION_VALUE,
  SECTOR_OPTIONS
} from "@/lib/onboarding/options";
import type { CompanySizeValue } from "@/lib/onboarding/options";
import { DEFAULT_FOLDER_NAME, ensureFolderName, setActiveFolderName } from "@/lib/folders/activeFolder";
import { validateUploadInput } from "@/lib/upload/uploadValidation";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseStorage } from "@/lib/firebase";
import { setLocalAnalysisHint } from "@/lib/analysis/analysisAvailability";
import { getPendingAnalysisDraft, savePendingAnalysisDraft } from "@/lib/analysis/pendingAnalysis";
import { saveAnalysisDraft } from "@/services/analysisStore";
import { firebaseAuthGateway } from "@/services/auth";
import type { AnalysisDraft } from "@/types/analysis";
import type { AuthenticatedUser } from "@/types/auth";

export function UploadPageView() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedFilesRef = useRef<File[]>([]);
  const hasDispatchedContextStepRef = useRef(false);
  const { currentStep } = useProductTour();

  const [user, setUser] = useState<AuthenticatedUser | null>(() => firebaseAuthGateway.getCurrentUser());
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [companySize, setCompanySize] = useState<CompanySizeValue | "">("");
  const [sector, setSector] = useState("");
  const [customSector, setCustomSector] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ files?: string; companySize?: string; sector?: string; general?: string }>(
    {}
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isAnalysisComplete, setIsAnalysisComplete] = useState(false);
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
    return `${selectedFiles.length} fichiers sélectionnés`;
  }, [selectedFiles]);

  useEffect(() => {
    selectedFilesRef.current = selectedFiles;
  }, [selectedFiles]);

  useEffect(() => {
    const resolvedSector =
      sector === OTHER_SECTOR_OPTION_VALUE ? customSector.trim() : sector.trim();
    const isContextComplete = Boolean(companySize) && resolvedSector.length >= 2;
    const isContextStepActive = currentStep?.id === "tour-upload-context";

    if (!isContextComplete || !isContextStepActive || !shouldShowContextFields) {
      hasDispatchedContextStepRef.current = false;
      return;
    }

    if (hasDispatchedContextStepRef.current) {
      return;
    }

    hasDispatchedContextStepRef.current = true;
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(ONBOARDING_UPLOAD_CONTEXT_COMPLETED_EVENT));
    }, 0);
  }, [companySize, currentStep?.id, customSector, sector, shouldShowContextFields]);

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

    const currentFiles = selectedFilesRef.current;
    const deduped = files.filter(
      (nextFile) =>
        !currentFiles.some(
          (currentFile) =>
            currentFile.name === nextFile.name &&
            currentFile.size === nextFile.size &&
            currentFile.lastModified === nextFile.lastModified
        )
    );

    if (!deduped.length) {
      return;
    }

    const nextFiles = [...currentFiles, ...deduped];
    selectedFilesRef.current = nextFiles;
    setSelectedFiles(nextFiles);

    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent(ONBOARDING_UPLOAD_FILE_ADDED_EVENT));
      }, 0);
    }

    setSuccessMessage(null);
    setErrors((current) => ({ ...current, files: undefined, general: undefined }));
  }

  function resetUploadForm() {
    selectedFilesRef.current = [];
    setSelectedFiles([]);
    setCompanySize("");
    setSector("");
    setCustomSector("");
    setErrors({});
    setSuccessMessage(null);
  }

  async function uploadFileToStorage(file: File, userId: string): Promise<{ pdfUrl: string; fileName: string; fileSize: number }> {
    const storagePath = `pdfs/${userId}/${Date.now()}_${file.name}`;
    const storageRef = ref(firebaseStorage, storagePath);
    await uploadBytes(storageRef, file);
    const pdfUrl = await getDownloadURL(storageRef);
    return { pdfUrl, fileName: file.name, fileSize: file.size };
  }

  async function requestAnalysisDraft(
    targetUserId: string,
    sectorValue: string,
    filesToSubmit: File[]
  ): Promise<AnalysisDraft> {
    const folderName = ensureFolderName(DEFAULT_FOLDER_NAME) ?? DEFAULT_FOLDER_NAME;

    const uploadedFiles: { pdfUrl: string; fileName: string; fileSize: number }[] = [];
    const nonPdfFiles: File[] = [];

    for (const file of filesToSubmit) {
      if (file.name.toLowerCase().endsWith(".pdf")) {
        uploadedFiles.push(await uploadFileToStorage(file, targetUserId));
      } else {
        nonPdfFiles.push(file);
      }
    }

    let response: Response;

    if (nonPdfFiles.length > 0) {
      const formData = new FormData();
      formData.append("userId", targetUserId);
      formData.append("folderName", folderName);
      formData.append("companySize", companySize);
      formData.append("sector", sectorValue);
      formData.append("source", "upload");
      if (uploadedFiles.length > 0) {
        formData.append("storageFiles", JSON.stringify(uploadedFiles));
      }
      nonPdfFiles.forEach((file) => formData.append("files", file));
      response = await fetch("/api/analyses", { method: "POST", body: formData });
    } else {
      response = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: targetUserId,
          folderName,
          companySize,
          sector: sectorValue,
          source: "upload",
          storageFiles: uploadedFiles
        })
      });
    }

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
    const filesToSubmit = selectedFilesRef.current;
    const resolvedSector =
      sector === OTHER_SECTOR_OPTION_VALUE ? customSector.trim() : sector.trim();

    const validation = validateUploadInput(
      filesToSubmit,
      { companySize, sector: resolvedSector },
      { requireContext: false }
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
        const pendingDraft = await requestAnalysisDraft(
          temporaryUserId,
          resolvedSector,
          filesToSubmit
        );
        savePendingAnalysisDraft(pendingDraft);
        if (!getPendingAnalysisDraft()) {
          throw new Error(
            "Impossible de sauvegarder temporairement l'analyse sur cet appareil. Connectez-vous puis réessayez l'import."
          );
        }
        setLocalAnalysisHint(true);

        const params = new URLSearchParams();
        if (companySize) {
          params.set("companySize", companySize);
        }
        if (resolvedSector) {
          params.set("sector", resolvedSector);
        }
        params.set("next", "/synthese");
        router.push(`/register?${params.toString()}`);
        return;
      }

      const persistedDraft = await requestAnalysisDraft(
        user.uid,
        resolvedSector,
        filesToSubmit
      );
      await saveAnalysisDraft(persistedDraft);
      setActiveFolderName(persistedDraft.folderName);
      setLocalAnalysisHint(true);
      setIsAnalysisComplete(true);
      setSuccessMessage("Analyse créée avec succès. Redirection vers la synthèse...");
      await new Promise((r) => setTimeout(r, 1200));
      router.push("/synthese");
    } catch (error) {
      setErrors({
        general: error instanceof Error ? error.message : "Erreur inattendue pendant la création de l'analyse."
      });
    } finally {
      setIsSubmitting(false);
      if (!isAnalysisComplete) setIsAnalysisComplete(false);
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
              <p className="text-xs uppercase tracking-[0.2em] text-quantis-gold">Analyse financière</p>
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
          <StepCard step="1" title="Ajoutez vos fichiers" active={selectedFiles.length === 0} />
          <StepCard
            step="2"
            title={shouldShowContextFields ? "Contexte entreprise (optionnel)" : "Contexte déjà enregistré"}
            active={selectedFiles.length > 0 && !isSubmitting}
          />
          <StepCard step="3" title="Lancez l'analyse" active={isSubmitting} />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.xlsx,.xls,.csv"
          className="hidden"
          onChange={onFileInput}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          data-tour-id="upload-dropzone"
          className={`mt-5 flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors min-h-[200px] ${
            isDragging
              ? "border-quantis-gold/80 bg-quantis-gold/10"
              : "border-white/20 bg-white/5 hover:border-quantis-gold/50 hover:bg-white/10"
          }`}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-quantis-gold/30 bg-quantis-gold/10">
            <Upload className="h-6 w-6 text-quantis-gold" />
          </span>
          <span className="text-sm font-semibold text-white">Déposez votre fichier ici</span>
          <span className="flex items-center gap-4 text-xs text-white/55">
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              PDF
            </span>
            <span className="inline-flex items-center gap-1">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel
            </span>
          </span>
          <span className="text-[11px] text-white/40">Formats : .pdf, .xlsx, .xls, .csv — Max 20 Mo</span>
        </button>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/80">
          <span className="inline-flex items-center gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5 text-quantis-gold" />
            {selectedFilesLabel}
          </span>
          {selectedFiles.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                selectedFilesRef.current = [];
                setSelectedFiles([]);
              }}
              className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/80 transition-colors hover:bg-white/10"
            >
              Vider
            </button>
          ) : null}
        </div>
        {errors.files ? <InlineError message={errors.files} /> : null}

        {shouldShowContextFields ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2" data-tour-id="upload-context">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-white">Nombre d&apos;employés (optionnel)</span>
              <QuantisSelect
                value={companySize}
                onChange={(value) => setCompanySize(value as CompanySizeValue | "")}
                placeholder="Sélectionner une tranche"
                options={COMPANY_SIZE_OPTIONS.map((option) => ({
                  value: option.value,
                  label: `${option.label} - ${option.range}`
                }))}
              />
              {errors.companySize ? <InlineError message={errors.companySize} /> : null}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-white">Secteur d&apos;activité (optionnel)</span>
              <QuantisSelect
                value={sector}
                onChange={(value) => {
                  setSector(value);
                  if (value !== OTHER_SECTOR_OPTION_VALUE) {
                    setCustomSector("");
                  }
                }}
                placeholder="Sélectionner un secteur"
                options={[
                  ...SECTOR_OPTIONS.map((option) => ({ value: option, label: option })),
                  { value: OTHER_SECTOR_OPTION_VALUE, label: OTHER_SECTOR_OPTION_VALUE }
                ]}
              />
              {sector === OTHER_SECTOR_OPTION_VALUE ? (
                <div className="quantis-input relative mt-2 bg-white/5 px-3 py-2">
                  <input
                    type="text"
                    value={customSector}
                    onChange={(event) => setCustomSector(event.target.value)}
                    placeholder="Précisez votre secteur d'activité"
                    className="w-full border-0 bg-transparent pr-8 text-sm text-white placeholder:text-white/35 outline-none"
                  />
                  {customSector ? (
                    <button
                      type="button"
                      onClick={() => setCustomSector("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
                      aria-label="Effacer le secteur"
                      title="Effacer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ) : null}
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
            disabled={isSubmitting || selectedFiles.length === 0}
            data-tour-id="upload-submit"
            className="btn-gold-premium rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
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

        <UploadProcessingOverlay
          isActive={isSubmitting}
          isComplete={isAnalysisComplete}
          hasError={Boolean(errors.general)}
        />

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

function StepCard({ step, title, active = false }: { step: string; title: string; active?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 transition-colors ${active ? "border-quantis-gold/40 bg-quantis-gold/5" : "border-white/10 bg-white/[0.04]"}`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${active ? "bg-quantis-gold text-black" : "border border-white/20 text-white/50"}`}>{step}</span>
        <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">Étape {step}</p>
      </div>
      <p className="mt-1 text-sm font-medium text-white">{title}</p>
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return <p className="mt-2 text-sm text-rose-300">{message}</p>;
}
