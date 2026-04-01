import type { AnalysisRecord } from "@/types/analysis";

type AnalysisYearInput = Pick<AnalysisRecord, "fiscalYear" | "parsedData" | "createdAt"> &
  Partial<Pick<AnalysisRecord, "sourceFiles">>;

type SortDirection = "asc" | "desc";

export function resolveAnalysisFiscalYear(analysis: AnalysisYearInput): number | null {
  if (typeof analysis.fiscalYear === "number" && Number.isFinite(analysis.fiscalYear)) {
    return analysis.fiscalYear;
  }

  const parsedYears = analysis.parsedData.flatMap((item) => {
    const years = new Set<number>();

    if (typeof item.fiscalYear === "number" && Number.isFinite(item.fiscalYear)) {
      years.add(item.fiscalYear);
    }

    const fileNameYear = extractYearFromText(item.fileName);
    if (fileNameYear !== null) {
      years.add(fileNameYear);
    }

    const previewYear = extractYearFromPreviewRows(item.previewRows);
    if (previewYear !== null) {
      years.add(previewYear);
    }

    return [...years];
  });
  if (parsedYears.length) {
    return Math.max(...parsedYears);
  }

  const sourceFileYears = (analysis.sourceFiles ?? [])
    .map((file) => extractYearFromText(file.name))
    .filter((year): year is number => year !== null);
  if (sourceFileYears.length) {
    return Math.max(...sourceFileYears);
  }

  const createdAtYear = new Date(analysis.createdAt).getFullYear();
  if (Number.isFinite(createdAtYear)) {
    return createdAtYear;
  }

  return null;
}

export function sortAnalysesByFiscalYear(
  analyses: AnalysisRecord[],
  direction: SortDirection = "desc"
): AnalysisRecord[] {
  const factor = direction === "asc" ? 1 : -1;

  return [...analyses].sort((left, right) => {
    const leftYear = sortableYear(resolveAnalysisFiscalYear(left), direction);
    const rightYear = sortableYear(resolveAnalysisFiscalYear(right), direction);
    if (leftYear !== rightYear) {
      return (leftYear - rightYear) * factor;
    }

    const leftCreatedAt = sortableTimestamp(left.createdAt);
    const rightCreatedAt = sortableTimestamp(right.createdAt);
    if (leftCreatedAt !== rightCreatedAt) {
      return (leftCreatedAt - rightCreatedAt) * factor;
    }

    return left.id.localeCompare(right.id) * factor;
  });
}

export function findPreviousAnalysisByFiscalYear(params: {
  analyses: AnalysisRecord[];
  currentAnalysis: AnalysisRecord;
  preferSameFolder?: boolean;
}): AnalysisRecord | null {
  const { analyses, currentAnalysis } = params;
  const preferSameFolder = params.preferSameFolder ?? true;
  const currentYear = resolveAnalysisFiscalYear(currentAnalysis);

  if (currentYear === null) {
    return null;
  }

  const candidates = analyses.filter((analysis) => analysis.id !== currentAnalysis.id);
  if (!candidates.length) {
    return null;
  }

  const sameFolderCandidates = preferSameFolder
    ? candidates.filter(
        (analysis) =>
          normalizeAnalysisFolderName(analysis.folderName) ===
          normalizeAnalysisFolderName(currentAnalysis.folderName)
      )
    : candidates;

  return (
    findLatestAnalysisBeforeYear(sameFolderCandidates, currentYear) ??
    findLatestAnalysisBeforeYear(candidates, currentYear)
  );
}

export function normalizeAnalysisFolderName(folderName: string | null | undefined): string {
  return folderName?.trim().toLowerCase() ?? "";
}

function findLatestAnalysisBeforeYear(
  analyses: AnalysisRecord[],
  currentYear: number
): AnalysisRecord | null {
  const eligible = analyses.filter((analysis) => {
    const year = resolveAnalysisFiscalYear(analysis);
    return year !== null && year < currentYear;
  });

  if (!eligible.length) {
    return null;
  }

  return sortAnalysesByFiscalYear(eligible, "desc")[0] ?? null;
}

function sortableYear(year: number | null, direction: SortDirection): number {
  if (year !== null) {
    return year;
  }
  return direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
}

function sortableTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function extractYearFromPreviewRows(rows: Record<string, string | number | null>[]): number | null {
  const detectedYears = new Set<number>();

  for (const row of rows.slice(0, 40)) {
    const candidates: unknown[] = [...Object.keys(row), ...Object.values(row)];
    for (const candidate of candidates) {
      const year = extractYearCandidate(candidate);
      if (year !== null) {
        detectedYears.add(year);
      }
    }
  }

  if (!detectedYears.size) {
    return null;
  }

  return Math.max(...detectedYears);
}

function extractYearFromText(value: string): number | null {
  const matches = value.match(/20\d{2}/g);
  if (!matches?.length) {
    return null;
  }

  const years = matches
    .map((match) => Number(match))
    .filter((year) => Number.isFinite(year) && year >= 2000 && year <= 2099);
  if (!years.length) {
    return null;
  }

  return Math.max(...years);
}

function extractYearCandidate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);
    if (rounded >= 2000 && rounded <= 2099) {
      return rounded;
    }
    return null;
  }

  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    return Number.isFinite(year) ? year : null;
  }

  if (typeof value === "string") {
    return extractYearFromText(value);
  }

  return null;
}
