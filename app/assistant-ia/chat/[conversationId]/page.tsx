// File: app/assistant-ia/chat/[conversationId]/page.tsx
// Role: server wrapper qui passe `conversationId` (URL dynamique) à
// `ChatClient`. Cette route est l'URL stable après création — le code
// `/assistant-ia/chat?q=...` reste fonctionnel en amorce (rétro-compat),
// après le premier message on bascule via `router.replace`.
//
// Force-dynamic identique à la route /chat racine (cf. commentaire sur
// useSearchParams dans ../page.tsx).

export const dynamic = "force-dynamic";

import ChatClient from "../ChatClient";

export default async function AssistantIaChatConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return <ChatClient forcedConversationId={conversationId} />;
}
