export type VyzorData = {
  ca: number | null;
  totalCharges: number | null;
  netResult: number | null;
  totalAssets: number | null;
  equity: number | null;
  debts: number | null;
};

export type NumericRecord = Record<string, number | null>;

export type PdfExtractionSummary = {
  originalPages: number;
  extractedPages: number;
};

export type ParserSuccessPayload = {
  success: true;
  parserVersion?: string;
  requestId?: string | null;
  quantisData: VyzorData;
  mappedData?: NumericRecord;
  kpis?: NumericRecord;
  confidenceScore: number;
  warnings: string[];
  pdfExtraction?: PdfExtractionSummary | null;
  persistence: {
    saved: boolean;
    analysisId: string | null;
    warning: string | null;
  };
  debugData?: {
    financialData?: unknown;
    mappedData?: NumericRecord;
    kpis?: NumericRecord;
    traces?: unknown;
    diagnostics?: unknown;
    detectedSections?: unknown;
    reconstructedRows?: unknown;
    [key: string]: unknown;
  };
};

export type ParserErrorPayload = {
  success: false;
  error: string;
  detail?: string;
  code?: string;
  pageCount?: number;
  maxPages?: number;
};

export type ParserResponse = ParserSuccessPayload | ParserErrorPayload;

export type ParserProgressPayload = {
  success: true;
  progress: number;
  currentStep: string;
  status: "running" | "completed" | "failed";
  error: string | null;
};

export type ParserHistoryItem = {
  id: string;
  createdAt: string;
  source: "pdf";
  quantisData: VyzorData;
  confidenceScore: number;
  warnings: string[];
};

export type ParserHistoryResponse =
  | {
      success: true;
      analyses: ParserHistoryItem[];
    }
  | {
      success: false;
      error: string;
    };
