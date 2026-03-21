// File: lib/settings/appPreferences.ts
// Role: centralise les preferences applicatives cote client (stockage local, lecture, ecriture, reset).

export type ExportFormat = "xlsx" | "csv" | "pdf";

export type AppPreferences = {
  defaultFiscalYear: number | null;
  preferredExportFormat: ExportFormat;
  showDebugSection: boolean;
  autoOpenAnalysisAfterUpload: boolean;
  confirmDestructiveActions: boolean;
};

const APP_PREFERENCES_STORAGE_KEY = "quantis.appPreferences";

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  defaultFiscalYear: null,
  preferredExportFormat: "xlsx",
  showDebugSection: false,
  autoOpenAnalysisAfterUpload: true,
  confirmDestructiveActions: true
};

export function loadAppPreferences(): AppPreferences {
  if (typeof window === "undefined") {
    return { ...DEFAULT_APP_PREFERENCES };
  }

  const raw = window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_APP_PREFERENCES };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return sanitizeAppPreferences(parsed);
  } catch {
    return { ...DEFAULT_APP_PREFERENCES };
  }
}

export function saveAppPreferences(preferences: Partial<AppPreferences>): AppPreferences {
  if (typeof window === "undefined") {
    return sanitizeAppPreferences(preferences);
  }

  const merged = sanitizeAppPreferences({
    ...loadAppPreferences(),
    ...preferences
  });
  window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function resetAppPreferences(): AppPreferences {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(APP_PREFERENCES_STORAGE_KEY);
  }
  return { ...DEFAULT_APP_PREFERENCES };
}

function sanitizeAppPreferences(candidate: Partial<AppPreferences>): AppPreferences {
  const defaultFiscalYear =
    typeof candidate.defaultFiscalYear === "number" &&
    candidate.defaultFiscalYear >= 2000 &&
    candidate.defaultFiscalYear <= 2100
      ? candidate.defaultFiscalYear
      : null;

  const preferredExportFormat: ExportFormat =
    candidate.preferredExportFormat === "csv" || candidate.preferredExportFormat === "pdf"
      ? candidate.preferredExportFormat
      : "xlsx";

  return {
    defaultFiscalYear,
    preferredExportFormat,
    showDebugSection: Boolean(candidate.showDebugSection),
    autoOpenAnalysisAfterUpload:
      candidate.autoOpenAnalysisAfterUpload === undefined
        ? DEFAULT_APP_PREFERENCES.autoOpenAnalysisAfterUpload
        : Boolean(candidate.autoOpenAnalysisAfterUpload),
    confirmDestructiveActions:
      candidate.confirmDestructiveActions === undefined
        ? DEFAULT_APP_PREFERENCES.confirmDestructiveActions
        : Boolean(candidate.confirmDestructiveActions)
  };
}
