import { computeKpis } from "@/services/kpiEngine";
import { calculateQuantisScore } from "@/lib/quantisScore";
import {
  applyLegacyFinancialFactsToMappedData,
  mapMappedDataToFinancialFacts,
  mapRawDataToMappedFinancialData,
  mergeRawAnalysisData
} from "@/services/mapping/financialDataMapper";
import { parseUploadedFile, type UploadedBinaryFile } from "@/services/parsers/fileParser";
import { mergeFinancialFacts } from "@/services/parsers/financialFactsExtractor";
import type { AnalysisDraft, FinancialFacts, MappedFinancialData, ParsedFileData } from "@/types/analysis";
import { extractFinancialPages } from "@/services/pdf-analysis/pdfPageExtractor";
import { processPdfWithDocumentAI } from "@/services/documentAI";
import { analyzeFinancialDocument } from "@/services/pdfAnalysis";
import { mapParsedFinancialDataToMappedFinancialData } from "@/services/mapping/parsedFinancialDataBridge";
import { mapLlmDataToMappedFinancialData } from "@/services/pdf-analysis/llmDataMapper";
import { extractFinancialsFromPdf } from "@/services/pdf-analysis/claudeVisionExtractor";
import { parseFec } from "@/services/parsers/fecParser";
import { sanitizeMappedData } from "@/services/kpiSanitizer";
import { aggregateEntriesToParsedFinancialData } from "@/services/integrations/aggregations/pcgAggregator";
import { buildDailyAccounting } from "@/services/integrations/aggregations/dailyAccountingBuilder";
import { buildBalanceSheetSnapshot } from "@/services/integrations/aggregations/balanceSheetSnapshotBuilder";
import type {
  AccountingEntry,
  BalanceSheetSnapshot,
  DailyAccountingEntry,
  NormalizedTrialBalanceEntry,
} from "@/types/connectors";

