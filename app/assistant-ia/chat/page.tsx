// File: app/assistant-ia/chat/page.tsx
// Role: page plein écran de l'assistant IA. Remplace le tiroir latéral —
// la sidebar reste visible à gauche pour que l'utilisateur garde la
// navigation (effet "je peux revenir en arrière" préservé).
//
// Query params attendus :
//   - kpiId            : id du KPI focus (optionnel)
//   - q                : question pré-remplie envoyée automatiquement
//   - kpiValue         : valeur courante (sert au header + au prompt)
//   - analysisId       : analyse pour contextualiser la réponse côté serveur
//   - conversationId   : reprise d'une conversation existante
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AiChatFullPage } from "@/components/ai/AiChatFullPage";
import { firebaseAuthGateway } from "@/services/auth";

export default function AssistantIaChatPage() {
  const searchParams = useSearchParams();
  const [greetingName, setGreetingName] = useState("Utilisateur");

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
  const conversationId = searchParams.get("conversationId");

  return (
    <main className="premium-analysis-root relative min-h-screen w-full overflow-hidden px-3 py-4 md:px-4 lg:px-6">
      <section className="w-full space-y-4">
        <AppHeader companyName="Assistant IA Vyzor" subtitle="Chat" />
        <div className="relative grid gap-6 grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)]">
          <AppSidebar activeRoute="assistant-ia" accountFirstName={greetingName} />
          <div className="min-w-0">
            <AiChatFullPage
              kpiId={kpiId}
              kpiValue={kpiValue}
              initialQuestion={initialQuestion}
              analysisId={analysisId}
              conversationId={conversationId}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
