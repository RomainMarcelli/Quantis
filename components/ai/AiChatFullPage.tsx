// File: components/ai/AiChatFullPage.tsx
// Role: vue plein écran de l'assistant IA (style ChatGPT/Claude/Perplexity).
// Remplace le tiroir latéral `AiChatPanel`. Pensée pour être montée dans une
// page Next (sous l'AppSidebar) afin que l'utilisateur garde la navigation
// principale toujours visible — pas d'effet "sortie sans retour".
//
// Layout :
//   - Conteneur centré, max-width ~720 px (lecture confortable)
//   - Conversation au-dessus, input bar STICKY en bas
//   - Police Inter, marges latérales larges
//   - Pas de glassmorphism — fond uni cohérent avec le reste de l'app
//
// Stateless côté URL : la page parent passe `kpiId`, `initialQuestion`, etc.
// via props. La conversation ID survit en local au sein de la page (Firestore
// persiste côté serveur).
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Lightbulb,
  MessageSquarePlus,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  Timer,
  TrendingDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import { getUserLevel, setUserLevel } from "@/lib/ai/userLevel";
import { UserLevelPicker } from "@/components/ai/UserLevelPicker";
import { AiSpinner } from "@/components/ai/AiSpinner";
import { AiMessageBubble, type UiMessage } from "@/components/ai/AiMessageBubble";
import { buildStructuredFromMarkdown } from "@/lib/ai/structuredResponse";
import { formatCurrency, formatPercent, formatNumber } from "@/components/dashboard/formatting";
import type {
  AiStructuredResponse,
  ChatMessage,
  UserLevel,
} from "@/lib/ai/types";

export type AiChatFullPageProps = {
  /** KPI focus à l'ouverture (null pour un chat libre). */
  kpiId: string | null;
  /** Valeur courante du KPI — affichée en sous-titre. */
  kpiValue?: number | null;
  /** Question pré-remplie envoyée automatiquement au mount. */
  initialQuestion?: string | null;
  /** AnalysisId courant pour contextualiser la question côté serveur. */
  analysisId?: string | null;
  /** Conversation existante à reprendre (depuis la liste). */
  conversationId?: string | null;
  /** Messages d'entrée (cas reprise de conversation). */
  initialMessages?: ChatMessage[];
};

