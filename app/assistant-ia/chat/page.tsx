// File: app/assistant-ia/chat/page.tsx
// Role: server wrapper minimal pour la page /assistant-ia/chat. Toute la
// logique vit dans `ChatClient` (client component avec useSearchParams).
//
// Pourquoi ce wrapper ?
//   `useSearchParams()` dans un client component force normalement un
//   <Suspense> parent, sinon Next 14+/16 fait planter le build statique
//   ("Error occurred prerendering page /assistant-ia/chat"). En marquant
//   la route entière comme dynamique côté serveur, on désactive le
//   prerendering : la page fonctionne alors **avec ou sans Suspense**,
//   le build Vercel passe dans tous les cas.
//
// La directive `dynamic` ne peut pas vivre dans un fichier "use client".
export const dynamic = "force-dynamic";

import ChatClient from "./ChatClient";

export default function AssistantIaChatPage() {
  return <ChatClient />;
}
