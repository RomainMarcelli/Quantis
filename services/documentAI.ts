import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
import { PDFParse } from "pdf-parse";

export type DocumentAIExtractionResult = {
  rawText: string;
  pages: Record<string, unknown>[];
  entities: Record<string, unknown>[];
  tables: Record<string, unknown>[];
};

type ProcessPdfWithDocumentAIInput = {
  pdfBuffer: Buffer;
  fileName: string;
  mimeType: string;
};

export type PdfPageLimitExceededError = Error & {
  code: "PDF_PAGE_LIMIT_EXCEEDED";
  maxPages: number;
  pageCount: number;
  source: "precheck" | "document-ai";
};

type SerializedDocument = {
  text?: string;
  pages?: Array<Record<string, unknown> & { tables?: Record<string, unknown>[] }>;
  entities?: Record<string, unknown>[];
};

const REQUIRED_ENV_KEYS = ["DOCUMENT_AI_PROJECT_ID", "DOCUMENT_AI_LOCATION", "DOCUMENT_AI_PROCESSOR_ID"] as const;
const DEFAULT_DOCUMENT_AI_SYNC_PAGE_LIMIT = 30;

let cachedDocumentAIClient: DocumentProcessorServiceClient | null = null;

export async function processPdfWithDocumentAI(
  input: ProcessPdfWithDocumentAIInput
): Promise<DocumentAIExtractionResult> {
  const { pdfBuffer, fileName, mimeType } = input;
  const processorName = getDocumentAIProcessorName();
  const client = getDocumentAIClient();
  const maxPages = getDocumentAISyncPageLimit();
  const precheckedPageCount = await tryGetPdfPageCount(pdfBuffer);

  if (precheckedPageCount !== null && precheckedPageCount > maxPages) {
    throw createPdfPageLimitExceededError({
      maxPages,
      pageCount: precheckedPageCount,
      source: "precheck"
    });
  }

  let responseDocument: unknown;
  try {
    const [response] = await client.processDocument({
      name: processorName,
      rawDocument: {
        content: pdfBuffer.toString("base64"),
        mimeType
      }
    });
    responseDocument = response.document;
  } catch (error) {
    const pageLimitContext = parseDocumentAiPageLimitError(error);
    if (pageLimitContext) {
      throw createPdfPageLimitExceededError({
        maxPages: pageLimitContext.maxPages,
        pageCount: pageLimitContext.pageCount,
        source: "document-ai"
      });
    }
    throw error;
  }

  const serializedDocument = serializeDocument(responseDocument);
  const rawText = serializedDocument.text ?? "";
  const pages = serializedDocument.pages ?? [];
  const entities = serializedDocument.entities ?? [];
  const tables = pages.flatMap((page) => page.tables ?? []);

  console.info("[document-ai] PDF processed", {
    processorName,
    fileName,
    mimeType,
    fileSizeBytes: pdfBuffer.byteLength,
    rawTextLength: rawText.length,
    pagesCount: pages.length,
    entitiesCount: entities.length,
    tablesCount: tables.length
  });

  if (process.env.DOCUMENT_AI_DEBUG_STRUCTURE === "true") {
    console.info("[document-ai] Structure snapshot", {
      documentKeys: Object.keys(serializedDocument),
      firstPageKeys: Object.keys(pages[0] ?? {}),
      firstEntityKeys: Object.keys(entities[0] ?? {}),
      firstTableKeys: Object.keys(tables[0] ?? {})
    });
  }

  return {
    rawText,
    pages,
    entities,
    tables
  };
}

export function isPdfPageLimitExceededError(error: unknown): error is PdfPageLimitExceededError {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as Partial<PdfPageLimitExceededError>;
  return (
    candidate.code === "PDF_PAGE_LIMIT_EXCEEDED" &&
    typeof candidate.maxPages === "number" &&
    Number.isFinite(candidate.maxPages) &&
    typeof candidate.pageCount === "number" &&
    Number.isFinite(candidate.pageCount)
  );
}

function getDocumentAIClient(): DocumentProcessorServiceClient {
  if (cachedDocumentAIClient) {
    return cachedDocumentAIClient;
  }

  const location = getRequiredDocumentAIEnv("DOCUMENT_AI_LOCATION");
  const clientEmail = process.env.DOCUMENT_AI_CLIENT_EMAIL?.trim();
  const privateKey = process.env.DOCUMENT_AI_PRIVATE_KEY?.replace(/\\n/g, "\n");

  cachedDocumentAIClient = new DocumentProcessorServiceClient({
    apiEndpoint: `${location}-documentai.googleapis.com`,
    ...(clientEmail && privateKey
      ? {
          credentials: {
            client_email: clientEmail,
            private_key: privateKey
          }
        }
      : {})
  });

  return cachedDocumentAIClient;
}

function getDocumentAIProcessorName(): string {
  const projectId = getRequiredDocumentAIEnv("DOCUMENT_AI_PROJECT_ID");
  const location = getRequiredDocumentAIEnv("DOCUMENT_AI_LOCATION");
  const processorId = getRequiredDocumentAIEnv("DOCUMENT_AI_PROCESSOR_ID");

  return `projects/${projectId}/locations/${location}/processors/${processorId}`;
}

function getRequiredDocumentAIEnv(name: (typeof REQUIRED_ENV_KEYS)[number]): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing server env var: ${name}`);
  }
  return value;
}

function getDocumentAISyncPageLimit(): number {
  const rawValue = process.env.DOCUMENT_AI_SYNC_PAGE_LIMIT?.trim();
  if (!rawValue) {
    return DEFAULT_DOCUMENT_AI_SYNC_PAGE_LIMIT;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_DOCUMENT_AI_SYNC_PAGE_LIMIT;
  }

  return parsed;
}

async function tryGetPdfPageCount(pdfBuffer: Buffer): Promise<number | null> {
  const parser = new PDFParse({
    data: new Uint8Array(pdfBuffer)
  });

  try {
    const info = await parser.getInfo();
    if (typeof info.total === "number" && Number.isFinite(info.total) && info.total > 0) {
      return info.total;
    }
    return null;
  } catch (error) {
    console.warn("[document-ai] PDF page precheck failed", {
      detail: error instanceof Error ? error.message : String(error)
    });
    return null;
  } finally {
    await parser.destroy();
  }
}

function parseDocumentAiPageLimitError(error: unknown): { maxPages: number; pageCount: number } | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/Document pages exceed the limit:\s*(\d+)\s*got\s*(\d+)/i);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  const maxPages = Number.parseInt(match[1], 10);
  const pageCount = Number.parseInt(match[2], 10);
  if (!Number.isFinite(maxPages) || !Number.isFinite(pageCount)) {
    return null;
  }

  return {
    maxPages,
    pageCount
  };
}

function createPdfPageLimitExceededError(input: {
  maxPages: number;
  pageCount: number;
  source: "precheck" | "document-ai";
}): PdfPageLimitExceededError {
  const { maxPages, pageCount, source } = input;
  const error = new Error(
    `Le PDF contient ${pageCount} pages, au-dela de la limite synchrone Document AI (${maxPages} pages).`
  ) as PdfPageLimitExceededError;
  error.code = "PDF_PAGE_LIMIT_EXCEEDED";
  error.maxPages = maxPages;
  error.pageCount = pageCount;
  error.source = source;
  return error;
}

function serializeDocument(document: unknown): SerializedDocument {
  if (!document) {
    return {};
  }

  return JSON.parse(JSON.stringify(document)) as SerializedDocument;
}
