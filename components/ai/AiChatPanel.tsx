// File: components/ai/AiChatPanel.tsx
// Role: panel latéral droit (480 px desktop, fullscreen mobile) glassmorphism
// qui héberge la conversation IA. Ouverture slide-in, fermeture par Échap /
// clic sur backdrop / bouton X. Rendu en blocs structurés (cf. AiResponseCard).
//
// ─── Architecture ────────────────────────────────────────────────────────
//
// Composant entièrement contrôlé par `AiChatProvider`. État local : messages
// (ChatMessage augmenté d'un `structured?` quand disponible), draft input,
// loading, quota, niveau utilisateur, conversationId.
//
// Contrat avec l'API : POST /api/ai/ask renvoie { answer, structured?, ... }.
// Si `structured` est null (réponse Claude réelle ou historique persisté),
// on calcule le structuré côté client via `buildStructuredFromMarkdown`.
//
// ─── Choix design ───────────────────────────────────────────────────────
//
// Glassmorphism : fond translucide rgba(15,15,18,0.85) + backdrop-blur 24 px
// + saturate 1.2 → on voit le dashboard flou en dessous. Bordure gauche or
// subtile (1 px rgba(197,160,89,0.3)) + glow doré (-4 px 0 24 px).
//
// Slide-in 400 ms ease-out-expo. Backdrop fade 200 ms. Fermeture immédiate
// (pas de transition de sortie pour rester réactif).
//
// Focus trap : Tab boucle dans le panel ; le textarea reçoit le focus
// auto à l'ouverture (après 100 ms pour laisser l'animation démarrer).
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Plus, Send, Sparkles, X } from "lucide-react";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import { getKpiDiagnostic } from "@/lib/kpi/kpiDiagnostic";
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

