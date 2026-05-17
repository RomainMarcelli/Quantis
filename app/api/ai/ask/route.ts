// File: app/api/ai/ask/route.ts
// Role: endpoint POST /api/ai/ask — point d'entrée unique de l'assistant.
//
// Body attendu : { question, kpiId?, analysisId?, conversationId?, userLevel? }
// Auth        : header Authorization: Bearer <Firebase ID token>.
// Vérifie    : ownership de l'analyse (si analysisId fourni).
// Rate limit : 20 appels/jour/user (Firestore ai_usage).
//
// Réponse :
//   { answer, conversationId, remainingQuota, mode }
//
// ─── Pourquoi un seul endpoint pour create + addMessage ───────────────
//
// Le client n'a pas à savoir si une conversation existe ou pas — il envoie
// `conversationId?` (vide pour une nouvelle question, sinon l'id pour
// continuer). Le serveur fait la branche. Ça simplifie le client.

import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { enforceRouteRateLimit } from "@/lib/server/rateLimit";
import { resolveCompanyContext } from "@/services/auth/resolveCompanyContext";
import { CompanyAccessError } from "@/services/auth/requireCompanyAccess";
import { getAiService } from "@/lib/ai/aiService";
import {
  addMessage,
  createConversation,
  getConversation,
} from "@/lib/ai/chatStore";
import { consumeDailyQuota } from "@/lib/ai/rateLimit";
import type { AnalysisRecord } from "@/types/analysis";
import type { UserLevel } from "@/lib/ai/types";

export const runtime = "nodejs";

type AskBody = {
  question?: unknown;
  kpiId?: unknown;
  /** Valeur courante du KPI fournie par le front quand l'analyse n'est pas
   *  contextualisée (analysisId absent). Permet au mock de répondre avec une
   *  vraie valeur même hors page d'analyse. */
  kpiValue?: unknown;
  analysisId?: unknown;
  conversationId?: unknown;
  userLevel?: unknown;
  /** Sprint A multi-tenant — optionnel. Si fourni, on valide l'accès
   *  via requireCompanyAccess. Sinon, fallback rétrocompat sur la 1re
   *  Company du user. Le mode est loggé pour mesurer la migration. */
  companyId?: unknown;
};

function isUserLevel(v: unknown): v is UserLevel {
  return v === "beginner" || v === "intermediate" || v === "expert";
}

export async function POST(request: NextRequest) {
  // Garde-fou d'IP/process pour limiter les abus avant même de payer un read
  // Firestore : 60 appels/min par client, suffisant pour 1 utilisateur normal
  // mais coupe les bots/floods.
  const burst = enforceRouteRateLimit(request, {
    routeId: "api-ai-ask-burst",
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (burst) return burst;

  let userId: string;
  try {
    userId = await requireAuthenticatedUser(request);
  } catch (err) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  let body: AskBody;
  try {
    body = (await request.json()) as AskBody;
  } catch {
    return NextResponse.json({ error: "Body JSON invalide." }, { status: 400 });
  }

  // Sprint A multi-tenant — résolution du contexte Company. Pour /ai/ask
  // qui ne touche pas directement les données comptables, on se contente
  // de valider l'accès si companyId fourni. Pas bloquant si rien fourni
  // (fallback rétrocompat sur la 1re Company du user).
  const companyIdHint =
    typeof body.companyId === "string" ? body.companyId.trim() : null;
  try {
    await resolveCompanyContext(userId, companyIdHint);
  } catch (err) {
    if (err instanceof CompanyAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json(
      { error: "Le champ `question` est obligatoire." },
      { status: 400 }
    );
  }
  if (question.length > 2000) {
    return NextResponse.json(
      { error: "Question trop longue (max 2000 caractères)." },
      { status: 400 }
    );
  }

  const kpiId = typeof body.kpiId === "string" && body.kpiId ? body.kpiId : null;
  const kpiValue =
    typeof body.kpiValue === "number" && Number.isFinite(body.kpiValue)
      ? body.kpiValue
      : null;
  const analysisId =
    typeof body.analysisId === "string" && body.analysisId ? body.analysisId : null;
  const conversationId =
    typeof body.conversationId === "string" && body.conversationId
      ? body.conversationId
      : null;
  const userLevel: UserLevel = isUserLevel(body.userLevel)
    ? body.userLevel
    : "intermediate";

  // ── Quota quotidien ──────────────────────────────────────────────────
  const quota = await consumeDailyQuota(userId);
  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: "Quota quotidien atteint (20 questions par jour).",
        remainingQuota: 0,
      },
      { status: 429 }
    );
  }

  // ── Récupération de l'analyse (ownership vérifié au passage) ────────
  let analysis: AnalysisRecord | null = null;
  if (analysisId) {
    try {
      analysis = await fetchAnalysisOwnedBy(userId, analysisId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Analyse inaccessible.";
      return NextResponse.json({ error: message }, { status: 403 });
    }
  }

  // ── Historique éventuel ─────────────────────────────────────────────
  let history: { role: "user" | "assistant"; content: string; timestamp: number }[] = [];
  if (conversationId) {
    const existing = await getConversation(userId, conversationId);
    if (!existing) {
      return NextResponse.json(
        { error: "Conversation introuvable." },
        { status: 404 }
      );
    }
    history = existing.messages;
  }

  // ── Appel IA (mock ou Claude selon l'env) ───────────────────────────
  // On passe kpiValue en override : le mock l'utilisera directement plutôt
  // que de chercher dans `analysis.kpis` (utile quand le front a la valeur
  // mais pas l'analysisId, p.ex. tooltip dans un widget hors page d'analyse).
  const ai = getAiService();
  const aiResponse = await ai.ask({
    question,
    kpiId,
    kpiValue,
    analysis,
    userLevel,
    history,
  });

  // ── Persistance ─────────────────────────────────────────────────────
  let resolvedConversationId: string;
  if (conversationId) {
    await addMessage({
      userId,
      conversationId,
      question,
      answer: aiResponse.answer,
    });
    resolvedConversationId = conversationId;
  } else {
    const created = await createConversation({
      userId,
      kpiId,
      question,
      answer: aiResponse.answer,
    });
    resolvedConversationId = created.id;
  }

  return NextResponse.json({
    answer: aiResponse.answer,
    structured: aiResponse.structured ?? null,
    conversationId: resolvedConversationId,
    remainingQuota: quota.remaining,
    mode: aiResponse.mode,
  });
}

/**
 * Charge l'analyse depuis Firestore et vérifie qu'elle appartient bien à
 * l'utilisateur authentifié. Lève si le doc n'existe pas ou si l'ownership
 * échoue.
 */
async function fetchAnalysisOwnedBy(
  userId: string,
  analysisId: string
): Promise<AnalysisRecord> {
  const snap = await getFirebaseAdminFirestore()
    .collection("analyses")
    .doc(analysisId)
    .get();
  if (!snap.exists) {
    throw new Error("Analyse introuvable.");
  }
  const data = snap.data() as AnalysisRecord & { userId?: string };
  if (data.userId !== userId) {
    throw new Error("Cette analyse ne vous appartient pas.");
  }
  return { ...data, id: snap.id };
}
