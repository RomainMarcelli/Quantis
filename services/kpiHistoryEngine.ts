import {
  normalizeAnalysisFolderName,
  resolveAnalysisFiscalYear,
  sortAnalysesByFiscalYear
} from "@/services/analysisHistory";
import { computeKpis } from "@/services/kpiEngine";
import type { AnalysisRecord } from "@/types/analysis";

export function applyHistoricalKpiCorrections(analyses: AnalysisRecord[]): AnalysisRecord[] {
  if (!analyses.length) {
    return analyses;
  }

  const globalByYearAsc = sortAnalysesByFiscalYear(analyses, "asc");
  const hydratedMappedDataById = new Map<string, AnalysisRecord["mappedData"]>();
  const baseKpisById = new Map<string, AnalysisRecord["kpis"]>();

  analyses.forEach((analysis) => {
    const hydrated = hydrateMappedDataForLegacyAnalysis(analysis);
    hydratedMappedDataById.set(analysis.id, hydrated);
    baseKpisById.set(analysis.id, computeKpis(hydrated));
  });

  const byFolder = new Map<string, AnalysisRecord[]>();
  analyses.forEach((analysis) => {
    const key = normalizeAnalysisFolderName(analysis.folderName);
    const group = byFolder.get(key) ?? [];
    group.push(analysis);
    byFolder.set(key, group);
  });

  const updatedById = new Map<string, AnalysisRecord>();

  byFolder.forEach((group) => {
    const sortedByYearAsc = sortAnalysesByFiscalYear(group, "asc");

    sortedByYearAsc.forEach((analysis) => {
      const normalizedMappedData =
        hydratedMappedDataById.get(analysis.id) ?? hydrateMappedDataForLegacyAnalysis(analysis);
      const baseRecomputedKpis = baseKpisById.get(analysis.id) ?? computeKpis(normalizedMappedData);
      const previous =
        findPreviousAnalysisByYear(sortedByYearAsc, analysis) ??
        findPreviousAnalysisByYear(globalByYearAsc, analysis);
      const currentBfr = baseRecomputedKpis.bfr ?? analysis.kpis.bfr;
      const previousBfr = previous
        ? (baseKpisById.get(previous.id)?.bfr ?? previous.kpis.bfr)
        : null;
      const deltaBfr = computeDeltaBfr(currentBfr, previousBfr);
      const cashReel = computeCashReel(baseRecomputedKpis.caf ?? analysis.kpis.caf, deltaBfr);
      const computedTcam =
        computeTcamForAnalysis(sortedByYearAsc, analysis) ??
        computeTcamForAnalysis(globalByYearAsc, analysis);
      const patchedMappedData = {
        ...normalizedMappedData,
        delta_bfr: deltaBfr ?? analysis.mappedData.delta_bfr
      };
      const recomputedKpis = computeKpis(patchedMappedData);
      const mergedKpis = mergeStoredAndComputedKpis(analysis.kpis, recomputedKpis);

      updatedById.set(analysis.id, {
        ...analysis,
        mappedData: patchedMappedData,
        kpis: {
          ...mergedKpis,
          tcam: computedTcam ?? mergedKpis.tcam,
          fte: cashReel ?? mergedKpis.fte
        }
      });
    });
  });

  return analyses.map((analysis) => updatedById.get(analysis.id) ?? analysis);
}

function findPreviousAnalysisByYear(
  analysesSortedByYearAsc: AnalysisRecord[],
  current: AnalysisRecord
): AnalysisRecord | null {
  const currentYear = resolveAnalysisFiscalYear(current);
  if (currentYear === null) {
    return null;
  }

  const currentIndex = analysesSortedByYearAsc.findIndex((analysis) => analysis.id === current.id);
  if (currentIndex <= 0) {
    return null;
  }

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = analysesSortedByYearAsc[index];
    if (!candidate) {
      continue;
    }

    const candidateYear = resolveAnalysisFiscalYear(candidate);
    if (candidateYear !== null && candidateYear < currentYear) {
      return candidate;
    }
  }

  return null;
}

function computeTcamForAnalysis(
  analysesSortedByYearAsc: AnalysisRecord[],
  current: AnalysisRecord
): number | null {
  const currentIndex = analysesSortedByYearAsc.findIndex((analysis) => analysis.id === current.id);
  if (currentIndex === -1) {
    return null;
  }

  const currentYear = resolveAnalysisFiscalYear(current);
  const currentRevenue = resolveRevenue(current);
  if (currentYear === null || currentRevenue === null || currentRevenue <= 0) {
    return null;
  }

  const historyUntilCurrent = analysesSortedByYearAsc.slice(0, currentIndex + 1);
  const oldest = historyUntilCurrent.find((analysis) => {
    const year = resolveAnalysisFiscalYear(analysis);
    const revenue = resolveRevenue(analysis);
    return year !== null && revenue !== null && revenue > 0;
  });

  if (!oldest) {
    return null;
  }

  const oldestYear = resolveAnalysisFiscalYear(oldest);
  const oldestRevenue = resolveRevenue(oldest);
  if (oldestYear === null || oldestRevenue === null || oldestRevenue <= 0) {
    return null;
  }

  const yearsDiff = currentYear - oldestYear;
  if (yearsDiff <= 0) {
    return null;
  }

  const tcam = (Math.pow(currentRevenue / oldestRevenue, 1 / yearsDiff) - 1) * 100;
  if (!Number.isFinite(tcam)) {
    return null;
  }

  return round2(tcam);
}

function resolveRevenue(analysis: AnalysisRecord): number | null {
  const businessCa = sumAvailable(analysis.mappedData.ventes_march, analysis.mappedData.prod_vendue);
  return firstPositive(businessCa, analysis.mappedData.total_prod_expl, analysis.kpis.ca);
}