export type AiChatPanelProps = {
  open: boolean;
  onClose: () => void;
  /** KPI focus à l'ouverture, ou null pour un chat libre. */
  kpiId: string | null;
  /** Valeur courante du KPI — affichée dans le header mini-cockpit. */
  kpiValue?: number | null;
  /** Valeur N-1 du KPI — pour calculer la variation affichée. */
  kpiPreviousValue?: number | null;
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
  const [messages, setMessages] = useState<UiMessage[]>(
    () => decorateMessages(props.initialMessages ?? [], props.kpiId, props.kpiValue ?? null)
  );
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [remainingQuota, setRemainingQuota] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userLevel, setUserLevelState] = useState<UserLevel | null>(null);
  const [autoSendQuestion, setAutoSendQuestion] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Reset l'état quand le panel s'ouvre avec un nouveau KPI / contexte.
  useEffect(() => {
    if (!props.open) return;
    setConversationId(props.conversationId ?? null);
    setMessages(decorateMessages(props.initialMessages ?? [], props.kpiId, props.kpiValue ?? null));
    setInput("");
    setErrorMessage(null);
    setAutoSendQuestion(props.initialQuestion ?? null);
    setUserLevelState(getUserLevel());
  }, [
    props.open,
    props.kpiId,
    props.kpiValue,
    props.conversationId,
    props.initialQuestion,
    props.initialMessages,
  ]);

  // Auto-scroll lisse vers le bas après chaque nouveau message ou fin de
  // chargement. Délai 300 ms pour que l'animation du bloc soit visible.
  useEffect(() => {
    if (!scrollerRef.current) return;
    const el = scrollerRef.current;
    const t = setTimeout(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 300);
    return () => clearTimeout(t);
  }, [messages, loading]);

  // Focus auto sur le textarea à l'ouverture, après le stagger d'animation.
  useEffect(() => {
    if (!props.open) return;
    const t = setTimeout(() => textareaRef.current?.focus(), 450);
    return () => clearTimeout(t);
  }, [props.open]);

  // Esc ferme + focus trap (Tab boucle dans le panel).
  useEffect(() => {
    if (!props.open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        props.onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        // Focus trap simple : on collecte les éléments focusables et on
        // wrap le focus si on sort du panel.
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose]);

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
            // kpiValue : passé en clair pour que le mock l'utilise même sans
            // analysisId (ex. page synthèse, widgets hors analyse). Le
            // backend privilégie cette valeur sur le lookup `analysis.kpis`.
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
        // Si l'API ne fournit pas de structuré (Claude réel), on construit
        // côté client depuis le markdown + registre.
        const structured =
          json.structured ??
          buildStructuredFromMarkdown(answer, props.kpiId, props.kpiValue ?? null);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: answer,
            timestamp: Date.now(),
            structured,
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
    [conversationId, loading, props.analysisId, props.kpiId, props.kpiValue]
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

  const handleNewConversation = () => {
    setConversationId(null);
    setMessages([]);
    setInput("");
    setErrorMessage(null);
    textareaRef.current?.focus();
  };

  if (!props.open) return null;

  return (
    <>
      {/* Backdrop : assombrit l'app et capture le clic pour fermer. */}
      <div
        aria-hidden
        className="vyzor-chat-backdrop fixed inset-0 z-[990]"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
        onClick={props.onClose}
      />

      {/* Panel glassmorphism : 480 px desktop, fullscreen mobile. */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Assistant IA Vyzor"
        className="vyzor-chat-panel fixed right-0 top-0 z-[991] flex h-screen w-full flex-col md:max-w-[480px]"
        style={{
          backgroundColor: "rgba(15, 15, 18, 0.85)",
          backdropFilter: "blur(24px) saturate(1.2)",
          WebkitBackdropFilter: "blur(24px) saturate(1.2)",
          borderLeft: "1px solid rgba(197, 160, 89, 0.3)",
          boxShadow: "-4px 0 24px rgba(197, 160, 89, 0.06)",
        }}
      >
        <ChatHeader
          definition={definition}
          kpiValue={props.kpiValue ?? null}
          kpiPreviousValue={props.kpiPreviousValue ?? null}
          onClose={props.onClose}
        />

        {/* Séparateur gradient entre header et messages */}
        <div
          aria-hidden
          className="h-px flex-shrink-0"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(197,160,89,0.3), transparent)",
          }}
        />

        {/* Zone messages — scrollable. */}
        <div
          ref={scrollerRef}
          className="flex-1 space-y-5 overflow-y-auto px-5 py-5"
          style={{ scrollBehavior: "smooth" }}
        >
          {!userLevel && <UserLevelPicker onPick={handlePickLevel} />}

          {userLevel && messages.length === 0 && !loading && !autoSendQuestion && (
            <div
              className="rounded-xl p-3.5 text-[13px] leading-relaxed"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                color: "rgba(255, 255, 255, 0.7)",
              }}
            >
              {definition
                ? `Posez votre question sur votre ${definition.label.toLowerCase()}. Vyzor s'appuie sur vos données réelles pour vous répondre.`
                : "Posez votre question financière. Je m'appuie sur vos KPIs pour répondre — pas d'invention."}
            </div>
          )}

          {messages.map((m, idx) => (
            <AiMessageBubble
              key={idx}
              message={m}
              onFollowUp={(q) => void sendQuestion(q)}
            />
          ))}

          {loading && <AiSpinner />}

          {errorMessage && (
            <div
              className="rounded-lg px-3.5 py-2.5 text-[12px]"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                color: "#FCA5A5",
              }}
            >
              {errorMessage}
            </div>
          )}
        </div>

        {/* Quota + input zone */}
        <ChatInput
          textareaRef={textareaRef}
          input={input}
          setInput={setInput}
          loading={loading}
          userLevel={userLevel}
          placeholder={placeholderQuestion}
          remainingQuota={remainingQuota}
          onSubmit={() => void sendQuestion(input)}
          onNewConversation={handleNewConversation}
        />
      </aside>
    </>
  );
}

// ─── Sous-composants ────────────────────────────────────────────────────

