export type QuantisData = {
  ca: number | null;
  totalCharges: number | null;
  netResult: number | null;
  totalAssets: number | null;
  equity: number | null;
  debts: number | null;
};

export type ParserSuccessPayload = {
  success: true;
  quantisData: QuantisData;
  confidenceScore: number;
  warnings: string[];
  persistence: {
    saved: boolean;
    analysisId: string | null;
    warning: string | null;
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
  quantisData: QuantisData;
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
