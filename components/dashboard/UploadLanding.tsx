"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { FileText, Upload, X } from "lucide-react";

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
    <section className="mesh-gradient quantis-panel relative overflow-hidden p-6 md:p-10">
      <div className="pointer-events-none absolute inset-0 opacity-80" />
      <div className="relative grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-center">
        <div>
          <h1 className="text-4xl font-semibold leading-tight text-quantis-carbon md:text-5xl md:leading-[1.12]">
            Analyse financiere,
            <span className="ml-2 text-quantis-gold">en un seul flux</span>
          </h1>
          <div className="quantis-accent-line mt-4" />
          <p className="mt-4 text-sm text-quantis-slate md:text-base">
            Deposez vos documents Excel ou PDF. Quantis parse, calcule les KPI, stocke dans Firestore, puis alimente
            votre tableau de bord.
          </p>
          <p className="mt-2 text-xs text-quantis-slate">
            Pipeline: Depot -&gt; Parsing -&gt; KPI -&gt; Stockage -&gt; Tableau de bord
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
            className={`quantis-panel cursor-pointer p-4 transition-colors ${
              isDragging ? "border-quantis-gold/70 bg-white" : "border-dashed hover:border-quantis-gold/50"
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
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-quantis-mist bg-quantis-paper">
                <Upload className="h-4 w-4 text-quantis-slate" strokeWidth={1.5} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm text-quantis-carbon">Deposez vos fichiers ou cliquez pour choisir</p>
                <p className="text-xs text-quantis-slate">Excel (.xlsx .xls .csv) et PDF</p>
              </div>
            </div>
          </div>

          {selectedFiles.length ? (
            <div className="quantis-panel overflow-hidden">
              <ul className="max-h-40 overflow-y-auto">
                {selectedFiles.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="group flex items-center gap-3 border-b border-quantis-mist px-4 py-2.5 last:border-b-0">
                    <FileText className="h-4 w-4 text-quantis-slate" strokeWidth={1.5} />
                    <span className="min-w-0 flex-1 truncate text-sm text-quantis-carbon">
                      {file.name}
                      <span className="ml-2 text-xs text-quantis-slate">{(file.size / 1024).toFixed(1)} KB</span>
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeFile(index);
                      }}
                      className="rounded p-1 text-quantis-slate opacity-0 transition-opacity group-hover:opacity-100 hover:text-quantis-carbon"
                      aria-label={`Supprimer ${file.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-quantis-mist px-4 py-4">
                <button
                  type="button"
                  onClick={submitFiles}
                  disabled={loading}
                  className="quantis-primary w-full py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Traitement..." : "Generer le tableau de bord"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
