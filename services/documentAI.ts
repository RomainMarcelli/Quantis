import { DocumentProcessorServiceClient } from "@google-cloud/documentai";

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

type SerializedDocument = {
  text?: string;
  pages?: Array<Record<string, unknown> & { tables?: Record<string, unknown>[] }>;
  entities?: Record<string, unknown>[];
};

const REQUIRED_ENV_KEYS = ["DOCUMENT_AI_PROJECT_ID", "DOCUMENT_AI_LOCATION", "DOCUMENT_AI_PROCESSOR_ID"] as const;

let cachedDocumentAIClient: DocumentProcessorServiceClient | null = null;

export async function processPdfWithDocumentAI(
  input: ProcessPdfWithDocumentAIInput
): Promise<DocumentAIExtractionResult> {
  const { pdfBuffer, fileName, mimeType } = input;
  const processorName = getDocumentAIProcessorName();
  const client = getDocumentAIClient();

  const [response] = await client.processDocument({
    name: processorName,
    rawDocument: {
      content: pdfBuffer.toString("base64"),
      mimeType
    }
  });

  const serializedDocument = serializeDocument(response.document);
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

function serializeDocument(document: unknown): SerializedDocument {
  if (!document) {
    return {};
  }

  return JSON.parse(JSON.stringify(document)) as SerializedDocument;
}
