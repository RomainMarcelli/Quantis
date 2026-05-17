// File: components/ai/AiMessageBubble.tsx
// Role: rendu d'un message dans la zone de conversation. Délègue le rendu
// assistant à `AiResponseCard` (blocs structurés A-F). Pour l'utilisateur,
// rendu minimaliste : pas de bulle, texte aligné à droite, opacité 0.6, et
// un timestamp discret en dessous (opacité 0.3).
"use client";

import { AiResponseCard } from "@/components/ai/AiResponseCard";
import { buildStructuredFromMarkdown } from "@/lib/ai/structuredResponse";
import type { AiStructuredResponse, ChatMessage } from "@/lib/ai/types";

export type UiMessage = ChatMessage & {
  structured?: AiStructuredResponse;
  /** Streaming en cours : on rend uniquement le content brut + curseur, pas les
   *  blocs A-F ni les actions (qui n'apparaissent qu'à la finalisation). */
  isStreaming?: boolean;
  /** Identifiant stable côté client — utile pour cibler le bon message lors
   *  du streaming (placeholder) et de la régénération. Non persisté. */
  id?: string;
};

type AiMessageBubbleProps = {
  message: UiMessage;
  /** Callback quand l'utilisateur clique sur une question de suivi ou sur
   *  l'action "Comparer avec N-1" — relayé vers `AiResponseCard`. */
  onAskFollowUp?: (question: string) => void;
  /** Callback pour l'action "Voir le détail" — relayé vers `AiResponseCard`. */
  onViewDetail?: (kpiId: string) => void;
  /** Callback pour l'action "Voir le graphique" (Mission 2) — relayé vers
   *  `AiResponseCard`. */
  onViewChart?: (kpiId: string) => void;
  /** Callback "Copier" — texte du message copié dans le presse-papiers. */
  onCopy?: (text: string) => void;
  /** Callback "Régénérer" — rejoue la question user qui précède ce message. */
  onRegenerate?: () => void;
};

export function AiMessageBubble({
  message,
  onAskFollowUp,
  onViewDetail,
  onViewChart,
  onCopy,
  onRegenerate,
}: AiMessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="vyzor-msg-enter flex flex-col items-end" data-ai-msg="user">
        <div
          className="max-w-[88%] text-[14px] leading-relaxed"
          data-ai-bubble="user"
          style={{
            color: "var(--app-text-primary)",
            backgroundColor: "var(--app-ai-user-bg, var(--app-surface-soft))",
            borderRadius: "16px 16px 4px 16px",
            padding: "10px 14px",
          }}
        >
          {message.content}
        </div>
        <span
          className="mt-1 text-[10px] tabular-nums"
          style={{ color: "var(--app-text-tertiary)", paddingRight: 16 }}
        >
          {formatTimestamp(message.timestamp)}
        </span>
      </div>
    );
  }

  // ── Mode streaming ──────────────────────────────────────────────────
  // Tant que le stream n'est pas terminé, on affiche le content brut + un
  // curseur clignotant. Pas de blocs A-F ni d'actions (Copier/Régénérer/
  // Voir détail) : ces affordances n'ont du sens que sur une réponse
  // finalisée.
  if (message.isStreaming) {
    // Tant qu'aucun chunk n'est arrivé (content vide), on ne rend rien — le
    // parent affiche un AiSpinner classique. Évite un curseur clignotant
    // seul dans le vide.
    if (!message.content) return null;
    return (
      <div className="vyzor-msg-enter" data-ai-msg="assistant" data-ai-streaming="true">
        <p
          className="whitespace-pre-wrap text-[13px] leading-relaxed"
          style={{ color: "var(--app-text-primary)" }}
        >
          {message.content}
          <span className="vyzor-stream-cursor" aria-hidden>
            ▍
          </span>
        </p>
      </div>
    );
  }

  const structured =
    message.structured ?? buildStructuredFromMarkdown(message.content, null, null);
  return (
    <div className="vyzor-msg-enter" data-ai-msg="assistant">
      <AiResponseCard
        response={structured}
        onAskFollowUp={onAskFollowUp}
        onViewDetail={onViewDetail}
        onViewChart={onViewChart}
        onCopy={onCopy ? () => onCopy(message.content) : undefined}
        onRegenerate={onRegenerate}
      />
    </div>
  );
}

/** Format hh:mm en français. Stable côté SSR (pas de toLocaleTimeString qui
 *  varie selon locale) — on construit la string à la main. */
function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