function ChatHeader({
  definition,
  kpiValue,
  kpiPreviousValue,
  onClose,
}: {
  definition: ReturnType<typeof getKpiDefinition>;
  kpiValue: number | null;
  kpiPreviousValue: number | null;
  onClose: () => void;
}) {
  const diagnostic = definition
    ? getKpiDiagnostic(kpiValue, definition.thresholds)
    : "neutral";
  const pillColor =
    diagnostic === "good"
      ? "#22C55E"
      : diagnostic === "danger" || diagnostic === "warning"
        ? "#EF4444"
        : "#C5A059";

  return (
    <header
      className="flex flex-shrink-0 flex-col justify-center gap-1 px-5 py-3"
      style={{
        backgroundColor: "rgba(26, 26, 46, 0.6)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
        minHeight: 80,
      }}
    >
      {/* Ligne 1 : icône + titre + close */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Sparkles
            className="vyzor-sparkle-pulse h-4 w-4 flex-shrink-0 text-quantis-gold"
            aria-hidden
          />
          <p className="truncate text-[14px] font-semibold text-white">
            {definition ? definition.label : "Assistant Vyzor"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer l'assistant"
          className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition"
          style={{ color: "rgba(255, 255, 255, 0.6)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
            e.currentTarget.style.color = "white";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "rgba(255, 255, 255, 0.6)";
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Ligne 2 : valeur + variation + pastille */}
      <div className="flex items-center gap-3">
        {definition && kpiValue !== null && Number.isFinite(kpiValue) ? (
          <>
            <p className="text-[24px] font-semibold leading-none tracking-tight text-white">
              {formatKpiValueByUnit(definition.unit, kpiValue)}
            </p>
            <Variation current={kpiValue} previous={kpiPreviousValue} />
            <span
              aria-hidden
              className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: pillColor, boxShadow: `0 0 8px ${pillColor}` }}
            />
          </>
        ) : (
          <p className="text-[12px] text-white/55">Discutons finance — score, KPIs, alertes.</p>
        )}
      </div>
    </header>
  );
}

function Variation({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null || !Number.isFinite(previous) || previous === 0) return null;
  const delta = ((current - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.05) return null;
  const up = delta > 0;
  const color = up ? "#22C55E" : "#EF4444";
  const arrow = up ? "↗" : "↘";
  return (
    <span className="text-[13px] font-medium" style={{ color }}>
      {arrow} {up ? "+" : ""}
      {delta.toFixed(1)}%
    </span>
  );
}

function ChatInput({
  textareaRef,
  input,
  setInput,
  loading,
  userLevel,
  placeholder,
  remainingQuota,
  onSubmit,
  onNewConversation,
}: {
  textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  userLevel: UserLevel | null;
  placeholder: string;
  remainingQuota: number | null;
  onSubmit: () => void;
  onNewConversation: () => void;
}) {
  // Auto-resize 1-4 lignes
  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget;
    setInput(ta.value);
    ta.style.height = "auto";
    const maxHeight = 24 * 4 + 16; // 4 lignes × 24 px + padding
    ta.style.height = Math.min(ta.scrollHeight, maxHeight) + "px";
  }

  const disabled = loading || !userLevel;
  const sendDisabled = disabled || !input.trim();

  return (
    <div className="flex-shrink-0 px-5 pb-4 pt-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex items-end gap-2"
      >
        <button
          type="button"
          onClick={onNewConversation}
          aria-label="Nouvelle conversation"
          disabled={disabled}
          className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition disabled:opacity-30"
          style={{ color: "rgba(255, 255, 255, 0.6)" }}
          onMouseEnter={(e) => {
            if (disabled) return;
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
            e.currentTarget.style.color = "white";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "rgba(255, 255, 255, 0.6)";
          }}
        >
          <Plus className="h-4 w-4" />
        </button>

        <div
          className="flex flex-1 items-end gap-2 rounded-xl px-3 py-2 transition"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            rows={1}
            placeholder={placeholder}
            disabled={disabled}
            aria-label="Saisir une question"
            className="max-h-[112px] min-h-[24px] flex-1 resize-none bg-transparent text-[14px] leading-relaxed text-white placeholder:text-white/40 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sendDisabled}
            aria-label="Envoyer la question"
            className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition disabled:opacity-30"
            style={{
              backgroundColor: sendDisabled ? "rgba(197, 160, 89, 0.15)" : "rgba(197, 160, 89, 0.15)",
              color: "#C5A059",
            }}
            onMouseEnter={(e) => {
              if (sendDisabled) return;
              e.currentTarget.style.backgroundColor = "rgba(197, 160, 89, 0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(197, 160, 89, 0.15)";
            }}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>

      {remainingQuota !== null && (
        <p className="mt-1.5 text-right text-[10px] uppercase tracking-wider text-white/35">
          {remainingQuota}/20 questions aujourd&apos;hui
        </p>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function decorateMessages(
  messages: ChatMessage[],
  kpiId: string | null,
  kpiValue: number | null
): UiMessage[] {
  // Pour les messages assistant venant de l'historique persisté, on calcule
  // un structuré côté client (le serveur ne le persiste pas).
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
