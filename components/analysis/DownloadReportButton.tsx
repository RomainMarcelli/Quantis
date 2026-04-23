"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import {
  downloadSyntheseReport,
  type DownloadSyntheseReportInput
} from "@/lib/synthese/downloadSyntheseReport";

type Variant = "primary" | "secondary";
type Size = "sm" | "md";

interface DownloadReportButtonProps {
  disabled?: boolean;
  getDownloadInput: () => DownloadSyntheseReportInput;
  variant?: Variant;
  size?: Size;
  className?: string;
  onDownloadStart?: () => void;
  onDownloadComplete?: () => void;
  onDownloadError?: (err: Error) => void;
}

const BASE =
  "inline-flex items-center gap-2 rounded-lg px-3 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-quantis-gold/60 disabled:cursor-not-allowed disabled:opacity-40";

const VARIANT_CLASSES: Record<Variant, string> = {
  secondary:
    "border border-white/25 bg-white/5 text-white/90 hover:bg-white/15 hover:border-white/40 hover:text-white",
  primary:
    "border border-quantis-gold/30 bg-quantis-gold/10 text-quantis-gold hover:bg-quantis-gold/20"
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "py-1",
  md: "py-1.5"
};

export function DownloadReportButton({
  disabled = false,
  getDownloadInput,
  variant = "secondary",
  size = "md",
  className = "",
  onDownloadStart,
  onDownloadComplete,
  onDownloadError
}: DownloadReportButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fullLabel = size === "sm" ? "Rapport" : "Télécharger le rapport";
  const ariaLabel = "Télécharger le rapport";

  async function handleClick() {
    if (disabled || isDownloading) return;
    setError(null);
    setIsDownloading(true);
    onDownloadStart?.();
    try {
      const input = getDownloadInput();
      await downloadSyntheseReport(input);
      onDownloadComplete?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erreur lors du téléchargement.";
      setError(message);
      onDownloadError?.(err instanceof Error ? err : new Error(message));
    } finally {
      setIsDownloading(false);
    }
  }

  const classes = [
    BASE,
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className
  ]
    .filter(Boolean)
    .join(" ");

  const buttonDisabled = disabled || isDownloading;
  const title = disabled ? "Aucune analyse disponible" : undefined;

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={buttonDisabled}
        aria-label={ariaLabel}
        title={title}
        className={classes}
      >
        {isDownloading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span>{isDownloading ? "Génération…" : fullLabel}</span>
      </button>
      {error ? (
        <span role="alert" className="text-[11px] text-rose-300">
          {error}
        </span>
      ) : null}
    </div>
  );
}