function computeDeltaBfr(currentBfr: number | null, previousBfr: number | null): number | null {
  if (currentBfr === null) {
    return null;
  }

  if (previousBfr === null) {
    return 0;
  }

  return round2(currentBfr - previousBfr);
}

function computeCashReel(caf: number | null, deltaBfr: number | null): number | null {
  if (caf === null) {
    return null;
  }

  return round2(caf - (deltaBfr ?? 0));
}

function firstPositive(...values: Array<number | null>): number | null {
  for (const value of values) {
    if (value !== null && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return null;
}

function sumAvailable(...values: Array<number | null>): number | null {
  const presentValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!presentValues.length) {
    return null;
  }
  return presentValues.reduce((acc, value) => acc + value, 0);
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function hydrateMappedDataForLegacyAnalysis(analysis: AnalysisRecord): AnalysisRecord["mappedData"] {
  const hasNet = isFiniteNumber(analysis.mappedData.total_actif_immo_net);
  const hasBrut = isFiniteNumber(analysis.mappedData.total_actif_immo_brut);
  if (hasNet && hasBrut) {
    return analysis.mappedData;
  }

  const extracted = extractImmoAmountsFromPreview(analysis.parsedData);
  if (!extracted) {
    return analysis.mappedData;
  }

  return {
    ...analysis.mappedData,
    total_actif_immo_brut: hasBrut ? analysis.mappedData.total_actif_immo_brut : extracted.brut,
    total_actif_immo_net: hasNet ? analysis.mappedData.total_actif_immo_net : extracted.net,
    total_actif_immo:
      analysis.mappedData.total_actif_immo ??
      (hasNet ? analysis.mappedData.total_actif_immo_net : extracted.net) ??
      extracted.brut
  };
}

function extractImmoAmountsFromPreview(
  parsedData: AnalysisRecord["parsedData"]
): { brut: number; net: number } | null {
  for (const fileData of parsedData) {
    const rows = fileData.previewRows;
    if (!Array.isArray(rows) || rows.length === 0) {
      continue;
    }

    const columnKeys = detectPreviewColumnKeys(rows);
    for (const row of rows) {
      if (!row || typeof row !== "object") {
        continue;
      }

      const record = row as Record<string, string | number | null>;
      if (!isImmoRow(record, columnKeys.variableCodeKey)) {
        continue;
      }

      const directBrut = columnKeys.brutKey ? toFiniteNumber(record[columnKeys.brutKey]) : null;
      const directNet = columnKeys.netKey ? toFiniteNumber(record[columnKeys.netKey]) : null;

      if (directBrut !== null && directNet !== null && directBrut >= directNet && directBrut > 0) {
        return {
          brut: directBrut,
          net: directNet
        };
      }

      const fallback = extractBrutNetFromRowHeuristic(record);
      if (fallback) {
        return fallback;
      }
    }
  }

  return null;
}

function detectPreviewColumnKeys(rows: Record<string, string | number | null>[]): {
  variableCodeKey: string | null;
  brutKey: string | null;
  netKey: string | null;
} {
  let variableCodeKey: string | null = null;
  let brutKey: string | null = null;
  let netKey: string | null = null;

  for (const row of rows.slice(0, 3)) {
    for (const [key, value] of Object.entries(row)) {
      if (typeof value !== "string") {
        continue;
      }

      const normalized = normalizeText(value);
      if (!variableCodeKey && normalized.includes("variablecode")) {
        variableCodeKey = key;
      } else if (!brutKey && normalized === "brut") {
        brutKey = key;
      } else if (!netKey && (normalized === "net" || normalized.endsWith("net"))) {
        netKey = key;
      }
    }
  }

  return {
    variableCodeKey,
    brutKey,
    netKey
  };
}

function isImmoRow(
  row: Record<string, string | number | null>,
  variableCodeKey: string | null
): boolean {
  if (variableCodeKey) {
    const candidate = row[variableCodeKey];
    if (typeof candidate === "string" && normalizeText(candidate) === "total_actif_immo") {
      return true;
    }
  }

  return Object.values(row).some(
    (value) => typeof value === "string" && normalizeText(value) === "total_actif_immo"
  );
}

function extractBrutNetFromRowHeuristic(
  row: Record<string, string | number | null>
): { brut: number; net: number } | null {
  const numericValues = Object.values(row)
    .map((value) => toFiniteNumber(value))
    .filter((value): value is number => value !== null && value > 0)
    .sort((left, right) => right - left);

  if (numericValues.length < 2) {
    return null;
  }

  const brut = numericValues[0];
  const net = numericValues.find((value) => value < brut) ?? null;

  if (brut === undefined || net === null || brut < net) {
    return null;
  }

  return {
    brut,
    net
  };
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function toFiniteNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .replace(/\u00A0/g, " ")
    .replace(/\s/g, "")
    .replace(/[^0-9,.-]/g, "");
  if (!cleaned) {
    return null;
  }

  const normalized = cleaned.includes(",") && cleaned.includes(".")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function mergeStoredAndComputedKpis(
  stored: AnalysisRecord["kpis"],
  computed: AnalysisRecord["kpis"]
): AnalysisRecord["kpis"] {
  const merged: AnalysisRecord["kpis"] = { ...stored };

  const computedEntries = Object.entries(computed) as Array<
    [keyof AnalysisRecord["kpis"], number | null]
  >;

  for (const [key, value] of computedEntries) {
    if (value !== null) {
      merged[key] = value;
    }
  }

  return merged;
}
