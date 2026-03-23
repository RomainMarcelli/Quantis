// components/dashboard/UploadLanding.tsx
// Composant de d�p�t de fichiers styl� DA premium pour l'�cran /dashboard.
"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { FileSpreadsheet, FileText, FileType2, Upload, X } from "lucide-react";

type UploadLandingProps = {
  loading: boolean;
  onUpload: (files: File[]) => Promise<void>;
};

const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv", ".pdf"];

export function UploadLanding({ loading, onUpload }: UploadLandingProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    appendFiles(Array.from(event.dataTransfer.files));
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? Array.from(event.target.files) : [];
    appendFiles(files);
    event.target.value = "";
  }

  function appendFiles(files: File[]) {
    const filtered = files.filter((file) => {
      const lower = file.name.toLowerCase();
      return ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
    });

    if (!filtered.length) {
      return;
    }

    setSelectedFiles((current) => {
      const deduped = filtered.filter(
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
  }

  function removeFile(fileIndex: number) {
    setSelectedFiles((current) => current.filter((_, index) => index !== fileIndex));
  }

  async function submitFiles() {
    if (!selectedFiles.length || loading) {
      return;
    }
    await onUpload(selectedFiles);
    setSelectedFiles([]);
  }

  return (
    <section className="precision-card relative overflow-hidden rounded-2xl p-6 md:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(197,160,89,0.14),transparent_42%),radial-gradient(circle_at_100%_0%,rgba(45,212,191,0.08),transparent_30%)]" />

      <div className="relative grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-center">
        <div>
          <h2 className="text-3xl font-semibold leading-tight text-white md:text-4xl md:leading-[1.12]">
            {"Analyse financi\u00E8re,"}
            <span className="ml-2 text-quantis-gold">en un seul flux</span>
          </h2>

          <div className="mt-4 flex items-center gap-2 text-xs text-white/60">
            <FileSpreadsheet className="h-3.5 w-3.5 text-quantis-gold" />
            <span>Excel</span>
            <FileType2 className="h-3.5 w-3.5 text-quantis-gold" />
            <span>PDF</span>
          </div>

          <p className="mt-4 text-sm text-white/65 md:text-base">
            {"D\u00E9posez vos documents Excel ou PDF. Quantis parse, calcule les KPI, stocke dans Firestore, puis alimente votre tableau de bord financier."}
          </p>
          <p className="mt-2 text-xs text-white/45">
            {"Pipeline : D\u00E9p\u00F4t -> Parsing -> KPI -> Stockage -> Dashboard"}
          </p>
        </div>

        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv,.pdf"
            className="hidden"
            onChange={handleFileInput}
          />

          <div
            className={`cursor-pointer rounded-xl border p-4 transition-colors ${
              isDragging
                ? "border-quantis-gold/70 bg-quantis-gold/10"
                : "border-dashed border-white/20 bg-white/[0.03] hover:border-quantis-gold/50"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5">
                <Upload className="h-4 w-4 text-quantis-gold" strokeWidth={1.5} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm text-white">{"D\u00E9posez vos fichiers ou cliquez pour choisir"}</p>
                <p className="text-xs text-white/55">Excel (.xlsx .xls .csv) et PDF</p>
              </div>
            </div>
          </div>

          {selectedFiles.length ? (
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
              <ul className="max-h-40 overflow-y-auto">
                {selectedFiles.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="group flex items-center gap-3 border-b border-white/10 px-4 py-2.5 last:border-b-0"
                  >
                    <FileText className="h-4 w-4 text-white/60" strokeWidth={1.5} />
                    <span className="min-w-0 flex-1 truncate text-sm text-white">
                      {file.name}
                      <span className="ml-2 text-xs text-white/45">{(file.size / 1024).toFixed(1)} KB</span>
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeFile(index);
                      }}
                      className="rounded p-1 text-white/50 opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
                      aria-label={`Supprimer ${file.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-white/10 px-4 py-4">
                <button
                  type="button"
                  onClick={submitFiles}
                  disabled={loading}
                  className="w-full rounded-xl bg-quantis-gold py-2.5 text-sm font-semibold text-black transition-colors hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Traitement..." : "G\u00E9n\u00E9rer le tableau de bord"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