export function AiChatFullPage(props: AiChatFullPageProps) {
  const router = useRouter();
  const definition = props.kpiId ? getKpiDefinition(props.kpiId) : null;

  const [conversationId, setConversationId] = useState<string | null>(
    props.conversationId ?? null
  );
  const [messages, setMessages] = useState<UiMessage[]>(() =>
    decorateMessages(props.initialMessages ?? [], props.kpiId, props.kpiValue ?? null)
  );
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [remainingQuota, setRemainingQuota] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Bloc visuel dédié quand l'API renvoie 429 (quota épuisé) — distinct du
  // bandeau d'erreur générique pour mettre en avant le reset à minuit.
  const [quotaExceeded, setQuotaExceeded] = useState<{ message: string } | null>(null);
  const [userLevel, setUserLevelState] = useState<UserLevel | null>(null);
  const [autoSendQuestion, setAutoSendQuestion] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // AbortController du stream en cours. Permet d'interrompre proprement le
  // SSE quand l'utilisateur (1) pose une nouvelle question avant la fin,
  // (2) clique Régénérer, (3) quitte la page (cleanup unmount).
  const streamAbortRef = useRef<AbortController | null>(null);

  // Cleanup à l'unmount — abort tout stream en cours.
  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  // Init au mount + quand le contexte change (navigation entre KPIs).
  useEffect(() => {
    setUserLevelState(getUserLevel());
    setAutoSendQuestion(props.initialQuestion ?? null);
  }, [props.initialQuestion]);

  // Auto-scroll en bas après nouveau message ou fin chargement.
  useEffect(() => {
    if (!scrollerRef.current) return;
    const el = scrollerRef.current;
    const t = setTimeout(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 200);
    return () => clearTimeout(t);
  }, [messages, loading]);

  // Focus auto sur le textarea au mount (sauf si question auto en cours).
  useEffect(() => {
    if (autoSendQuestion) return;
    const t = setTimeout(() => textareaRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, [autoSendQuestion]);

  const placeholderQuestion = useMemo(() => {
    if (definition) {
      return `Posez une question sur votre ${definition.shortLabel}…`;
    }
    return "Posez votre question financière…";
  }, [definition]);

  const sendQuestion = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || loading) return;

      const level = getUserLevel() ?? "intermediate";
      setLoading(true);
      setErrorMessage(null);

      // Abort tout stream précédent encore en vol (sécurité, normalement
      // loading=true bloque déjà un second envoi).
      streamAbortRef.current?.abort();
      const abort = new AbortController();
      streamAbortRef.current = abort;

      // Identifiant placeholder pour le message assistant streamé — permet
      // de retrouver et muter LE bon message au fil des chunks.
      const placeholderId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed, timestamp: Date.now() },
        {
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          isStreaming: true,
          id: placeholderId,
        },
      ]);
      setInput("");

      const appendChunkTo = (text: string) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId ? { ...m, content: m.content + text } : m
          )
        );
      };

      const finalizeMessage = (extra: Partial<UiMessage>) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId ? { ...m, ...extra, isStreaming: false } : m
          )
        );
      };

      const removePlaceholder = () => {
        setMessages((prev) => prev.filter((m) => m.id !== placeholderId));
      };

      try {
        const { firebaseAuthGateway } = await import("@/services/auth");
        const idToken = await firebaseAuthGateway.getIdToken();
        if (!idToken) {
          throw new Error("Vous devez être connecté pour poser une question.");
        }
        const res = await fetch("/api/ai/ask", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            question: trimmed,
            kpiId: props.kpiId,
            kpiValue: props.kpiValue ?? null,
            analysisId: props.analysisId ?? null,
            conversationId,
            userLevel: level,
          }),
          signal: abort.signal,
        });

        // Erreurs précoces (401, 400, 403, 404, 429) → JSON classique côté serveur.
        if (!res.ok) {
          const json = (await res
            .json()
            .catch(() => ({}))) as {
            error?: string;
            message?: string;
            remainingQuota?: number;
          };
          if (res.status === 429 || json.error === "QUOTA_EXCEEDED") {
            removePlaceholder();
            setQuotaExceeded({
              message:
                json.message ??
                "Quota quotidien atteint (50 questions par jour). Réinitialisation à minuit (Europe/Paris).",
            });
            if (typeof json.remainingQuota === "number") setRemainingQuota(json.remainingQuota);
            return;
          }
          throw new Error(json.error ?? "Erreur serveur.");
        }

        if (!res.body) {
          throw new Error("Réponse sans corps de stream.");
        }

        // ── Consommation du flux SSE ─────────────────────────────────
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullAnswer = "";
        let doneConversationId: string | null = null;
        let streamError: string | null = null;

        // Parse incremental : on découpe sur "\n\n" (séparateur d'event SSE).
        const consumeBuffer = () => {
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            let evt = "";
            let dat = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event: ")) evt = line.slice(7);
              else if (line.startsWith("data: ")) dat += line.slice(6);
            }
            if (!evt) continue;
            let parsed: unknown = null;
            try {
              parsed = dat ? JSON.parse(dat) : null;
            } catch {
              continue;
            }
            if (evt === "meta") {
              const m = parsed as { remainingQuota?: number };
              if (typeof m?.remainingQuota === "number") setRemainingQuota(m.remainingQuota);
            } else if (evt === "chunk") {
              const c = parsed as { text?: string };
              if (typeof c?.text === "string") {
                fullAnswer += c.text;
                appendChunkTo(c.text);
              }
            } else if (evt === "done") {
              const d = parsed as { conversationId?: string };
              if (d?.conversationId) doneConversationId = d.conversationId;
            } else if (evt === "error") {
              const e = parsed as { error?: string };
              streamError = e?.error ?? "Erreur pendant le streaming.";
            }
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          consumeBuffer();
        }
        buffer += decoder.decode();
        consumeBuffer();

        if (streamError) {
          throw new Error(streamError);
        }

        // Finalisation : on construit le structuré côté front (Claude ne le
        // produit pas) pour rendre les blocs A-F au lieu du markdown brut.
        const structured = buildStructuredFromMarkdown(
          fullAnswer,
          props.kpiId,
          props.kpiValue ?? null
        );
        finalizeMessage({ content: fullAnswer, structured });

        if (doneConversationId) {
          const previousId = conversationId;
          setConversationId(doneConversationId);
          if (!previousId) {
            // Première création : on stabilise l'URL sur /assistant-ia/chat/[id]
            // pour qu'un refresh recharge l'historique.
            router.replace(`/assistant-ia/chat/${doneConversationId}`);
          }
        }
      } catch (err) {
        // Un AbortError signifie qu'on a coupé le stream volontairement
        // (nouvelle question, régénération, unmount) — pas une vraie erreur.
        if ((err as { name?: string })?.name === "AbortError") {
          removePlaceholder();
          return;
        }
        removePlaceholder();
        setErrorMessage(err instanceof Error ? err.message : "Erreur inconnue.");
      } finally {
        setLoading(false);
        if (streamAbortRef.current === abort) {
          streamAbortRef.current = null;
        }
      }
    },
    [conversationId, loading, props.analysisId, props.kpiId, props.kpiValue, router]
  );

  /**
   * Régénère un message assistant en relançant la question user qui le
   * précède. Pas de confirmation (comportement ChatGPT). La nouvelle réponse
   * consomme un nouveau ticket de quota côté serveur — c'est volontaire.
   */
  const regenerateMessage = useCallback(
    (assistantId: string) => {
      // On retrouve la dernière question user qui précède le message ciblé.
      const idx = messages.findIndex((m) => m.id === assistantId);
      if (idx < 0) return;
      let userQuestion: string | null = null;
      for (let i = idx - 1; i >= 0; i -= 1) {
        if (messages[i]!.role === "user") {
          userQuestion = messages[i]!.content;
          break;
        }
      }
      if (!userQuestion) return;
      // Retire le message assistant à régénérer pour éviter doublon visuel.
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      // Annule un éventuel stream en cours puis relance.
      streamAbortRef.current?.abort();
      void sendQuestion(userQuestion);
    },
    [messages, sendQuestion]
  );

  // Envoi automatique d'une question pré-remplie quand le niveau est dispo.
  useEffect(() => {
    if (!autoSendQuestion) return;
    if (!userLevel) return;
    const q = autoSendQuestion;
    setAutoSendQuestion(null);
    void sendQuestion(q);
  }, [autoSendQuestion, sendQuestion, userLevel]);

  const handlePickLevel = (level: UserLevel) => {
    setUserLevel(level);
    setUserLevelState(level);
  };

  const handleNewConversation = () => {
    setConversationId(null);
    setMessages([]);
    setInput("");
    setErrorMessage(null);
    textareaRef.current?.focus();
  };

  function handleInputResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget;
    setInput(ta.value);
    ta.style.height = "auto";
    const maxHeight = 24 * 6 + 16;
    ta.style.height = Math.min(ta.scrollHeight, maxHeight) + "px";
  }

  const inputDisabled = loading || !userLevel;
  const sendDisabled = inputDisabled || !input.trim();

  return (
    <section
      // Hauteur ajustée pour laisser place au AppHeader (≈ 4 rem) + padding
      // page (≈ 2 rem) + marge bas (≈ 1 rem). Sans ça l'input bar passait
      // sous le viewport.
      className="relative flex h-[calc(100vh-7.5rem)] flex-col rounded-2xl"
      style={{
        backgroundColor: "var(--app-card-bg)",
        border: "1px solid var(--app-border)",
      }}
    >
      {/* Header — bouton retour + titre KPI */}
      <header
        className="flex flex-shrink-0 items-center gap-3 px-5 py-3"
        style={{ borderBottom: "1px solid var(--app-border)" }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Retour"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full transition"
          style={{ color: "var(--app-text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--app-border-strong)";
            e.currentTarget.style.color = "white";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--app-text-secondary)";
          }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Sparkles className="h-4 w-4 flex-shrink-0 text-quantis-gold" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-white">
              {definition ? definition.label : "Assistant Vyzor"}
            </p>
            {definition && props.kpiValue !== null && props.kpiValue !== undefined && Number.isFinite(props.kpiValue) ? (
              <p className="truncate text-[11px]" style={{ color: "var(--app-text-tertiary)" }}>
                Valeur actuelle : {formatKpiValueByUnit(definition.unit, props.kpiValue)}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={handleNewConversation}
          aria-label="Nouvelle conversation"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] transition"
          style={{
            backgroundColor: "var(--app-surface-soft)",
            border: "1px solid var(--app-border-strong)",
            color: "var(--app-text-secondary)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(197, 160, 89, 0.08)";
            e.currentTarget.style.color = "var(--app-brand-gold-deep)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--app-surface-soft)";
            e.currentTarget.style.color = "var(--app-text-secondary)";
          }}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          Nouvelle conversation
        </button>
      </header>

      {/* Zone messages — centrée, max-width 720 px, scrollable */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto" style={{ scrollBehavior: "smooth" }}>
        <div className="mx-auto w-full max-w-[720px] space-y-6 px-4 py-8 md:px-6">
          {!userLevel ? (
            <UserLevelPicker onPick={handlePickLevel} />
          ) : null}

          {userLevel && messages.length === 0 && !loading && !autoSendQuestion ? (
            <EmptyConversation
              definition={definition}
              onPick={(question) => void sendQuestion(question)}
            />
          ) : null}

          {messages.map((m, idx) => (
            <AiMessageBubble
              key={m.id ?? idx}
              message={m}
              onAskFollowUp={(q) => void sendQuestion(q)}
              onCopy={
                m.role === "assistant"
                  ? (text) => {
                      // Clipboard indisponible en HTTP non-localhost / iframe →
                      // erreur silencieuse, le feedback visuel reste géré côté
                      // bouton (Copié ! affiché même en cas d'échec clipboard).
                      try {
                        void navigator.clipboard?.writeText(text);
                      } catch {
                        /* noop */
                      }
                    }
                  : undefined
              }
              onRegenerate={
                m.role === "assistant" && m.id
                  ? () => regenerateMessage(m.id!)
                  : undefined
              }
              onViewDetail={(kpiId) => {
                // Navigation vers la page d'analyse avec le KPI ciblé via
                // `focusKpi` (évite conflit avec `kpiId` déjà utilisé pour
                // d'autres usages). La page d'analyse scroll vers la card
                // et applique un halo doré pulsé pendant ~2s, puis nettoie
                // le query param pour éviter de re-trigger au reload.
                if (!kpiId) return;
                router.push(`/analysis?focusKpi=${encodeURIComponent(kpiId)}`);
              }}
              onViewChart={(kpiId) => {
                // Mission 2 — Navigation vers le graphique d'évolution du
                // KPI sur la page d'analyse. Param distinct `focusChart`
                // pour cibler le conteneur `[data-chart-id="<kpiId>"]` au
                // lieu de la card KPI. Si le graphique n'existe pas sur la
                // page (ex. KPI sans evolutionChart configuré dans le
                // dashboard), l'effet retombe silencieusement en no-op.
                if (!kpiId) return;
                router.push(`/analysis?focusChart=${encodeURIComponent(kpiId)}`);
              }}
            />
          ))}

          {/* Spinner uniquement tant qu'aucun chunk n'est arrivé. Dès que le
              premier delta arrive, le placeholder de streaming devient visible
              (avec curseur clignotant) et le spinner peut disparaître. */}
          {loading && !messages.some((m) => m.isStreaming && m.content.length > 0) ? (
            <AiSpinner />
          ) : null}

          {errorMessage ? (
            <div
              className="rounded-lg px-3.5 py-2.5 text-[13px]"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "var(--app-danger)",
              }}
            >
              {errorMessage}
            </div>
          ) : null}

          {quotaExceeded ? (
            <div
              className="rounded-lg px-4 py-3 text-[13px]"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.10)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                color: "var(--app-danger)",
              }}
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
                <div>
                  <p className="font-semibold">{quotaExceeded.message}</p>
                  <p className="mt-1 text-[12px] opacity-80">
                    Revenez demain pour continuer à poser vos questions.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Input bar — sticky en bas, centré */}
      <div
        className="flex-shrink-0 px-4 pb-5 pt-3 md:px-6"
        style={{ borderTop: "1px solid var(--app-border)" }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendQuestion(input);
          }}
          className="mx-auto w-full max-w-[720px]"
        >
          <div
            className="flex items-end gap-2 rounded-2xl px-4 py-3 transition"
            style={{
              backgroundColor: "var(--app-surface-soft)",
              border: "1px solid var(--app-border-strong)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(197, 160, 89, 0.4)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--app-border-strong)";
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputResize}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendQuestion(input);
                }
              }}
              rows={1}
              placeholder={placeholderQuestion}
              disabled={inputDisabled}
              aria-label="Saisir une question"
              className="max-h-[160px] min-h-[28px] flex-1 resize-none bg-transparent text-[15px] leading-relaxed text-white placeholder:text-white/40 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sendDisabled}
              aria-label="Envoyer la question"
              className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition disabled:opacity-30"
              style={{
                backgroundColor: sendDisabled ? "rgba(197, 160, 89, 0.15)" : "var(--app-brand-gold-deep)",
                color: sendDisabled ? "var(--app-brand-gold-deep)" : "#0F0F12",
              }}
              onMouseEnter={(e) => {
                if (sendDisabled) return;
                e.currentTarget.style.backgroundColor = "#D9B574";
              }}
              onMouseLeave={(e) => {
                if (sendDisabled) return;
                e.currentTarget.style.backgroundColor = "var(--app-brand-gold-deep)";
              }}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: "var(--app-text-tertiary)" }}>
            <span>Entrée pour envoyer · Maj+Entrée pour saut de ligne</span>
            {remainingQuota !== null ? <ChatQuotaPill remaining={remainingQuota} /> : null}
          </div>
        </form>
      </div>
    </section>
  );
}

