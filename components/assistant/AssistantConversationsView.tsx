// File: components/assistant/AssistantConversationsView.tsx
// Role: page d'accueil Assistant IA — refonte 09/05/2026 (cf. brief
// "Refonte page d'accueil Assistant IA"). Structure :
//   1. Hero centré (icône + titre + sous-titre) — invitation à interagir.
//   2. Champ de saisie large + bouton envoi gold-deep — action principale.
//   3. Compteur quota sous l'input (texte discret).
//   4. Suggestions en grille 2×2 (4 premières) avec icônes contextuelles.
//   5. Historique compact (3 plus récentes) + lien "Tout voir (N)".
//
// Aucune couleur hardcodée — tout passe par les CSS vars (--app-*) pour
// flip auto dark/light.
"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUp,
  ChevronRight,
  Clock,
  GitCompare,
  MessageCircle,
  Percent,
  RefreshCw,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { useDelayedFlag } from "@/lib/ui/useDelayedFlag";
import type { ConversationSummary } from "@/lib/ai/types";

type SampleQuestion = {
  kpiId: string | null;
  question: string;
  Icon: LucideIcon;
};

// 5 questions modèles — la 5e (healthScore) est intentionnellement
// au-delà du slice 4 utilisé par l'UI (cf. brief : "afficher les 4
// premières et cacher la 5e"). On la garde dans le tableau pour
// préserver l'option de l'afficher ailleurs (ou d'en faire tourner
// la sélection plus tard).
const GLOBAL_SAMPLE_QUESTIONS: SampleQuestion[] = [
  { kpiId: "ebitda", question: "Pourquoi mon EBITDA est-il négatif ce trimestre ?", Icon: TrendingDown },
  { kpiId: "bfr", question: "Quels leviers prioriser pour faire baisser mon BFR ?", Icon: RefreshCw },
  { kpiId: "dso", question: "Mon DSO est anormalement long — par où commencer ?", Icon: Clock },
  { kpiId: null, question: "Combien d'euros une hausse de prix de 5 % rapporterait sur mon résultat ?", Icon: Percent },
  { kpiId: "healthScore", question: "Ma santé financière s'est-elle améliorée vs l'an dernier ?", Icon: GitCompare },
];

const VISIBLE_SUGGESTIONS = 4;
const VISIBLE_CONVERSATIONS = 3;

type FetchState = "idle" | "loading" | "ready" | "error" | "unauth";

function AssistantConversationsViewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kpiIdParam = searchParams.get("kpi");
  const initialQuestion = searchParams.get("q");

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const showSlowLoader = useDelayedFlag(fetchState === "loading");
  const [quota, setQuota] = useState<{ remaining: number; total: number } | null>(null);
  const [greetingName, setGreetingName] = useState("Utilisateur");
  // Local input state pour le hero — quand l'utilisateur tape une question
  // libre puis Enter / clic bouton envoi → navigation vers /assistant-ia/chat.
  const [draftQuestion, setDraftQuestion] = useState("");
  // Toggle pour afficher toutes les conversations vs les 3 dernières.
  const [showAllConversations, setShowAllConversations] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    void (async () => {
      const { firebaseAuthGateway } = await import("@/services/auth");
      unsub = firebaseAuthGateway.subscribe((user) => {
        if (!user) return;
        const first =
          user.displayName?.trim().split(" ")[0] ||
          user.email?.split("@")[0] ||
          "Utilisateur";
        setGreetingName(first);
      });
    })();
    return () => unsub?.();
  }, []);

  const definition = kpiIdParam ? getKpiDefinition(kpiIdParam) : null;
  void definition; // gardé pour compat avec le query param ?kpi (cf. effet ci-dessous)

  const refresh = useCallback(async () => {
    setFetchState("loading");
    try {
      const { firebaseAuthGateway } = await import("@/services/auth");
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) {
        setFetchState("unauth");
        return;
      }
      const res = await fetch("/api/ai/conversations", {
        headers: { authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        setFetchState("error");
        return;
      }
      const json = (await res.json()) as {
        conversations: ConversationSummary[];
        quota: { remaining: number; used: number; total: number };
      };
      setConversations(json.conversations ?? []);
      setQuota({ remaining: json.quota.remaining, total: json.quota.total });
      setFetchState("ready");
    } catch {
      setFetchState("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Si on arrive depuis un tooltip avec ?kpi=…&q=…, on bascule directement
  // sur la page plein écran /assistant-ia/chat (comportement préservé).
  useEffect(() => {
    if (!kpiIdParam) return;
    const params = new URLSearchParams();
    params.set("kpiId", kpiIdParam);
    if (initialQuestion) params.set("q", initialQuestion);
    router.replace(`/assistant-ia/chat?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function navigateToChat(payload: {
    kpiId?: string | null;
    initialQuestion?: string | null;
    conversationId?: string | null;
  }) {
    const params = new URLSearchParams();
    if (payload.kpiId) params.set("kpiId", payload.kpiId);
    if (payload.initialQuestion) params.set("q", payload.initialQuestion);
    if (payload.conversationId) params.set("conversationId", payload.conversationId);
    const qs = params.toString();
    router.push(`/assistant-ia/chat${qs ? `?${qs}` : ""}`);
  }

  function handleSubmitDraft() {
    const trimmed = draftQuestion.trim();
    if (!trimmed) return;
    navigateToChat({ initialQuestion: trimmed });
  }

  const visibleSuggestions = useMemo(
    () => GLOBAL_SAMPLE_QUESTIONS.slice(0, VISIBLE_SUGGESTIONS),
    []
  );
  const visibleConversations = useMemo(
    () =>
      showAllConversations
        ? conversations
        : conversations.slice(0, VISIBLE_CONVERSATIONS),
    [conversations, showAllConversations]
  );

  // Sous-titre selon le brief Header unifié (09/05/2026).
  const headerSubtitle = "Posez vos questions sur vos KPIs";

  return (
    <section className="w-full space-y-4">
      <AppHeader
        variant="simple"
        companyName="Assistant IA Vyzor"
        subtitle={headerSubtitle}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
        <AppSidebar activeRoute="assistant-ia" accountFirstName={greetingName} />

        <section className="precision-card w-full rounded-2xl">
          {/* La tuile occupe toute la largeur disponible mais le contenu
              (hero, input, suggestions, historique) reste centré dans une
              colonne lisible — cf. brief 09/05/2026. */}
          <div className="mx-auto w-full max-w-3xl">
          {/* ─── 1. Hero centré ──────────────────────────────────────── */}
          <div className="flex flex-col items-center px-6 pb-9 pt-12 text-center md:px-8">
            <span
              aria-hidden="true"
              className="inline-flex h-12 w-12 items-center justify-center rounded-[14px]"
              style={{ backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 8%)" }}
            >
              <Sparkles className="h-6 w-6" style={{ color: "var(--app-brand-gold-deep)" }} />
            </span>
            <h1
              className="mt-4 text-[22px] font-medium leading-tight"
              style={{ color: "var(--app-text-primary)" }}
            >
              Que voulez-vous analyser ?
            </h1>
            <p
              className="mt-1.5 max-w-md text-sm leading-relaxed"
              style={{ color: "var(--app-text-secondary)" }}
            >
              Posez une question sur vos données financières. Vyzor analyse et vous répond.
            </p>
          </div>

          {/* ─── 2. Champ de saisie + bouton envoi ────────────────────── */}
          <div className="relative px-6 md:px-8">
            <input
              type="text"
              value={draftQuestion}
              onChange={(e) => setDraftQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmitDraft();
              }}
              placeholder="Ex : Pourquoi mon BFR a augmenté ce trimestre ?"
              aria-label="Posez votre question"
              className="block w-full text-[15px] outline-none"
              style={{
                height: 48,
                borderRadius: 14,
                border: "1px solid var(--app-border-strong)",
                padding: "0 56px 0 18px",
                backgroundColor: "var(--app-card-bg)",
                color: "var(--app-text-primary)",
                transition: "border-color 200ms ease, box-shadow 200ms ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--app-brand-gold-deep)";
                e.currentTarget.style.boxShadow =
                  "0 0 0 3px rgb(var(--app-brand-gold-deep-rgb) / 10%)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--app-border-strong)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            <button
              type="button"
              onClick={handleSubmitDraft}
              disabled={!draftQuestion.trim()}
              aria-label="Envoyer la question"
              className="absolute inline-flex items-center justify-center transition disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                top: 8,
                right: 32,
                width: 32,
                height: 32,
                borderRadius: 10,
                border: "none",
                backgroundColor: "var(--app-brand-gold-deep)",
                color: "#FFFFFF",
              }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.backgroundColor = "#7A6125";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--app-brand-gold-deep)";
              }}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>

          {/* ─── 3. Compteur quota ────────────────────────────────────── */}
          {quota ? (
            <p
              className="mt-2.5 text-center text-[11px]"
              style={{ color: "var(--app-text-tertiary)" }}
            >
              {quota.remaining} questions restantes aujourd&apos;hui
            </p>
          ) : null}

          {/* ─── 4. Suggestions grille 2×2 ────────────────────────────── */}
          <div className="mt-9 px-6 pb-9 md:px-8">
            <p
              className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em]"
              style={{ color: "var(--app-text-tertiary)" }}
            >
              Suggestions basées sur vos données
            </p>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {visibleSuggestions.map((sugg) => (
                <SuggestionCard
                  key={sugg.question}
                  question={sugg.question}
                  Icon={sugg.Icon}
                  onClick={() =>
                    navigateToChat({
                      kpiId: sugg.kpiId,
                      initialQuestion: sugg.question,
                    })
                  }
                />
              ))}
            </div>
          </div>

          {/* ─── 5. Historique compact ────────────────────────────────── */}
          <div
            className="px-6 pb-8 pt-5 md:px-8"
            style={{ borderTop: "1px solid var(--app-border)" }}
          >
            <header className="mb-3 flex items-center justify-between">
              <p
                className="text-[11px] font-medium uppercase tracking-[0.06em]"
                style={{ color: "var(--app-text-tertiary)" }}
              >
                Conversations récentes
              </p>
              {fetchState === "ready" && conversations.length > VISIBLE_CONVERSATIONS ? (
                <button
                  type="button"
                  onClick={() => setShowAllConversations((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-medium transition"
                  style={{ color: "var(--app-brand-gold-deep)" }}
                >
                  {showAllConversations
                    ? "Voir moins"
                    : `Tout voir (${conversations.length})`}
                  <ChevronRight
                    className="h-3 w-3 transition-transform"
                    style={{
                      transform: showAllConversations ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                  />
                </button>
              ) : null}
            </header>

            {fetchState === "loading" && showSlowLoader ? (
              <p className="text-sm" style={{ color: "var(--app-text-tertiary)" }}>
                Chargement de vos conversations...
              </p>
            ) : null}

            {fetchState === "error" ? (
              <p className="text-sm" style={{ color: "var(--app-danger)" }}>
                Impossible de récupérer vos conversations. Réessayez dans un instant.
              </p>
            ) : null}

            {fetchState === "unauth" ? (
              <p className="text-sm" style={{ color: "var(--app-text-tertiary)" }}>
                Connectez-vous pour retrouver vos conversations.
              </p>
            ) : null}

            {fetchState === "ready" && conversations.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--app-text-tertiary)" }}>
                Aucune conversation pour l&apos;instant. Posez votre première question
                ci-dessus ou utilisez l&apos;icône ✨ d&apos;un indicateur.
              </p>
            ) : null}

            {fetchState === "ready" && visibleConversations.length > 0 ? (
              <ul className="space-y-1">
                {visibleConversations.map((conv) => (
                  <ConversationRow
                    key={conv.id}
                    conv={conv}
                    onOpen={() =>
                      navigateToChat({
                        kpiId: conv.kpiId,
                        conversationId: conv.id,
                      })
                    }
                  />
                ))}
              </ul>
            ) : null}
          </div>
          </div>
        </section>
      </div>
    </section>
  );
}

// ─── Carte suggestion ─────────────────────────────────────────────────

function SuggestionCard({
  question,
  Icon,
  onClick,
}: {
  question: string;
  Icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-2.5 text-left transition"
      style={{
        padding: "14px 16px",
        borderRadius: 12,
        border: "1px solid var(--app-border)",
        backgroundColor: "var(--app-card-bg)",
        fontSize: 14,
        lineHeight: 1.4,
        color: "var(--app-text-primary)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor =
          "rgb(var(--app-brand-gold-deep-rgb) / 30%)";
        e.currentTarget.style.backgroundColor =
          "rgb(var(--app-brand-gold-deep-rgb) / 3%)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--app-border)";
        e.currentTarget.style.backgroundColor = "var(--app-card-bg)";
      }}
    >
      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center justify-center"
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 6%)",
        }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: "var(--app-brand-gold-deep)" }} />
      </span>
      <span className="flex-1">{question}</span>
    </button>
  );
}

// ─── Ligne conversation historique ────────────────────────────────────

function ConversationRow({
  conv,
  onOpen,
}: {
  conv: ConversationSummary;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 text-left transition"
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          backgroundColor: "transparent",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--app-surface-soft)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 items-center justify-center"
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            backgroundColor: "var(--app-surface-soft)",
          }}
        >
          <MessageCircle
            className="h-3.5 w-3.5"
            style={{ color: "var(--app-text-tertiary)" }}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className="truncate text-[13px]"
              style={{ color: "var(--app-text-primary)" }}
            >
              {conv.title}
            </span>
            {conv.kpiId ? (
              <span
                className="shrink-0 font-mono text-[10px] font-semibold uppercase"
                style={{
                  padding: "2px 7px",
                  borderRadius: 5,
                  backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 8%)",
                  color: "var(--app-brand-gold-deep)",
                  letterSpacing: "0.03em",
                }}
              >
                {getKpiDefinition(conv.kpiId)?.shortLabel ?? conv.kpiId}
              </span>
            ) : null}
          </span>
          <span
            className="mt-0.5 block text-[11px]"
            style={{ color: "var(--app-text-tertiary)" }}
          >
            {formatRelativeDate(conv.lastMessageAt)} · {conv.messageCount} message
            {conv.messageCount > 1 ? "s" : ""}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * Format relatif court (aujourd'hui / hier / il y a N jours / date).
 */
function formatRelativeDate(timestampMs: number): string {
  const now = Date.now();
  const diffDays = Math.floor((now - timestampMs) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} semaines`;
  const date = new Date(timestampMs);
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function AssistantConversationsView() {
  return (
    <Suspense
      fallback={
        <div
          className="precision-card mx-auto max-w-4xl rounded-2xl p-8 text-sm"
          style={{ color: "var(--app-text-tertiary)" }}
        >
          Chargement...
        </div>
      }
    >
      <AssistantConversationsViewInner />
    </Suspense>
  );
}
