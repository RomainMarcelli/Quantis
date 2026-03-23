// lib/server/securityAudit.ts
// Centralise le journal d'audit sécurité (Firestore Admin) avec contexte IP, userId et horodatage.
import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";

type SecurityAuditSource = "api" | "client" | "middleware";

type SecurityAuditEventInput = {
  eventType: string;
  source: SecurityAuditSource;
  route?: string;
  method?: string;
  statusCode?: number;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  message?: string;
  metadata?: Record<string, unknown>;
};

const SECURITY_AUDIT_COLLECTION = "security_audit_logs";
const MAX_MESSAGE_LENGTH = 400;
const DELETE_BATCH_SIZE = 400;

export async function safeLogSecurityEvent(event: SecurityAuditEventInput): Promise<void> {
  try {
    await logSecurityEvent(event);
  } catch (error) {
    // Le logging ne doit jamais casser le flux métier principal.
    console.error("[security-audit] impossible d'enregistrer l'événement", error);
  }
}

export async function safeLogSecurityEventFromRequest(
  request: NextRequest,
  event: Omit<SecurityAuditEventInput, "ipAddress" | "userAgent" | "route" | "method">
): Promise<void> {
  await safeLogSecurityEvent({
    ...event,
    route: request.nextUrl.pathname,
    method: request.method,
    ipAddress: extractClientIpFromHeaders({
      forwardedFor: request.headers.get("x-forwarded-for"),
      realIp: request.headers.get("x-real-ip")
    }),
    userAgent: normalizeString(request.headers.get("user-agent"), 300)
  });
}

export async function logHttpSecurityErrorFromRequest(
  request: NextRequest,
  input: {
    statusCode: 401 | 403 | 429;
    eventType: string;
    userId?: string | null;
    message?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  // Helper dédié pour tracer les erreurs de sécurité HTTP sensibles.
  await safeLogSecurityEventFromRequest(request, {
    source: "api",
    eventType: input.eventType,
    statusCode: input.statusCode,
    userId: input.userId ?? null,
    message: input.message,
    metadata: input.metadata
  });
}

type DeleteSecurityAuditLogsResult = {
  deletedCount: number;
  batchCount: number;
};

export async function deleteAllSecurityAuditLogs(): Promise<DeleteSecurityAuditLogsResult> {
  const db = getFirebaseAdminFirestore();
  let deletedCount = 0;
  let batchCount = 0;

  // Suppression en lots pour respecter la limite Firestore (<= 500 ops par batch).
  while (true) {
    const snapshot = await db
      .collection(SECURITY_AUDIT_COLLECTION)
      .orderBy("__name__")
      .limit(DELETE_BATCH_SIZE)
      .get();

    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach((docSnapshot) => {
      batch.delete(docSnapshot.ref);
    });
    await batch.commit();

    deletedCount += snapshot.size;
    batchCount += 1;

    // Si moins que la taille max, on a terminé.
    if (snapshot.size < DELETE_BATCH_SIZE) {
      break;
    }
  }

  return {
    deletedCount,
    batchCount
  };
}

async function logSecurityEvent(event: SecurityAuditEventInput): Promise<void> {
  const db = getFirebaseAdminFirestore();
  const payload = {
    eventType: normalizeRequiredString(event.eventType),
    source: event.source,
    route: normalizeString(event.route, 200),
    method: normalizeString(event.method, 16),
    statusCode: typeof event.statusCode === "number" ? event.statusCode : null,
    userId: normalizeNullableUserId(event.userId),
    ipAddress: normalizeString(event.ipAddress, 100),
    userAgent: normalizeString(event.userAgent, 300),
    message: normalizeString(event.message, MAX_MESSAGE_LENGTH),
    metadata: sanitizeSecurityMetadata(event.metadata ?? {}),
    createdAt: FieldValue.serverTimestamp()
  };

  await db.collection(SECURITY_AUDIT_COLLECTION).add(payload);
}

function normalizeRequiredString(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("security audit eventType manquant.");
  }
  return normalized.slice(0, 120);
}

function normalizeNullableUserId(userId: string | null | undefined): string | null {
  if (!userId) {
    return null;
  }
  const normalized = userId.trim();
  return normalized ? normalized.slice(0, 200) : null;
}

function normalizeString(value: string | null | undefined, maxLength: number): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, maxLength);
}

export function extractClientIpFromHeaders(input: {
  forwardedFor?: string | null;
  realIp?: string | null;
}): string | null {
  // x-forwarded-for contient possiblement plusieurs IPs: on prend la première.
  if (input.forwardedFor) {
    const firstIp = input.forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp.slice(0, 100);
    }
  }

  if (input.realIp) {
    const normalizedRealIp = input.realIp.trim();
    if (normalizedRealIp) {
      return normalizedRealIp.slice(0, 100);
    }
  }

  return null;
}

export function sanitizeSecurityMetadata(value: unknown, depth = 0): unknown {
  // Garde-fou pour éviter un payload énorme / récursif.
  if (depth > 3) {
    return "[depth-limit]";
  }

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value.slice(0, 200);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeSecurityMetadata(item, depth + 1));
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const entries = Object.entries(objectValue).slice(0, 30);
    return Object.fromEntries(
      entries.map(([key, entryValue]) => [key.slice(0, 60), sanitizeSecurityMetadata(entryValue, depth + 1)])
    );
  }

  return String(value).slice(0, 200);
}

export function isValidCronAuthorization(
  authorizationHeader: string | null,
  cronSecret: string | undefined
): boolean {
  if (!cronSecret) {
    return false;
  }

  const expectedHeader = `Bearer ${cronSecret}`;
  return authorizationHeader === expectedHeader;
}
