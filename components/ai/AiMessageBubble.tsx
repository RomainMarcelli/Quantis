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
      <div className="vyzor-msg-enter flex flex-col items-end">
        {/* Cadrage léger autour du message user — fond très subtil
         *  (rgba blanc 0.03) + radius pour structurer visuellement sans
         *  basculer en bulle prononcée. Préférence produit : éviter
         *  l'effet "chat enfantin", garder une lecture sobre. */}
        <p
          className="max-w-[88%] rounded-xl text-[14px] leading-relaxed"
          style={{
            color: "rgba(255, 255, 255, 0.85)",
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.04)",
            padding: "10px 16px",
            textAlign: "right",
          }}
        >
          {message.content}
        </p>
        <span
          className="mt-1 mr-1 text-[10px] tabular-nums"
          style={{ color: "rgba(255, 255, 255, 0.3)" }}
        >
          {formatTimestamp(message.timestamp)}
        </span>
      </div>
    );
  }

  const structured =
    message.structured ?? buildStructuredFromMarkdown(message.content, null, null);
  return (
    <div className="vyzor-msg-enter">
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
