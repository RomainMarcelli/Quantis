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
import { consumeDailyQuota, getNextResetISO } from "@/lib/ai/rateLimit";
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
        error: "QUOTA_EXCEEDED",
        message:
          "Quota quotidien atteint (50 questions par jour). Réinitialisation à minuit (Europe/Paris).",
        remainingQuota: 0,
        resetAt: getNextResetISO(),
      },
      { status: 429 }
    );
  }

  // ── Récupération de l'analyse (ownership vérifié au passage) ────────
  //
  // 1) Si `analysisId` est fourni explicitement (question posée depuis une
  //    page d'analyse), on charge cette analyse-là après check d'ownership.
  // 2) Sinon (chat libre, carte KPI cliquée hors page d'analyse, etc.) on
  //    charge automatiquement la DERNIÈRE analyse du user comme contexte
  //    par défaut. Évite que Claude réponde "je n'ai pas vos données" alors
  //    que l'utilisateur a déjà importé un fichier — l'assistant doit savoir
  //    raisonner sur les chiffres réels par défaut. Si aucune analyse en BDD,
  //    on tombe en mode dégradé (kpiValue seul, déjà géré par promptBuilder).
  let analysis: AnalysisRecord | null = null;
  if (analysisId) {
    try {
      analysis = await fetchAnalysisOwnedBy(userId, analysisId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Analyse inaccessible.";
      return NextResponse.json({ error: message }, { status: 403 });
    }
  } else {
    analysis = await fetchLatestAnalysisForUser(userId);
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

  // ── Appel IA en streaming SSE ───────────────────────────────────────
  //
  // Le quota a déjà été consommé ci-dessus (atomique) — on ne re-décrémente
  // pas en cas d'échec stream. La persistance Firestore se fait UNIQUEMENT
  // à la fin du stream (event `done`), pour éviter d'enregistrer des
  // réponses tronquées si le stream est abandonné.
  //
  // Pattern SSE :
  //   event: meta   → { conversationId, remainingQuota }
  //   event: chunk  → { text }                (n fois)
  //   event: done   → { conversationId, structured: null }
  //   event: error  → { error }
  const encoder = new TextEncoder();
  const ai = getAiService();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      try {
        send("meta", {
          conversationId: conversationId ?? null,
          remainingQuota: quota.remaining,
        });

        let fullAnswer = "";
        for await (const chunk of ai.askStream({
          question,
          kpiId,
          kpiValue,
          analysis,
          userLevel,
          history,
        })) {
          fullAnswer += chunk;
          send("chunk", { text: chunk });
        }

        // ── Persistance — uniquement à la fin du stream ───────────────
        let resolvedConversationId: string;
        if (conversationId) {
          await addMessage({
            userId,
            conversationId,
            question,
            answer: fullAnswer,
          });
          resolvedConversationId = conversationId;
        } else {
          const created = await createConversation({
            userId,
            kpiId,
            question,
            answer: fullAnswer,
          });
          resolvedConversationId = created.id;
        }

        send("done", {
          conversationId: resolvedConversationId,
          // Le front reconstruit le structuré via buildStructuredFromMarkdown.
          structured: null,
        });
        controller.close();
      } catch (error) {
        console.error("[ai/ask] stream failed", error);
        send("error", {
          error: error instanceof Error ? error.message : "Erreur inconnue.",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Désactive le buffering reverse-proxy (Nginx, certains LB).
      "X-Accel-Buffering": "no",
    },
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

/**
 * Charge la DERNIÈRE analyse du user (par `createdAt` desc) — utilisé comme
 * contexte par défaut quand le front n'envoie pas d'`analysisId` explicite.
 *
 * On évite volontairement `orderBy("createdAt", "desc").limit(1)` parce que
 * Firestore exige un index composite `userId asc + createdAt desc` pour cette
 * combinaison. Au lieu de devoir déployer un index pour une simple lecture,
 * on filtre par `userId` (single-field, indexé par défaut) et on trie en
 * mémoire. Pour des volumes typiques (<100 analyses/user), le coût est
 * négligeable et la robustesse en dev (pas d'index à créer) est meilleure.
 *
 * Retourne null si l'utilisateur n'a aucune analyse en BDD. Log explicite si
 * la query elle-même échoue — comme ça on voit dans le terminal dev server
 * pourquoi le contexte n'a pas été chargé.
 */
async function fetchLatestAnalysisForUser(
  userId: string
): Promise<AnalysisRecord | null> {
  try {
    const snap = await getFirebaseAdminFirestore()
      .collection("analyses")
      .where("userId", "==", userId)
      .get();
    if (snap.empty) {
      console.log("[ai/ask] no analysis found for user", userId);
      return null;
    }
    const docs = snap.docs
      .map((d) => ({ id: d.id, data: d.data() as AnalysisRecord }))
      .sort((a, b) => {
        const ca = String(a.data.createdAt ?? "");
        const cb = String(b.data.createdAt ?? "");
        return cb.localeCompare(ca);
      });
    const latest = docs[0]!;
    console.log(
      `[ai/ask] loaded latest analysis for user ${userId}: id=${latest.id}, createdAt=${latest.data.createdAt}`
    );
    return { ...latest.data, id: latest.id };
  } catch (err) {
    console.error("[ai/ask] fetchLatestAnalysisForUser FAILED", err);
    return null;
  }
}
