// File: components/ai/AiMessageBubble.tsx
// Role: rendu d'un message dans la zone de conversation. Délègue le rendu
// assistant à `AiResponseCard` (blocs structurés A-F). Pour l'utilisateur,
// rendu minimaliste : pas de bulle, texte aligné à droite, opacité 0.6, et
// un timestamp discret en dessous (opacité 0.3).
"use client";

import { AiResponseCard } from "@/components/ai/AiResponseCard";
import { buildStructuredFromMarkdown } from "@/lib/ai/structuredResponse";
import type { AiStructuredResponse, ChatMessage } from "@/lib/ai/types";

export type UiMessage = ChatMessage & { structured?: AiStructuredResponse };

type AiMessageBubbleProps = {
  message: UiMessage;
  /** Callback quand l'utilisateur clique sur une question de suivi. */
  onFollowUp: (question: string) => void;
};

export function AiMessageBubble({ message, onFollowUp }: AiMessageBubbleProps) {
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

  const structured =
    message.structured ?? buildStructuredFromMarkdown(message.content, null, null);
  return (
    <div className="vyzor-msg-enter" data-ai-msg="assistant">
      <AiResponseCard response={structured} onFollowUp={onFollowUp} />
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
