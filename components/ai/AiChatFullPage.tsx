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
import { ArrowLeft, MessageSquarePlus, Send, Sparkles } from "lucide-react";
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
  const [userLevel, setUserLevelState] = useState<UserLevel | null>(null);
  const [autoSendQuestion, setAutoSendQuestion] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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

      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed, timestamp: Date.now() },
      ]);
      setInput("");

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
        });
        const json = (await res.json()) as {
          answer?: string;
          structured?: AiStructuredResponse | null;
          conversationId?: string;
          remainingQuota?: number;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(json.error ?? "Erreur serveur.");
        }
        const answer = json.answer ?? "";
        const structured =
          json.structured ??
          buildStructuredFromMarkdown(answer, props.kpiId, props.kpiValue ?? null);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: answer, timestamp: Date.now(), structured },
        ]);
        if (json.conversationId) setConversationId(json.conversationId);
        if (typeof json.remainingQuota === "number") {
          setRemainingQuota(json.remainingQuota);
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Erreur inconnue.");
      } finally {
        setLoading(false);
      }
    },
    [conversationId, loading, props.analysisId, props.kpiId, props.kpiValue]
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
        backgroundColor: "rgba(15, 15, 18, 0.6)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      {/* Header — bouton retour + titre KPI */}
      <header
        className="flex flex-shrink-0 items-center gap-3 px-5 py-3"
        style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Retour"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full transition"
          style={{ color: "rgba(255, 255, 255, 0.6)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
            e.currentTarget.style.color = "white";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "rgba(255, 255, 255, 0.6)";
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
              <p className="truncate text-[11px]" style={{ color: "rgba(255, 255, 255, 0.55)" }}>
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
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            color: "rgba(255, 255, 255, 0.7)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(197, 160, 89, 0.08)";
            e.currentTarget.style.color = "#C5A059";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.04)";
            e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)";
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
            <EmptyConversation definition={definition} />
          ) : null}

          {messages.map((m, idx) => (
            <AiMessageBubble
              key={idx}
              message={m}
              onFollowUp={(q) => void sendQuestion(q)}
            />
          ))}

          {loading ? <AiSpinner /> : null}

          {errorMessage ? (
            <div
              className="rounded-lg px-3.5 py-2.5 text-[13px]"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#FCA5A5",
              }}
            >
              {errorMessage}
            </div>
          ) : null}
        </div>
      </div>

      {/* Input bar — sticky en bas, centré */}
      <div
        className="flex-shrink-0 px-4 pb-5 pt-3 md:px-6"
        style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}
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
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(197, 160, 89, 0.4)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
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
                backgroundColor: sendDisabled ? "rgba(197, 160, 89, 0.15)" : "#C5A059",
                color: sendDisabled ? "#C5A059" : "#0F0F12",
              }}
              onMouseEnter={(e) => {
                if (sendDisabled) return;
                e.currentTarget.style.backgroundColor = "#D9B574";
              }}
              onMouseLeave={(e) => {
                if (sendDisabled) return;
                e.currentTarget.style.backgroundColor = "#C5A059";
              }}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span>Entrée pour envoyer · Maj+Entrée pour saut de ligne</span>
            {remainingQuota !== null ? (
              <span className="font-mono uppercase tracking-wider">
                {remainingQuota}/20 questions aujourd&apos;hui
              </span>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}

// ─── Sous-composants ────────────────────────────────────────────────────

function EmptyConversation({
  definition,
}: {
  definition: ReturnType<typeof getKpiDefinition>;
}) {
  return (
    <div className="py-12 text-center">
      <div
        className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: "rgba(197, 160, 89, 0.1)",
          border: "1px solid rgba(197, 160, 89, 0.3)",
          color: "#C5A059",
        }}
      >
        <Sparkles className="h-6 w-6" />
      </div>
      <h2 className="text-[20px] font-semibold text-white">
        {definition ? `Discutons de votre ${definition.shortLabel.toLowerCase()}` : "Comment puis-je vous aider ?"}
      </h2>
      <p className="mx-auto mt-2 max-w-[480px] text-[13px]" style={{ color: "rgba(255,255,255,0.6)" }}>
        {definition
          ? definition.tooltip.explanation
          : "Posez votre question financière. Je m'appuie sur vos KPIs réels pour répondre — pas d'invention."}
      </p>
    </div>
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
