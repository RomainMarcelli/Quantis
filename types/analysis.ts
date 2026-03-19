export type SupportedUploadType = "excel" | "pdf";

export type FileDescriptor = {
  name: string;
  mimeType: string;
  size: number;
  type: SupportedUploadType;
};

export type FinancialFacts = {
  revenue: number | null;
  expenses: number | null;
  payroll: number | null;
  treasury: number | null;
  receivables: number | null;
  payables: number | null;
  inventory: number | null;
};

export type ParsedMetric = {
  key: keyof FinancialFacts;
  label: string;
  value: number;
  confidence: "low" | "medium" | "high";
};

export type ParsedFileData = {
  fileName: string;
  fileType: SupportedUploadType;
  extractedAt: string;
  fiscalYear: number | null;
  metrics: ParsedMetric[];
  previewRows: Record<string, string | number | null>[];
};

export type CalculatedKpis = {
  grossMarginRate: number | null;
  netProfit: number | null;
  workingCapital: number | null;
  monthlyBurnRate: number | null;
  cashRunwayMonths: number | null;
  healthScore: number | null;
};

export type AnalysisRecord = {
  id: string;
  userId: string;
  createdAt: string;
  fiscalYear: number | null;
  sourceFiles: FileDescriptor[];
  parsedData: ParsedFileData[];
  financialFacts: FinancialFacts;
  kpis: CalculatedKpis;
};

export type NewAnalysisRecord = Omit<AnalysisRecord, "id">;

