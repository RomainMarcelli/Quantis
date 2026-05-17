// File: app/assistant-ia/chat/ChatClient.tsx
// Role: client component qui contient toute la logique UI/auth de la page
// /assistant-ia/chat. Extrait dans un fichier séparé pour que `page.tsx`
// puisse rester un server component et déclarer `export const dynamic =
// "force-dynamic"` (les directives de routing ne sont pas autorisées dans
// un fichier "use client").
//
// Query params attendus (URL legacy /assistant-ia/chat?...) :
//   - kpiId            : id du KPI focus (optionnel)
//   - q                : question pré-remplie envoyée automatiquement
//   - kpiValue         : valeur courante (sert au header + au prompt)
//   - analysisId       : analyse pour contextualiser la réponse côté serveur
//   - conversationId   : reprise d'une conversation existante
//
// `forcedConversationId` : passé par la route dynamique
// `/assistant-ia/chat/[conversationId]` (URL stable après création). Prime
// sur le query param.
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AiChatFullPage } from "@/components/ai/AiChatFullPage";
import { firebaseAuthGateway } from "@/services/auth";
import type { ChatMessage, Conversation } from "@/lib/ai/types";

type ChatClientProps = {
  /** Conversation id passé par la route dynamique /chat/[conversationId].
   *  Prime sur le query param `?conversationId=` (legacy). */
  forcedConversationId?: string;
};

export default function ChatClient({ forcedConversationId }: ChatClientProps = {}) {
  const searchParams = useSearchParams();
  const [greetingName, setGreetingName] = useState("Utilisateur");
  const [initialMessages, setInitialMessages] = useState<ChatMessage[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(Boolean(forcedConversationId));

  // Récupère un prénom utilisateur pour la sidebar (pas critique — fallback OK).
  useEffect(() => {
    const unsubscribe = firebaseAuthGateway.subscribe((user) => {
      if (user?.displayName) setGreetingName(user.displayName.split(" ")[0] ?? "Utilisateur");
      else if (user?.email) setGreetingName(user.email.split("@")[0] ?? "Utilisateur");
    });
    return unsubscribe;
  }, []);

  const kpiId = searchParams.get("kpiId");
  const initialQuestion = searchParams.get("q");
  const kpiValueRaw = searchParams.get("kpiValue");
  const kpiValue = kpiValueRaw && Number.isFinite(Number(kpiValueRaw)) ? Number(kpiValueRaw) : null;
  const analysisId = searchParams.get("analysisId");
  const queryConversationId = searchParams.get("conversationId");
  const effectiveConversationId = forcedConversationId ?? queryConversationId;

  // Charge l'historique au mount quand on arrive sur l'URL stable
  // /assistant-ia/chat/[conversationId]. On ne déclenche pas l'auto-send :
  // l'utilisateur reprend une conversation existante.
  useEffect(() => {
    if (!forcedConversationId) return;
    let cancelled = false;
    void (async () => {
      try {
        const idToken = await firebaseAuthGateway.getIdToken();
        if (!idToken) {
          if (!cancelled) setLoadingHistory(false);
          return;
        }
        const res = await fetch(`/api/ai/conversations/${forcedConversationId}`, {
          headers: { authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) {
          if (!cancelled) setLoadingHistory(false);
          return;
        }
        const json = (await res.json()) as { conversation?: Conversation };
        if (!cancelled) {
          setInitialMessages(json.conversation?.messages ?? []);
          setLoadingHistory(false);
        }
      } catch {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forcedConversationId]);

  // Quand on est sur l'URL dynamique, on neutralise `initialQuestion` pour
  // éviter un auto-send au mount qui ajouterait une question déjà persistée.
  const effectiveInitialQuestion = forcedConversationId ? null : initialQuestion;

  return (
    <main className="premium-analysis-root relative min-h-screen w-full px-3 py-4 md:px-4 lg:px-6">
      <section className="w-full space-y-4">
        <AppHeader variant="simple" companyName="Assistant IA Vyzor" subtitle="Posez vos questions sur vos KPIs" />
        <div className="relative grid gap-6 grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)]">
          <AppSidebar activeRoute="assistant-ia" accountFirstName={greetingName} />
          <div className="min-w-0">
            {loadingHistory ? (
              <div
                className="precision-card flex items-center justify-center rounded-2xl p-8 text-sm"
                style={{ color: "var(--app-text-tertiary)" }}
              >
                Chargement de la conversation...
              </div>
            ) : (
              <AiChatFullPage
                kpiId={kpiId}
                kpiValue={kpiValue}
                initialQuestion={effectiveInitialQuestion}
                analysisId={analysisId}
                conversationId={effectiveConversationId}
                initialMessages={initialMessages ?? undefined}
              />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
