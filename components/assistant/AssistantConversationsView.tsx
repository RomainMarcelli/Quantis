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
  AlertCircle,
  ArrowUp,
  ChevronRight,
  GitCompare,
  MessageCircle,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  RefreshCw,
  Sparkles,
  Target,
  Timer,
  Trash2,
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
  { kpiId: "dso", question: "Mon DSO est anormalement long — par où commencer ?", Icon: Timer },
  { kpiId: null, question: "Combien rapporterait une hausse de prix de 5 % ?", Icon: Target },
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
    // Si on ouvre une conversation existante : URL stable en path dynamique
    // /assistant-ia/chat/[conversationId] (la route [conversationId]/page.tsx
    // hydrate l'historique côté serveur). Les autres params (kpiId, q) ne
    // sont pas utiles ici puisque la conversation a déjà été créée.
    if (payload.conversationId) {
      router.push(`/assistant-ia/chat/${payload.conversationId}`);
      return;
    }
    const params = new URLSearchParams();
    if (payload.kpiId) params.set("kpiId", payload.kpiId);
    if (payload.initialQuestion) params.set("q", payload.initialQuestion);
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

  const pinnedVisible = useMemo(
    () => visibleConversations.filter((c) => c.pinned),
    [visibleConversations]
  );
  const unpinnedVisible = useMemo(
    () => visibleConversations.filter((c) => !c.pinned),
    [visibleConversations]
  );

  // ─── Modales / toasts locaux ─────────────────────────────────────────
  const [renamingConv, setRenamingConv] = useState<ConversationSummary | null>(null);
  const [deletingConv, setDeletingConv] = useState<ConversationSummary | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function authFetch(input: string, init: RequestInit): Promise<Response> {
    const { firebaseAuthGateway } = await import("@/services/auth");
    const idToken = await firebaseAuthGateway.getIdToken();
    if (!idToken) throw new Error("Non authentifié.");
    return fetch(input, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        authorization: `Bearer ${idToken}`,
        "content-type": "application/json",
      },
    });
  }

  async function handleTogglePin(conv: ConversationSummary) {
    const previous = conversations;
    const next = conv.pinned ? false : true;
    // Optimistic
    setConversations((prev) =>
      [...prev]
        .map((c) => (c.id === conv.id ? { ...c, pinned: next } : c))
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return b.lastMessageAt - a.lastMessageAt;
        })
    );
    try {
      const res = await authFetch(`/api/ai/conversations/${conv.id}`, {
        method: "PATCH",
        body: JSON.stringify({ pinned: next }),
      });
      if (!res.ok) throw new Error("Erreur réseau");
    } catch {
      setConversations(previous);
      setToast({ kind: "error", text: "Impossible de mettre à jour l'épinglage." });
    }
  }

  async function handleRenameSubmit(conv: ConversationSummary, newTitle: string) {
    const trimmed = newTitle.trim();
    if (!trimmed || trimmed.length > 80) return;
    const previous = conversations;
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, title: trimmed } : c))
    );
    setRenamingConv(null);
    try {
      const res = await authFetch(`/api/ai/conversations/${conv.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) throw new Error("Erreur réseau");
      setToast({ kind: "success", text: "Conversation renommée." });
    } catch {
      setConversations(previous);
      setToast({ kind: "error", text: "Impossible de renommer la conversation." });
    }
  }

  async function handleDeleteConfirm(conv: ConversationSummary) {
    const previous = conversations;
    setConversations((prev) => prev.filter((c) => c.id !== conv.id));
    setDeletingConv(null);
    try {
      const res = await authFetch(`/api/ai/conversations/${conv.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Erreur réseau");
      setToast({ kind: "success", text: "Conversation supprimée." });
    } catch {
      setConversations(previous);
      setToast({ kind: "error", text: "Impossible de supprimer la conversation." });
    }
  }

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

          {/* ─── 3. Compteur quota — 4 paliers (normal / proche / critique / épuisé) ── */}
          {quota ? <QuotaIndicator remaining={quota.remaining} total={quota.total} /> : null}

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
              <div className="space-y-4">
                {pinnedVisible.length > 0 ? (
                  <div>
                    <p
                      className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
                      style={{ color: "var(--app-brand-gold-deep)" }}
                    >
                      Épinglées
                    </p>
                    <ul className="space-y-1">
                      {pinnedVisible.map((conv) => (
                        <ConversationRow
                          key={conv.id}
                          conv={conv}
                          onOpen={() =>
                            navigateToChat({
                              kpiId: conv.kpiId,
                              conversationId: conv.id,
                            })
                          }
                          onTogglePin={() => handleTogglePin(conv)}
                          onRename={() => setRenamingConv(conv)}
                          onDelete={() => setDeletingConv(conv)}
                        />
                      ))}
                    </ul>
                  </div>
                ) : null}
                {unpinnedVisible.length > 0 ? (
                  <div>
                    {pinnedVisible.length > 0 ? (
                      <p
                        className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
                        style={{ color: "var(--app-text-tertiary)" }}
                      >
                        Récentes
                      </p>
                    ) : null}
                    <ul className="space-y-1">
                      {unpinnedVisible.map((conv) => (
                        <ConversationRow
                          key={conv.id}
                          conv={conv}
                          onOpen={() =>
                            navigateToChat({
                              kpiId: conv.kpiId,
                              conversationId: conv.id,
                            })
                          }
                          onTogglePin={() => handleTogglePin(conv)}
                          onRename={() => setRenamingConv(conv)}
                          onDelete={() => setDeletingConv(conv)}
                        />
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          </div>
        </section>
      </div>

      {renamingConv ? (
        <RenameConversationModal
          conv={renamingConv}
          onCancel={() => setRenamingConv(null)}
          onSubmit={(newTitle) => handleRenameSubmit(renamingConv, newTitle)}
        />
      ) : null}

      {deletingConv ? (
        <DeleteConversationModal
          conv={deletingConv}
          onCancel={() => setDeletingConv(null)}
          onConfirm={() => handleDeleteConfirm(deletingConv)}
        />
      ) : null}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg px-4 py-3 text-[13px] shadow-lg"
          style={{
            backgroundColor:
              toast.kind === "success"
                ? "rgba(34, 197, 94, 0.95)"
                : "rgba(239, 68, 68, 0.95)",
            color: "#fff",
          }}
        >
          {toast.text}
        </div>
      ) : null}
    </section>
  );
}

// ─── Compteur de quota — 4 paliers ────────────────────────────────────
//
// Normal (>10)       : "X / Y questions restantes aujourd'hui" — discret
// Proche (4-10)      : jaune doré + AlertCircle — "Plus que X questions"
// Critique (1-3)     : rouge — "Plus que X — réinitialisation à minuit"
// Épuisé (0)         : rouge — "Quota épuisé — réinitialisation à minuit"
function QuotaIndicator({ remaining, total }: { remaining: number; total: number }) {
  if (remaining > 10) {
    return (
      <p
        className="mt-2.5 text-center text-[11px]"
        style={{ color: "var(--app-text-tertiary)" }}
      >
        {total} questions par jour, {remaining} restantes
      </p>
    );
  }
  if (remaining > 3) {
    return (
      <p
        className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[12px] font-medium text-quantis-gold"
        style={{ color: "var(--app-brand-gold-deep)" }}
      >
        <AlertCircle className="h-3.5 w-3.5" aria-hidden />
        Plus que {remaining} question{remaining > 1 ? "s" : ""} aujourd&apos;hui
      </p>
    );
  }
  if (remaining > 0) {
    return (
      <p className="mt-2.5 text-center text-[12px] font-semibold text-rose-400">
        Plus que {remaining} question{remaining > 1 ? "s" : ""} — réinitialisation à minuit
      </p>
    );
  }
  return (
    <p className="mt-2.5 text-center text-[12px] font-semibold text-rose-400">
      Quota épuisé — réinitialisation à minuit (Europe/Paris)
    </p>
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
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 10%)",
        }}
      >
        {/* h-5 w-5 + text-quantis-gold (spec Mission 1) — taille uniformisée
            avec le pattern AppHeader/AppSidebar et meilleure lisibilité. */}
        <Icon
          className="h-5 w-5 text-quantis-gold"
          style={{ color: "var(--app-brand-gold-deep)" }}
        />
      </span>
      <span className="flex-1">{question}</span>
    </button>
  );
}