export async function runAnalysisPipeline(params: {
  userId: string;
  folderName: string;
  files: UploadedBinaryFile[];
  uploadContext?: {
    companySize?: string | null;
    sector?: string | null;
    source?: "dashboard" | "analysis" | "upload" | "manual";
  };
}): Promise<AnalysisDraft> {
  const pdfFiles = params.files.filter((f) => f.type === "pdf");
  const fecFiles = params.files.filter((f) => f.type === "fec");
  const nonPdfFiles = params.files.filter((f) => f.type !== "pdf" && f.type !== "fec");

  // ─── Branche FEC : parser unifié → mêmes agrégateurs que Pennylane/MyUnisoft/Odoo ──
  // Si un fichier FEC est présent, on bypass complètement le pipeline statique et
  // on rejoue exactement la chaîne `buildAndPersistAnalysisFromSync` (sans Firestore) :
  //   FEC → AccountingEntry[] + trialBalance → pcgAggregator → mappedData → KPI
  //                                          → buildDailyAccounting
  //                                          → buildBalanceSheetSnapshot
  // Résultat : un FEC produit le MÊME schéma qu'un sync Pennylane (dailyAccounting +
  // balanceSheetSnapshot + 2033-SD codes), donc le front consomme un seul format.
  if (fecFiles.length > 0) {
    return runFecPipeline(params, fecFiles);
  }

  let documentAiMappedData: MappedFinancialData | null = null;
  let documentAiParsedFileData: ParsedFileData | null = null;
  let parserVersion: "v1" | "v2" = "v1";
  let extractedRawText = "";
  let v2FiscalYear: number | null = null;

  if (pdfFiles.length > 0) {
    const pdfFile = pdfFiles[0]!;
    const pdfBuffer = Buffer.from(pdfFile.buffer);

    // ─── V2 : Claude Vision lit directement le PDF ────────────────────
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        console.log(`[Pipeline] V2 Claude Vision — ${pdfFile.name}`);
        const visionResult = await extractFinancialsFromPdf(pdfBuffer, pdfFile.name);

        if (visionResult.success && visionResult.data && visionResult.confidenceScore >= 0.4) {
          documentAiMappedData = mapLlmDataToMappedFinancialData(visionResult.data);
          parserVersion = "v2";
          v2FiscalYear = visionResult.fiscalYear;
          console.log(`[V2] Adopté — parserVersion: v2 — fiscalYear: ${v2FiscalYear}`);
        } else {
          console.warn(`[V2] Rejeté — score: ${visionResult.confidenceScore.toFixed(2)} → fallback V1`);
        }
      } catch (v2Error) {
        console.warn("[V2] Exception → fallback V1:", v2Error instanceof Error ? v2Error.message : "unknown");
      }
    }

    // ─── V1 FALLBACK : Document AI + parser manuel ────────────────────
    if (!documentAiMappedData) {
      try {
        console.log("[Parser V1] Fallback activé");
        const pageExtraction = await extractFinancialPages(pdfBuffer);
        const extraction = await processPdfWithDocumentAI({
          pdfBuffer: pageExtraction.buffer,
          fileName: pdfFile.name,
          mimeType: pdfFile.mimeType,
          imagelessMode: pageExtraction.imagelessMode
        });
        extractedRawText = extraction.rawText;

        const analysis = analyzeFinancialDocument(extraction);
        documentAiMappedData = mapParsedFinancialDataToMappedFinancialData(analysis.parsedFinancialData);
        parserVersion = "v1";
      } catch (v1Error) {
        console.warn("[Parser V1] Failed:", v1Error instanceof Error ? v1Error.message : "unknown");
      }
    }

    // ─── Metadata pour ParsedFileData (uniquement si extraction réussie) ──
    if (documentAiMappedData) {
      documentAiParsedFileData = {
        fileName: pdfFile.name,
        fileType: "pdf",
        extractedAt: new Date().toISOString(),
        fiscalYear: v2FiscalYear ?? inferFiscalYearFromMappedData(documentAiMappedData) ?? inferFiscalYearFromText(extractedRawText),
        metrics: [],
        previewRows: [{
          pages: 0,
          textSample: "",
          revenue: null,
          expenses: null,
          treasury: null
        }],
        rawData: { byVariableCode: {}, byLineCode: {}, byLabel: {} }
      };
    }
  }

  const fallbackFiles = documentAiParsedFileData ? nonPdfFiles : params.files;
  const fallbackParsedData = await Promise.all(
    fallbackFiles.map((file) => parseUploadedFile(file))
  );

  const parsedData: ParsedFileData[] = [
    ...(documentAiParsedFileData ? [documentAiParsedFileData] : []),
    ...fallbackParsedData
  ];

  const rawData = mergeRawAnalysisData(parsedData.map((item) => item.rawData));
  const legacyFacts = mergeFinancialFacts(parsedData.map((item) => mapParsedDataToFacts(item)));

  const rawMappedData = documentAiMappedData
    ?? applyLegacyFinancialFactsToMappedData(
      mapRawDataToMappedFinancialData(rawData),
      legacyFacts
    );

  // Garde-fou : neutralise les valeurs > 10¹² € qui peuvent venir d'un parsing
  // PDF foireux (concaténation de colonnes, séparateur de milliers mal lu).
  // Mieux vaut un null qu'une donnée fausse qui pollue tous les KPI en aval.
  const { sanitized: mappedData, warnings: sanitizationWarnings } = sanitizeMappedData(rawMappedData);
  if (sanitizationWarnings.length > 0) {
    console.warn(
      `[analysisPipeline] mappedData sanitization: ${sanitizationWarnings.length} field(s) rejected`,
      sanitizationWarnings
    );
  }

  const kpis = computeKpis(mappedData);
  const quantisScore = calculateQuantisScore(kpis);
  const facts = mapMappedDataToFinancialFacts(mappedData);

  const candidateYears = parsedData
    .map((item) => item.fiscalYear)
    .filter((year): year is number => year !== null && year <= 2030);
  const fiscalYear = candidateYears.length > 0 ? Math.max(...candidateYears) : null;

  return {
    userId: params.userId,
    folderName: params.folderName,
    createdAt: new Date().toISOString(),
    fiscalYear,
    sourceFiles: params.files.map((file) => ({
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      type: file.type
    })),
    parsedData,
    rawData,
    mappedData,
    financialFacts: facts,
    kpis,
    quantisScore,
    uploadContext: {
      companySize: params.uploadContext?.companySize?.trim() || null,
      sector: params.uploadContext?.sector?.trim() || null,
      source: params.uploadContext?.source ?? "dashboard"
    },
    parserVersion
  };
}

/**
 * Pipeline dédié aux uploads FEC. Recycle exactement les agrégateurs
 * `pcgAggregator` + `dailyAccountingBuilder` + `balanceSheetSnapshotBuilder`
 * utilisés par `buildAndPersistAnalysisFromSync` (Pennylane/MyUnisoft/Odoo) →
 * garantit que la sortie front est identique quelle que soit la source.
 *
 * Différence avec la version dynamique : pas de Firestore, pas de `connectionId`,
 * pas de fetch async — tout est en mémoire à partir du buffer FEC.
 */
