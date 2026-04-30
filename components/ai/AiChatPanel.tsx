// File: components/ai/AiChatPanel.tsx
// Role: drawer latéral droit (400 px) qui héberge la conversation IA.
// Affiche les messages user/assistant, un input de saisie, un spinner doré
// pendant le chargement, et le quota restant.
//
// ─── Architecture ────────────────────────────────────────────────────────
//
// Composant entièrement contrôlé par `AiChatProvider` via les props
// `open`, `kpiId`, `initialQuestion`, `onClose`. Pas de state global —
// l'orchestration (quel KPI, quelle question pré-remplie) vit dans le
// provider, on garde le panel "dumb".
//
// État local :
//   - messages         : tableau ChatMessage (poussé après chaque tour)
//   - input            : draft utilisateur
//   - loading          : flag spinner
//   - remainingQuota   : entier reçu de l'API
//   - userLevel        : valeur effective (avec picker au premier usage)
//   - conversationId   : null tant qu'on n'a pas créé la conversation
//
// L'envoi appelle POST /api/ai/ask avec l'auth Firebase Bearer.
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import { getUserLevel, setUserLevel } from "@/lib/ai/userLevel";
import { UserLevelPicker } from "@/components/ai/UserLevelPicker";
import { MarkdownLite } from "@/components/ai/MarkdownLite";
import type { ChatMessage, UserLevel } from "@/lib/ai/types";

export type AiChatPanelProps = {
  open: boolean;
  onClose: () => void;
  /** KPI focus à l'ouverture, ou null pour un chat libre. */
  kpiId: string | null;
  /** Question pré-remplie (cliquée depuis un tooltip). */
  initialQuestion?: string | null;
  /** AnalysisId courant pour contextualiser. */
  analysisId?: string | null;
  /** Conversation existante à reprendre (depuis la liste). */
  conversationId?: string | null;
  /** Messages d'entrée si on reprend une conversation. */
  initialMessages?: ChatMessage[];
};