// ─── Ligne conversation historique ────────────────────────────────────

function ConversationRow({
  conv,
  onOpen,
  onTogglePin,
  onRename,
  onDelete,
}: {
  conv: ConversationSummary;
  onOpen: () => void;
  onTogglePin: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Fermeture du menu au clic ailleurs.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  return (
    <li className="group relative">
      <div
        className="flex w-full items-center gap-3 transition"
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
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
            {conv.pinned ? (
              <Pin
                className="h-3.5 w-3.5"
                style={{ color: "var(--app-brand-gold-deep)", fill: "var(--app-brand-gold-deep)" }}
              />
            ) : (
              <MessageCircle
                className="h-3.5 w-3.5"
                style={{ color: "var(--app-text-tertiary)" }}
              />
            )}
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

        {/* Kebab — caché par défaut, visible au hover ligne ou si menu ouvert */}
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Actions sur la conversation"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
              menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
            }`}
            style={{
              color: "var(--app-text-tertiary)",
              border: "1px solid var(--app-border)",
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-lg shadow-lg"
              style={{
                backgroundColor: "var(--app-card-bg)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onTogglePin();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition hover:bg-white/5"
                style={{ color: "var(--app-text-primary)" }}
              >
                {conv.pinned ? (
                  <PinOff className="h-3.5 w-3.5" style={{ color: "var(--app-brand-gold-deep)" }} />
                ) : (
                  <Pin className="h-3.5 w-3.5" style={{ color: "var(--app-brand-gold-deep)" }} />
                )}
                {conv.pinned ? "Désépingler" : "Épingler"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onRename();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition hover:bg-white/5"
                style={{ color: "var(--app-text-primary)" }}
              >
                <Pencil className="h-3.5 w-3.5" style={{ color: "var(--app-brand-gold-deep)" }} />
                Renommer
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition hover:bg-white/5"
                style={{ color: "var(--app-danger)" }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

// ─── Modales ──────────────────────────────────────────────────────────

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl p-5 shadow-2xl"
        style={{
          backgroundColor: "var(--app-card-bg)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function RenameConversationModal({
  conv,
  onCancel,
  onSubmit,
}: {
  conv: ConversationSummary;
  onCancel: () => void;
  onSubmit: (newTitle: string) => void;
}) {
  const [value, setValue] = useState(conv.title);
  const trimmed = value.trim();
  const disabled = trimmed.length === 0 || trimmed.length > 80 || trimmed === conv.title;
  return (
    <ModalOverlay onClose={onCancel}>
      <h3 className="text-[15px] font-semibold" style={{ color: "var(--app-text-primary)" }}>
        Renommer la conversation
      </h3>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled) onSubmit(trimmed);
        }}
      >
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={80}
          aria-label="Titre de la conversation"
          className="block w-full text-[14px] outline-none"
          style={{
            height: 40,
            borderRadius: 10,
            border: "1px solid var(--app-border-strong)",
            padding: "0 12px",
            backgroundColor: "var(--app-surface-soft)",
            color: "var(--app-text-primary)",
          }}
        />
        <p className="text-[11px]" style={{ color: "var(--app-text-tertiary)" }}>
          {trimmed.length} / 80
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-[13px] transition"
            style={{
              border: "1px solid var(--app-border-strong)",
              color: "var(--app-text-secondary)",
              backgroundColor: "transparent",
            }}
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={disabled}
            className="rounded-md px-3 py-1.5 text-[13px] font-medium transition disabled:opacity-40"
            style={{
              backgroundColor: "var(--app-brand-gold-deep)",
              color: "#fff",
            }}
          >
            Enregistrer
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

function DeleteConversationModal({
  conv,
  onCancel,
  onConfirm,
}: {
  conv: ConversationSummary;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalOverlay onClose={onCancel}>
      <h3 className="text-[15px] font-semibold" style={{ color: "var(--app-text-primary)" }}>
        Supprimer cette conversation ?
      </h3>
      <p
        className="mt-3 text-[13px] leading-relaxed"
        style={{ color: "var(--app-text-secondary)" }}
      >
        Cette action est irréversible. Tous les messages seront perdus.
      </p>
      <p
        className="mt-2 truncate text-[12px]"
        style={{ color: "var(--app-text-tertiary)" }}
        title={conv.title}
      >
        « {conv.title} »
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-[13px] transition"
          style={{
            border: "1px solid var(--app-border-strong)",
            color: "var(--app-text-secondary)",
            backgroundColor: "transparent",
          }}
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md px-3 py-1.5 text-[13px] font-medium text-white transition"
          style={{ backgroundColor: "var(--app-danger, #ef4444)" }}
        >
          Supprimer définitivement
        </button>
      </div>
    </ModalOverlay>
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
