// File: components/assistant/AssistantConversationsView.tsx
// Role: page Assistant IA — version branchée à l'API IA (mock par défaut,
// Claude réel si la clé est configurée).
//
// Affiche :
//   - une liste des conversations passées (date, KPI, première question,
//     preview de la dernière réponse) — fetchée via /api/ai/conversations,
//   - 5 questions modèles cliquables qui ouvrent l'AiChatPanel,
//   - un état d'accueil quand l'utilisateur n'a pas encore de conversation,
//   - un mode contextuel (?kpi=…&q=…) qui ouvre directement le panel avec
//     la question pré-remplie.
"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, MessageCircle, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import { useAiChat } from "@/components/ai/AiChatProvider";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { useDelayedFlag } from "@/lib/ui/useDelayedFlag";
import type { ConversationSummary } from "@/lib/ai/types";

const GLOBAL_SAMPLE_QUESTIONS: Array<{ kpiId: string | null; question: string }> = [
  { kpiId: "ebitda", question: "Pourquoi mon EBITDA est-il négatif ce trimestre ?" },
  { kpiId: "bfr", question: "Quels leviers prioriser pour faire baisser mon BFR ?" },
  { kpiId: "dso", question: "Mon DSO est anormalement long — par où commencer ?" },
  { kpiId: null, question: "Combien d'euros une hausse de prix de 5 % rapporterait sur mon résultat ?" },
  { kpiId: "healthScore", question: "Ma santé financière s'est-elle améliorée vs l'an dernier ?" },
];

type FetchState = "idle" | "loading" | "ready" | "error" | "unauth";

function AssistantConversationsViewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { open: openChat } = useAiChat();
  const kpiIdParam = searchParams.get("kpi");
  const initialQuestion = searchParams.get("q");

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  // Loader visible uniquement si la requête dépasse 400 ms (cf. hook).
  const showSlowLoader = useDelayedFlag(fetchState === "loading");
  const [quota, setQuota] = useState<{ remaining: number; total: number } | null>(null);
  // Prénom affiché dans le bloc Compte de la sidebar — synchronisé avec
  // l'auth gateway pour rester cohérent entre les pages.
  const [greetingName, setGreetingName] = useState("Utilisateur");

  useEffect(() => {
    let unsub: (() => void) | undefined;
    void (async () => {
      const { firebaseAuthGateway } = await import("@/services/auth");
      unsub = firebaseAuthGateway.subscribe((user) => {
        if (!user) return;
        const first =
          user.displayName?.trim().split(" ")[0] ||
          user.email?.split("@")[0] ||
          "Utilisateur";
        setGreetingName(first);
      });
    })();
    return () => unsub?.();
  }, []);

  const definition = kpiIdParam ? getKpiDefinition(kpiIdParam) : null;

  // Charge la liste des conversations + quota courant.
  const refresh = useCallback(async () => {
    setFetchState("loading");
    try {
      // Import dynamique : la page Assistant IA peut être rendue depuis un
      // contexte de test ou un build SSR — on évite de forcer le chargement
      // des credentials Firebase tant que l'utilisateur ne déclenche pas
      // un appel réseau.
      const { firebaseAuthGateway } = await import("@/services/auth");
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) {
        setFetchState("unauth");
        return;
      }
      const res = await fetch("/api/ai/conversations", {
        headers: { authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        setFetchState("error");
        return;
      }
      const json = (await res.json()) as {
        conversations: ConversationSummary[];
        quota: { remaining: number; used: number; total: number };
      };
      setConversations(json.conversations ?? []);
      setQuota({ remaining: json.quota.remaining, total: json.quota.total });
      setFetchState("ready");
    } catch {
      setFetchState("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Ouverture automatique de l'AiChatPanel si on arrive depuis un tooltip
  // (params ?kpi=...&q=...). Comportement non-bloquant : si l'utilisateur
  // ferme le panel, il atterrit sur la liste normalement.
  useEffect(() => {
    if (kpiIdParam && initialQuestion) {
      openChat({ kpiId: kpiIdParam, initialQuestion });
    } else if (kpiIdParam) {
      openChat({ kpiId: kpiIdParam });
    }
    // On ne déclenche qu'une fois au mount avec les params initiaux.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="w-full space-y-4">
      <AppHeader
        companyName="Assistant IA Vyzor"
        subtitle={
          quota
            ? `${quota.remaining}/${quota.total} questions disponibles aujourd'hui`
            : "Posez vos questions sur vos KPIs"
        }
        actionSlot={
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
        <AppSidebar activeRoute="assistant-ia" accountFirstName={greetingName} />

        <section className="space-y-6">
      {/* Bloc 5 questions modèles — toujours affichées en haut. */}
      <div className="precision-card rounded-2xl border-l-4 border-l-[#C5A059] bg-[#1A1A2E] p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-quantis-gold/40 bg-quantis-gold/10 text-quantis-gold">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-quantis-gold/70">
              {definition ? `Contexte : ${definition.shortLabel}` : "Pour démarrer"}
            </p>
            <h1 className="text-lg font-semibold text-white">
              {definition ? `Discutons de votre ${definition.label}` : "5 questions à poser tout de suite"}
            </h1>
          </div>
        </div>

        <ul className="space-y-2">
          {GLOBAL_SAMPLE_QUESTIONS.map((q) => (
            <li key={q.question}>
              <button
                type="button"
                onClick={() => openChat({ kpiId: q.kpiId, initialQuestion: q.question })}
                className="group flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-quantis-gold/60 hover:bg-quantis-gold/[0.06]"
              >
                <span aria-hidden className="text-quantis-gold/70 group-hover:text-quantis-gold">
                  ✨
                </span>
                <span className="flex-1 text-sm text-white/85 group-hover:text-white">
                  {q.question}
                </span>
                <span className="font-mono text-[10px] uppercase text-quantis-gold/70 opacity-0 transition group-hover:opacity-100">
                  Demander →
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Liste des conversations passées. */}
      <div className="precision-card rounded-2xl bg-[#0F0F12] p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[10px] font-mono uppercase tracking-wider text-white/45">
            Vos conversations
          </p>
          {fetchState === "ready" && conversations.length > 0 && (
            <span className="font-mono text-[10px] text-white/40">
              {conversations.length} discussion{conversations.length > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {fetchState === "loading" && showSlowLoader && (
          <p className="text-sm text-white/55">Chargement de vos conversations...</p>
        )}

        {fetchState === "error" && (
          <p className="text-sm text-rose-300">
            Impossible de récupérer vos conversations. Réessayez dans un instant.
          </p>
        )}

        {fetchState === "unauth" && (
          <p className="text-sm text-white/55">
            Connectez-vous pour retrouver vos conversations.
          </p>
        )}

        {fetchState === "ready" && conversations.length === 0 && (
          <div className="rounded-xl border border-quantis-gold/20 bg-quantis-gold/[0.04] p-6 text-center">
            <Sparkles className="mx-auto mb-3 h-6 w-6 text-quantis-gold/70" />
            <p className="text-sm font-medium text-white">
              Posez votre première question en cliquant sur l&apos;icône IA ✨ de n&apos;importe quel indicateur.
            </p>
            <p className="mt-2 text-xs text-white/60">
              Ou cliquez sur l&apos;une des questions modèles ci-dessus.
            </p>
          </div>
        )}

        {fetchState === "ready" && conversations.length > 0 && (
          <ul className="space-y-2">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <button
                  type="button"
                  onClick={() =>
                    openChat({
                      kpiId: conv.kpiId,
                      conversationId: conv.id,
                      // Les messages eux-mêmes seront chargés à l'ouverture
                      // (pour l'instant on les laisse vides, le panel les
                      // pousse au fil des nouveaux tours).
                    })
                  }
                  className="flex w-full items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-quantis-gold/40 hover:bg-quantis-gold/[0.05]"
                >
                  <span className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-quantis-gold/30 bg-quantis-gold/10 text-quantis-gold">
                    <MessageCircle className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-white">
                        {conv.title}
                      </span>
                      {conv.kpiId && (
                        <span className="flex-shrink-0 rounded-full border border-quantis-gold/30 bg-quantis-gold/[0.08] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-quantis-gold/80">
                          {getKpiDefinition(conv.kpiId)?.shortLabel ?? conv.kpiId}
                        </span>
                      )}
                    </span>
                    {conv.lastAnswerPreview && (
                      <span className="mt-1 block line-clamp-2 text-xs text-white/55">
                        {conv.lastAnswerPreview}
                      </span>
                    )}
                    <span className="mt-1.5 block font-mono text-[10px] text-white/40">
                      {formatRelativeDate(conv.lastMessageAt)} · {conv.messageCount} message
                      {conv.messageCount > 1 ? "s" : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
        </section>
      </div>
    </section>
  );
}

/**
 * Formatte une date en relatif court (aujourd'hui / hier / il y a N jours)
 * pour la liste — plus lisible qu'une date absolue dans une vue dense.
 */
function formatRelativeDate(timestampMs: number): string {
  const now = Date.now();
  const diffDays = Math.floor((now - timestampMs) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} semaines`;
  const date = new Date(timestampMs);
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function AssistantConversationsView() {
  return (
    <Suspense
      fallback={
        <div className="precision-card mx-auto max-w-4xl rounded-2xl p-8 text-sm text-white/55">
          Chargement...
        </div>
      }
    >
      <AssistantConversationsViewInner />
    </Suspense>
  );
}
