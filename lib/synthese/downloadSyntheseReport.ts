// File: lib/synthese/downloadSyntheseReport.ts
// Role: génère et télécharge le rapport PDF de synthèse via @react-pdf/renderer.

import React from "react";
import { pdf } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import { PDFLayout } from "@/components/pdf/PDFLayout";
import { buildPdfReportData } from "@/lib/synthese/pdfReportModel";
import type { SyntheseViewModel } from "@/lib/synthese/syntheseViewModel";

type DownloadSyntheseReportInput = {
  companyName: string;
  greetingName: string;
  analysisCreatedAt: string;
  selectedYearLabel: string;
  synthese: SyntheseViewModel;
};

type RenderSyntheseReportOptions = {
  logoSrc?: string;
};

// Pipeline de génération:
// 1) mapping métier -> modèle document (buildPdfReportData)
// 2) rendu PDF A4 via composants react-pdf
// 3) retour Blob pour téléchargement ou tests.
export async function renderSyntheseReportBlob(
  input: DownloadSyntheseReportInput,
  options?: RenderSyntheseReportOptions
): Promise<Blob> {
  const data = buildPdfReportData(input);
  const logoSrc = options?.logoSrc ?? resolveLogoSrc();
  const documentNode = React.createElement(PDFLayout, { data, logoSrc }) as unknown as React.ReactElement<DocumentProps>;

  // @react-pdf attend un élément Document; PDFLayout rend un Document complet.
  const instance = pdf(documentNode);
  return instance.toBlob();
}

export async function downloadSyntheseReport(input: DownloadSyntheseReportInput): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  const blob = await renderSyntheseReportBlob(input);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `rapport-quantis-${sanitizeFileName(input.companyName)}-${formatDateForFile(new Date())}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function resolveLogoSrc(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return `${window.location.origin}/images/LogoV3.png`;
}

function sanitizeFileName(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "quantis";
}

function formatDateForFile(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hour = String(value.getHours()).padStart(2, "0");
  const minute = String(value.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}`;
}