export function AiChatPanel(props: AiChatPanelProps) {
  const definition = props.kpiId ? getKpiDefinition(props.kpiId) : null;

  const [conversationId, setConversationId] = useState<string | null>(
    props.conversationId ?? null
  );
  const [messages, setMessages] = useState<ChatMessage[]>(
    props.initialMessages ?? []
  );
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [remainingQuota, setRemainingQuota] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userLevel, setUserLevelState] = useState<UserLevel | null>(null);
  const [autoSendQuestion, setAutoSendQuestion] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Reset l'état quand le panel s'ouvre avec un nouveau KPI / contexte.
  // On ne reset pas si le panel reste ouvert sur le même focus (évite
  // de perdre la conversation en cours).
  useEffect(() => {
    if (!props.open) return;
    setConversationId(props.conversationId ?? null);
    setMessages(props.initialMessages ?? []);
    setInput("");
    setErrorMessage(null);
    setAutoSendQuestion(props.initialQuestion ?? null);
    setUserLevelState(getUserLevel());
  }, [props.open, props.kpiId, props.conversationId, props.initialQuestion, props.initialMessages]);

  // Scroll auto vers le bas à chaque nouveau message.
  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages, loading]);

  const placeholderQuestion = useMemo(() => {
    if (definition) {
      return `Posez une question sur votre ${definition.shortLabel}...`;
    }
    return "Posez votre question financière...";
  }, [definition]);

  const sendQuestion = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || loading) return;

      const level = getUserLevel() ?? "intermediate";
      setLoading(true);
      setErrorMessage(null);

      // Push optimiste du message utilisateur.
      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed, timestamp: Date.now() },
      ]);
      setInput("");

      try {
        // Import dynamique pour ne pas faire fuiter les imports Firebase
        // dans les tests des composants parents (KpiTooltip, dashboards…)
        // qui n'ont pas besoin de la clé `NEXT_PUBLIC_FIREBASE_API_KEY`
        // pour s'exécuter en isolation.
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
            analysisId: props.analysisId ?? null,
            conversationId,
            userLevel: level,
          }),
        });

        const json = (await res.json()) as {
          answer?: string;
          conversationId?: string;
          remainingQuota?: number;
          error?: string;
        };

        if (!res.ok) {
          throw new Error(json.error ?? "Erreur serveur.");
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: json.answer ?? "",
            timestamp: Date.now(),
          },
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
    [conversationId, loading, props.analysisId, props.kpiId]
  );

  // Envoi automatique de la question pré-remplie une fois le niveau connu.
  useEffect(() => {
    if (!props.open) return;
    if (!autoSendQuestion) return;
    if (!userLevel) return;
    const q = autoSendQuestion;
    setAutoSendQuestion(null);
    void sendQuestion(q);
  }, [autoSendQuestion, props.open, sendQuestion, userLevel]);

  const handlePickLevel = (level: UserLevel) => {
    setUserLevel(level);
    setUserLevelState(level);
  };

  if (!props.open) return null;

  return (
    <>
      {/* Backdrop : assombrit l'app et capture le clic pour fermer. */}
      <div
        aria-hidden
        className="fixed inset-0 z-[990] bg-black/50 backdrop-blur-[2px] transition-opacity"
        onClick={props.onClose}
      />

      {/* Drawer principal : fixed à droite, 400 px, fond sombre + bordure dorée. */}
      <aside
        role="dialog"
        aria-label="Assistant IA Vyzor"
        className="fixed right-0 top-0 z-[991] flex h-screen w-full max-w-[400px] flex-col border-l-2 border-l-quantis-gold/60 bg-[#0F0F12] shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-quantis-gold/40 bg-quantis-gold/10 text-quantis-gold">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {definition ? definition.label : "Assistant IA Vyzor"}
              </p>
              {definition ? (
                <p className="truncate font-mono text-[10px] uppercase tracking-wider text-quantis-gold/70">
                  {definition.shortLabel}
                </p>
              ) : (
                <p className="truncate text-[10px] text-white/55">Discutons finance</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Fermer l'assistant"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Zone messages — scrollable. */}
        <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Picker au premier usage (pas de niveau persisté). */}
          {!userLevel && (
            <UserLevelPicker onPick={handlePickLevel} />
          )}

          {/* Message d'accueil quand pas encore d'historique. */}
          {userLevel && messages.length === 0 && !loading && !autoSendQuestion && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/70">
              {definition
                ? `Posez votre question sur votre ${definition.label.toLowerCase()}. Vyzor s'appuie sur vos données réelles pour vous répondre.`
                : "Posez votre question financière. Je m'appuie sur vos KPIs pour répondre — pas d'invention."}
            </div>
          )}

          {messages.map((m, idx) => (
            <MessageBubble key={idx} message={m} />
          ))}

          {loading && (
            <div className="flex items-center gap-2 rounded-xl border border-quantis-gold/30 bg-[#1A1A2E] p-3 text-xs text-quantis-gold">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Vyzor analyse vos données...</span>
            </div>
          )}

          {errorMessage && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Quota — discret au-dessus de l'input. */}
        {remainingQuota !== null && (
          <div className="border-t border-white/10 px-4 py-1.5 text-right font-mono text-[10px] uppercase tracking-wider text-white/45">
            {remainingQuota}/20 questions aujourd&apos;hui
          </div>
        )}

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendQuestion(input);
          }}
          className="border-t border-white/10 px-4 py-3"
        >
          <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 focus-within:border-quantis-gold/60">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendQuestion(input);
                }
              }}
              rows={1}
              placeholder={placeholderQuestion}
              disabled={loading || !userLevel}
              className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim() || !userLevel}
              aria-label="Envoyer"
              className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-quantis-gold/40 bg-quantis-gold/10 text-quantis-gold transition hover:bg-quantis-gold/20 disabled:opacity-30"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#2D2D3A] px-3.5 py-2 text-sm text-white">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-quantis-gold/40 border-l-4 border-l-quantis-gold bg-[#1A1A2E] px-3.5 py-2.5">
        <MarkdownLite content={message.content} />
      </div>
    </div>
  );
}
