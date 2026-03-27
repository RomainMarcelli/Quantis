// File: lib/upload/uploadValidation.ts
// Role: centralise la validation du parcours d'upload (formats + infos obligatoires).

import { isCompanySizeValue } from "@/lib/onboarding/options";
import type { CompanySizeValue } from "@/lib/onboarding/options";

const EXCEL_EXTENSIONS = [".xlsx", ".xls", ".csv"] as const;

export type UploadContextInput = {
  companySize: CompanySizeValue | "";
  sector: string;
};

export type UploadValidationOptions = {
  // Quand l'utilisateur est déjà connecté, le contexte est déjà connu dans son profil.
  requireContext?: boolean;
};

export type UploadValidationResult = {
  valid: boolean;
  errors: {
    files?: string;
    companySize?: string;
    sector?: string;
  };
};

export function isExcelFileName(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return EXCEL_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

export function validateUploadInput(
  files: File[],
  context: UploadContextInput,
  options: UploadValidationOptions = {}
): UploadValidationResult {
  const errors: UploadValidationResult["errors"] = {};
  const requireContext = options.requireContext ?? true;

  if (!files.length) {
    errors.files = "Ajoutez au moins un fichier Excel pour lancer l'analyse.";
  } else if (files.some((file) => !isExcelFileName(file.name))) {
    errors.files = "Seuls les formats Excel (.xlsx, .xls, .csv) sont acceptés sur cette étape.";
  }

  if (requireContext) {
    if (!context.companySize || !isCompanySizeValue(context.companySize)) {
      errors.companySize = "Sélectionnez le nombre d'employés.";
    }

    if (!context.sector || context.sector.trim().length < 2) {
      errors.sector = "Sélectionnez le secteur d'activité.";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}
