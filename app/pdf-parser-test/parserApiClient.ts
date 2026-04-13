import type {
  ParserErrorPayload,
  ParserHistoryResponse,
  ParserProgressPayload,
  ParserResponse,
  ParserSuccessPayload
} from "./types";

export type UploadResult = {
  statusCode: number;
  payload: ParserResponse;
};

const UPLOAD_TIMEOUT_MS = 120_000;

export async function uploadPdfWithProgress(input: {
  idToken: string;
  formData: FormData;
  onUploadProgress: (event: ProgressEvent<EventTarget>) => void;
}): Promise<UploadResult> {
  const { idToken, formData, onUploadProgress } = input;

  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/pdf-parser");
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader("Authorization", `Bearer ${idToken}`);
    xhr.upload.onprogress = onUploadProgress;

    xhr.onerror = () => {
      reject(new Error("Connexion reseau impossible pendant l'upload PDF."));
    };

    xhr.ontimeout = () => {
      reject(new Error("Le traitement du parser prend trop de temps. Reessayez."));
    };

    xhr.onload = () => {
      const statusCode = xhr.status;
      const responseText = typeof xhr.responseText === "string" ? xhr.responseText : "";
      const contentType = xhr.getResponseHeader("content-type");
      const payload = parseParserApiPayload({
        statusCode,
        responseText,
        contentType
      });

      resolve({
        statusCode,
        payload
      });
    };

    xhr.send(formData);
  });
}