// ─── Sous-composants ────────────────────────────────────────────────────

/** Questions modèles affichées à l'état vide — alignées sur la liste de
 *  AssistantConversationsView pour cohérence. Icônes lucide-react (Mission 1
 *  — remplacement des emojis pour cohérence visuelle avec AppHeader/AppSidebar).
 *  Si un KPI focus est fourni, on remplace les 3 premières par les
 *  `suggestedQuestions` du KPI. */
const FALLBACK_SAMPLE_QUESTIONS: Array<{ Icon: LucideIcon; question: string }> = [
  { Icon: TrendingDown, question: "Pourquoi mon EBITDA est-il négatif ce trimestre ?" },
  { Icon: RefreshCw, question: "Quels leviers prioriser pour faire baisser mon BFR ?" },
  { Icon: Timer, question: "Mon DSO est anormalement long — par où commencer ?" },
  { Icon: Target, question: "Combien rapporterait une hausse de prix de 5 % ?" },
];

function EmptyConversation({
  definition,
  onPick,
}: {
  definition: ReturnType<typeof getKpiDefinition>;
  onPick: (question: string) => void;
}) {
  // Si on est focus sur un KPI, propose 2 questions tirées du registre +
  // 2 questions génériques pour rester variées. Sinon prend le top 4 par défaut.
  const questions: Array<{ Icon: LucideIcon; question: string }> = definition
    ? [
        { Icon: Sparkles, question: definition.suggestedQuestions.whenBad },
        { Icon: Lightbulb, question: definition.suggestedQuestions.whenGood },
        ...FALLBACK_SAMPLE_QUESTIONS.slice(0, 2),
      ]
    : FALLBACK_SAMPLE_QUESTIONS;

  return (
    <div className="py-12">
      <div className="text-center">
        <div
          className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: "rgba(197, 160, 89, 0.1)",
            border: "1px solid rgba(197, 160, 89, 0.3)",
            color: "var(--app-brand-gold-deep)",
          }}
        >
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="text-[20px] font-semibold text-white">
          {definition
            ? `Discutons de votre ${definition.shortLabel.toLowerCase()}`
            : "Comment puis-je vous aider ?"}
        </h2>
        <p
          className="mx-auto mt-2 max-w-[480px] text-[13px]"
          style={{ color: "var(--app-text-secondary)" }}
        >
          {definition
            ? definition.tooltip.explanation
            : "Posez votre question financière. Je m'appuie sur vos KPIs réels pour répondre — pas d'invention."}
        </p>
      </div>

      {/* Cards questions modèles — cliquables pour amorcer la conversation.
       *  Disparaissent automatiquement dès qu'un message est envoyé (la card
       *  EmptyConversation n'est rendue que si messages.length === 0). */}
      <div className="mx-auto mt-8 grid max-w-[600px] gap-3 sm:grid-cols-2">
        {questions.map((q) => (
          <button
            key={q.question}
            type="button"
            onClick={() => onPick(q.question)}
            className="vyzor-fade-up group flex items-start gap-3 rounded-xl p-3 text-left transition"
            style={{
              backgroundColor: "var(--app-card-bg)",
              border: "1px solid var(--app-border)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(197, 160, 89, 0.4)";
              e.currentTarget.style.boxShadow = "0 0 12px rgba(197, 160, 89, 0.12)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--app-border)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <span
              aria-hidden
              className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 10%)" }}
            >
              <q.Icon
                className="h-5 w-5 text-quantis-gold"
                style={{ color: "var(--app-brand-gold-deep)" }}
              />
            </span>
            <span
              className="flex-1 text-[13px] leading-snug"
              style={{ color: "var(--app-text-primary)" }}
            >
              {q.question}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Pill quota dans la barre de saisie — 4 paliers ─────────────────────
//
// Aligne le footer de la page chat sur l'indicateur de la page d'accueil
// (cf. AssistantConversationsView/QuotaIndicator). Total fixé à 50 — affichage
// uniquement, la source de vérité reste DAILY_AI_QUOTA côté serveur.
function ChatQuotaPill({ remaining }: { remaining: number }) {
  if (remaining > 10) {
    return (
      <span className="font-mono uppercase tracking-wider">
        {remaining}/50 questions aujourd&apos;hui
      </span>
    );
  }
  if (remaining > 3) {
    return (
      <span
        className="inline-flex items-center gap-1 font-mono uppercase tracking-wider"
        style={{ color: "var(--app-brand-gold-deep)" }}
      >
        <AlertCircle className="h-3 w-3" aria-hidden />
        Plus que {remaining} aujourd&apos;hui
      </span>
    );
  }
  if (remaining > 0) {
    return (
      <span className="font-mono uppercase tracking-wider text-rose-400">
        Plus que {remaining} — reset à minuit
      </span>
    );
  }
  return (
    <span className="font-mono uppercase tracking-wider text-rose-400">
      Quota épuisé — reset à minuit
    </span>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function decorateMessages(
  messages: ChatMessage[],
  kpiId: string | null,
  kpiValue: number | null
): UiMessage[] {
  return messages.map((m) =>
    m.role === "assistant"
      ? { ...m, structured: buildStructuredFromMarkdown(m.content, kpiId, kpiValue) }
      : (m as UiMessage)
  );
}

function formatKpiValueByUnit(unit: string, value: number): string {
  switch (unit) {
    case "currency":
      return formatCurrency(value);
    case "percent":
      return formatPercent(value);
    case "days":
      return `${Math.round(value)} j`;
    case "ratio":
      return formatNumber(value, 2);
    case "score":
      return `${Math.round(value)}/100`;
    default:
      return formatNumber(value, 2);
  }
}