async function runFecPipeline(
  params: {
    userId: string;
    folderName: string;
    files: UploadedBinaryFile[];
    uploadContext?: {
      companySize?: string | null;
      sector?: string | null;
      source?: "dashboard" | "analysis" | "upload" | "manual";
    };
  },
  fecFiles: UploadedBinaryFile[]
): Promise<AnalysisDraft> {
  // 1. Parser tous les FEC fournis (cas multi-exercices) et concaténer les écritures.
  const allEntries: AccountingEntry[] = [];
  const allTrialBalance: NormalizedTrialBalanceEntry[] = [];
  let minPeriodStart: string | null = null;
  let maxPeriodEnd: string | null = null;

  for (const file of fecFiles) {
    const text = file.buffer.toString("utf8");
    const parsed = parseFec(text, file.name);
    allEntries.push(...parsed.entries);
    allTrialBalance.push(...parsed.trialBalance);
    if (!minPeriodStart || parsed.periodStart < minPeriodStart) minPeriodStart = parsed.periodStart;
    if (!maxPeriodEnd || parsed.periodEnd > maxPeriodEnd) maxPeriodEnd = parsed.periodEnd;
  }

  const periodStart = new Date(`${minPeriodStart ?? new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const periodEnd = new Date(`${maxPeriodEnd ?? new Date().toISOString().slice(0, 10)}T23:59:59.999Z`);
  const previousPeriodStart = new Date(periodStart);
  const periodLengthMs = periodEnd.getTime() - periodStart.getTime();
  previousPeriodStart.setTime(periodStart.getTime() - periodLengthMs);
  const previousPeriodEnd = new Date(periodStart.getTime() - 1);

  // 2. ParsedFinancialData via pcgAggregator (même que Pennylane fallback).
  const parsedFinancialData = aggregateEntriesToParsedFinancialData(allEntries, {
    periodStart,
    periodEnd,
    previousPeriodStart,
    previousPeriodEnd,
  });

  // 3. mappedData → KPI → score (avec garde-fou aberrantes, même si un FEC
  // bien formé ne devrait jamais le déclencher — défense en profondeur).
  const rawMappedData = mapParsedFinancialDataToMappedFinancialData(parsedFinancialData);
  const { sanitized: mappedData, warnings: sanitizationWarnings } = sanitizeMappedData(rawMappedData);
  if (sanitizationWarnings.length > 0) {
    console.warn(
      `[analysisPipeline:fec] mappedData sanitization: ${sanitizationWarnings.length} field(s) rejected`,
      sanitizationWarnings
    );
  }
  const kpis = computeKpis(mappedData);
  const quantisScore = calculateQuantisScore(kpis);
  const facts = mapMappedDataToFinancialFacts(mappedData);

  // 4. Format unifié front (matière première).
  const dailyAccounting: DailyAccountingEntry[] = buildDailyAccounting(allEntries);
  const balanceSheetSnapshot: BalanceSheetSnapshot | null =
    allTrialBalance.length > 0
      ? buildBalanceSheetSnapshot(
          allTrialBalance,
          periodEnd.toISOString().slice(0, 10),
          periodStart.toISOString().slice(0, 10)
        )
      : null;

  const fiscalYear = periodEnd.getFullYear();

  return {
    userId: params.userId,
    folderName: params.folderName,
    createdAt: new Date().toISOString(),
    fiscalYear,
    sourceFiles: params.files.map((file) => ({
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      type: file.type,
    })),
    parsedData: [],
    rawData: { byVariableCode: {}, byLineCode: {}, byLabel: {} },
    mappedData,
    financialFacts: facts,
    kpis,
    quantisScore,
    uploadContext: {
      companySize: params.uploadContext?.companySize?.trim() || null,
      sector: params.uploadContext?.sector?.trim() || null,
      source: params.uploadContext?.source ?? "upload",
    },
    parserVersion: "v2",
    sourceMetadata: {
      type: "dynamic",
      provider: "fec",
      providerSub: null,
      connectionId: null,
      syncedAt: new Date().toISOString(),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      currency: "EUR",
    },
    dailyAccounting,
    balanceSheetSnapshot,
  };
}

function mapParsedDataToFacts(item: ParsedFileData): FinancialFacts {
  const facts: FinancialFacts = {
    revenue: null, expenses: null, payroll: null,
    treasury: null, receivables: null, payables: null, inventory: null
  };
  item.metrics.forEach((metric) => { facts[metric.key] = metric.value; });
  return facts;
}

function inferFiscalYearFromText(rawText: string): number | null {
  if (!rawText) return null;
  const matches = rawText.match(/20\d{2}/g);
  if (!matches) return null;
  const currentYear = new Date().getFullYear();
  const candidates = [...new Set(matches.map(Number))]
    .filter((y) => y >= 2015 && y <= currentYear + 1);
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

function inferFiscalYearFromMappedData(mapped: MappedFinancialData | null): number | null {
  if (!mapped?.n) return null;
  const year = mapped.n;
  return year >= 2015 && year <= new Date().getFullYear() + 1 ? year : null;
}