export async function fetchProgressSnapshot(
  idToken: string,
  requestId: string
): Promise<ParserProgressPayload | null> {
  try {
    const response = await fetch(`/api/pdf-parser?requestId=${encodeURIComponent(requestId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`
      },
      cache: "no-store"
    });

    if (!response.ok) {
      debugLog("Progress polling non-ok response", {
        status: response.status
      });
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      debugLog("Progress polling returned non-json content-type", {
        contentType
      });
      return null;
    }

    const text = await response.text();
    const parsed = safeParseJson(text);
    if (!isParserProgressPayload(parsed)) {
      debugLog("Progress polling returned invalid payload", {
        textSnippet: text.slice(0, 180)
      });
      return null;
    }

    return parsed;
  } catch (error) {
    debugLog("Progress polling network error", {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

export async function fetchParserHistory(idToken: string): Promise<ParserHistoryResponse> {
  const response = await fetch("/api/pdf-parser", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${idToken}`
    },
    cache: "no-store"
  });

  const statusCode = response.status;
  const contentType = response.headers.get("content-type");
  const responseText = await response.text();
  const parsed = parseJsonWhenPossible(responseText, contentType);

  if (isParserHistoryResponse(parsed)) {
    return parsed;
  }

  const fallback = buildFallbackErrorPayload({
    statusCode,
    contentType,
    responseText
  });

  return {
    success: false,
    error: fallback.detail ?? fallback.error
  };
}

type ParseParserApiPayloadInput = {
  statusCode: number;
  responseText: string;
  contentType: string | null;
};

function parseParserApiPayload(input: ParseParserApiPayloadInput): ParserResponse {
  const { statusCode, responseText, contentType } = input;

  const parsed = parseJsonWhenPossible(responseText, contentType);
  if (isParserResponse(parsed)) {
    return parsed;
  }

  return buildFallbackErrorPayload({
    statusCode,
    contentType,
    responseText
  });
}

function parseJsonWhenPossible(responseText: string, contentType: string | null): unknown {
  const trimmed = responseText.trim();
  if (!trimmed) {
    return null;
  }

  const hasJsonContentType = (contentType ?? "").toLowerCase().includes("application/json");
  const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[");

  if (!hasJsonContentType && !looksLikeJson) {
    return null;
  }

  return safeParseJson(trimmed);
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildFallbackErrorPayload(input: {
  statusCode: number;
  contentType: string | null;
  responseText: string;
}): ParserErrorPayload {
  const { statusCode, contentType, responseText } = input;
  const genericError = mapHttpStatusToUserError(statusCode);
  const responseTrimmed = responseText.trim();

  if (!responseTrimmed) {
    return {
      success: false,
      error: genericError,
      detail: `Reponse vide du serveur (HTTP ${statusCode}).`
    };
  }

  const isHtml = (contentType ?? "").toLowerCase().includes("text/html") || responseTrimmed.startsWith("<!DOCTYPE") || responseTrimmed.startsWith("<html");
  if (isHtml) {
    return {
      success: false,
      error: genericError,
      detail: `Le serveur a retourne du HTML au lieu de JSON (HTTP ${statusCode}).`
    };
  }

  return {
    success: false,
    error: genericError,
    detail: `Format de reponse non conforme (HTTP ${statusCode}).`
  };
}

function mapHttpStatusToUserError(statusCode: number): string {
  if (statusCode === 401) {
    return "Session invalide. Reconnectez-vous puis relancez le parser.";
  }
  if (statusCode === 403) {
    return "Acces refuse au parser PDF pour cet utilisateur.";
  }
  if (statusCode === 404) {
    return "Endpoint parser introuvable. Verifiez la route API.";
  }
  if (statusCode >= 500) {
    return "Serveur parser indisponible temporairement.";
  }
  if (statusCode <= 0) {
    return "Erreur reseau lors de l'appel au parser PDF.";
  }
  return `Echec du parser PDF (HTTP ${statusCode}).`;
}

function isParserResponse(value: unknown): value is ParserResponse {
  return isParserSuccessPayload(value) || isParserErrorPayload(value);
}

function isParserSuccessPayload(value: unknown): value is ParserSuccessPayload {
  if (!isRecord(value)) {
    return false;
  }

  const persistence = value.persistence;
  const quantisData = value.quantisData;

  return (
    value.success === true &&
    isRecord(quantisData) &&
    isNullableNumber(quantisData.ca) &&
    isNullableNumber(quantisData.totalCharges) &&
    isNullableNumber(quantisData.netResult) &&
    isNullableNumber(quantisData.totalAssets) &&
    isNullableNumber(quantisData.equity) &&
    isNullableNumber(quantisData.debts) &&
    typeof value.confidenceScore === "number" &&
    Number.isFinite(value.confidenceScore) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((item) => typeof item === "string") &&
    isRecord(persistence) &&
    typeof persistence.saved === "boolean" &&
    (typeof persistence.analysisId === "string" || persistence.analysisId === null) &&
    (typeof persistence.warning === "string" || persistence.warning === null) &&
    (value.mappedData === undefined || isNullableNumberRecord(value.mappedData)) &&
    (value.kpis === undefined || isNullableNumberRecord(value.kpis))
  );
}

function isParserErrorPayload(value: unknown): value is ParserErrorPayload {
  if (!isRecord(value)) {
    return false;
  }

  return value.success === false && typeof value.error === "string";
}

function isParserProgressPayload(value: unknown): value is ParserProgressPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.success === true &&
    typeof value.progress === "number" &&
    Number.isFinite(value.progress) &&
    typeof value.currentStep === "string" &&
    (value.status === "running" || value.status === "completed" || value.status === "failed") &&
    (typeof value.error === "string" || value.error === null)
  );
}

function isParserHistoryResponse(value: unknown): value is ParserHistoryResponse {
  if (!isRecord(value)) {
    return false;
  }

  if (value.success === false && typeof value.error === "string") {
    return true;
  }

  if (value.success !== true || !Array.isArray(value.analyses)) {
    return false;
  }

  return value.analyses.every((analysis) => {
    if (!isRecord(analysis)) {
      return false;
    }

    return (
      typeof analysis.id === "string" &&
      typeof analysis.createdAt === "string" &&
      analysis.source === "pdf" &&
      isRecord(analysis.quantisData) &&
      isNullableNumber(analysis.quantisData.ca) &&
      isNullableNumber(analysis.quantisData.totalCharges) &&
      isNullableNumber(analysis.quantisData.netResult) &&
      isNullableNumber(analysis.quantisData.totalAssets) &&
      isNullableNumber(analysis.quantisData.equity) &&
      isNullableNumber(analysis.quantisData.debts) &&
      typeof analysis.confidenceScore === "number" &&
      Number.isFinite(analysis.confidenceScore) &&
      Array.isArray(analysis.warnings) &&
      analysis.warnings.every((item) => typeof item === "string")
    );
  });
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableNumberRecord(value: unknown): value is Record<string, number | null> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((item) => isNullableNumber(item));
}

function debugLog(message: string, data: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  console.debug(`[pdf-parser-client] ${message}`, data);
}
