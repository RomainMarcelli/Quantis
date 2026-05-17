// File: components/ai/AiResponseCard.tsx
// Role: rend une réponse IA structurée (`AiStructuredResponse`) sous forme
// de blocs visuels distincts plutôt que d'un markdown brut. Les blocs A-F
// apparaissent en cascade avec un stagger de 150 ms (animation
// vyzor-block-stagger-12 — translateY 12 px, durée 400 ms).
//
// Blocs :
//   A. Diagnostic — bandeau coloré (rouge/orange/vert/neutre) + icône
//   B. Explication — texte 13 px, mots clés en bold blanc
//   C. Data points (optionnel) — micro-cards `AiDataCard` (variation, sparkline)
//   D. Comparaison (optionnel) — 2 barres horizontales (actuel vs référence)
//   E. Actions — chips dorés (Simuler / Voir détail / Comparer) avec glow hover
//   F. Follow-ups — chips discrets (questions de suivi pré-remplies)
//
// Si une réponse n'a pas de structuré (vieille conversation persistée),
// l'appelant doit construire le structuré via `buildStructuredFromMarkdown`.
"use client";

import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  Check,
  CheckCircle,
  Copy,
  Eye,
  Lightbulb,
  RotateCcw,
  Sliders,
  TrendingUp,
} from "lucide-react";
import { AiDataCard } from "@/components/ai/AiDataCard";
import type {
  AiAction,
  AiActionIcon,
  AiDataPoint,
  AiDiagnosticStatus,
  AiStructuredResponse,
} from "@/lib/ai/types";

const ACTION_ICONS: Record<AiActionIcon, typeof AlertTriangle> = {
  Sliders,
  BarChart3,
  ArrowRight,
  TrendingUp,
  Eye,
  Calendar,
};

// Délais staggered des blocs A-F (en ms). 150 ms entre chaque pour un
// rendu en cascade visible sans être lent.
const BLOCK_DELAYS = {
  diagnostic: 0,
  explanation: 150,
  data: 300,
  comparison: 450,
  actions: 450, // mutually-exclusive avec data dans la pratique
  followUp: 600,
} as const;

const STATUS_TO_STYLE: Record<
  AiDiagnosticStatus,
  { bg: string; border: string; color: string; Icon: typeof AlertTriangle }
> = {
  danger: {
    bg: "rgba(239, 68, 68, 0.08)",
    border: "#EF4444",
    color: "var(--app-danger)",
    Icon: AlertTriangle,
  },
  good: {
    bg: "rgba(34, 197, 94, 0.08)",
    border: "#22C55E",
    color: "var(--app-success)",
    Icon: CheckCircle,
  },
  neutral: {
    bg: "rgba(197, 160, 89, 0.08)",
    border: "var(--app-brand-gold-deep)",
    color: "var(--app-brand-gold-deep)",
    Icon: Lightbulb,
  },
};

/**
 * Question pré-formulée envoyée quand l'utilisateur clique sur l'action
 * "Comparer avec N-1". Volontairement explicite et naturelle en français —
 * c'est cette question qui apparaitra dans la conversation côté user.
 */
export const COMPARE_PREVIOUS_PERIOD_PROMPT =
  "Comparez avec l'année dernière (N-1).";

type AiResponseCardProps = {
  response: AiStructuredResponse;
  /**
   * Callback quand l'utilisateur clique sur un follow-up OU sur l'action
   * "Comparer avec N-1" — la chaîne est envoyée comme nouvelle question dans
   * la conversation. Optionnel : si non fourni, les boutons sont rendus mais
   * non interactifs (utile en SSR / preview).
   */
  onAskFollowUp?: (question: string) => void;
  /**
   * Callback pour l'action "Voir le détail". Reçoit le `kpiId` cible. Si
   * non fourni OU si le kpiId de la réponse est absent → le bouton est masqué
   * (pas de no-op visuel qui ne fait rien au clic).
   */
  onViewDetail?: (kpiId: string) => void;
  /**
   * Callback pour l'action "Voir le graphique" (Mission 2). Reçoit le `kpiId`
   * cible. Si non fourni → le bouton est masqué. Distinct de `onViewDetail` :
   * route vers `/analysis?focusChart=<id>` (scroll vers le graphique
   * d'évolution) plutôt que vers la card KPI.
   */
  onViewChart?: (kpiId: string) => void;
  /**
   * Callback "Copier" — déclenché au clic sur le bouton Copier. Reçoit le
   * texte brut du message courant via le wrapper côté AiMessageBubble. Si
   * absent, le bouton n'est pas rendu.
   */
  onCopy?: () => void;
  /**
   * Callback "Régénérer" — déclenché au clic sur le bouton Régénérer (sans
   * confirmation). Le parent (AiChatFullPage) retrouve la question user
   * précédente, retire le message courant, et rejoue la question.
   */
  onRegenerate?: () => void;
};

export function AiResponseCard({
  response,
  onAskFollowUp,
  onViewDetail,
  onViewChart,
  onCopy,
  onRegenerate,
}: AiResponseCardProps) {
  function handleAction(action: AiAction) {
    if (action.type === "navigate") {
      // "Voir le détail" — navigation vers la page d'analyse du KPI ciblé.
      if (onViewDetail && action.target) {
        onViewDetail(action.target);
      }
      return;
    }
    if (action.type === "chart") {
      // "Voir le graphique" — navigation vers le graphique d'évolution du
      // KPI (scroll + halo) sur la page d'analyse.
      if (onViewChart && action.target) {
        onViewChart(action.target);
      }
      return;
    }
    if (action.type === "compare") {
      // "Comparer avec N-1" — on injecte une question pré-formulée dans le
      // flow de conversation. Le serveur répondra normalement avec une analyse
      // comparative N vs N-1.
      if (onAskFollowUp) {
        onAskFollowUp(COMPARE_PREVIOUS_PERIOD_PROMPT);
      }
      return;
    }
    if (action.type === "simulate") {
      // Hors périmètre Phase 1 — pas de handler câblé ici. Le bouton reste
      // visuel ; à raccorder quand la feature simulation sera connectée à
      // l'agent IA.
      return;
    }
  }

  /**
   * Filtre les actions pour masquer celles qui ne peuvent rien faire.
   * Règle : "Voir le détail" (navigate) est masqué UNIQUEMENT quand
   * `onViewDetail` n'est pas fourni. Si le handler existe mais que la
   * réponse n'a pas de `target` (kpiId), le bouton est rendu : le handler
   * gérera le no-op (il vérifie `!kpiId`) — laisse l'utilisateur cliquer
   * sans surprise visuelle de bouton manquant.
   */
  const visibleActions = response.actions.filter((action) => {
    if (action.type === "navigate") {
      return Boolean(onViewDetail);
    }
    if (action.type === "chart") {
      return Boolean(onViewChart);
    }
    if (action.type === "compare") {
      return Boolean(onAskFollowUp);
    }
    // simulate : non câblé pour l'instant — masqué pour ne pas montrer un
    // bouton inerte. Réactiver quand le handler sera dispo.
    return false;
  });

  return (
    <div className="space-y-3">
      {/* Bloc A — Diagnostic (masqué si message vide pour éviter un bandeau
          inerte quand le KPI n'est pas dans le registre) */}
      {response.diagnostic.message ? (
        <DiagnosticBlock
          status={response.diagnostic.status}
          message={response.diagnostic.message}
          delay={BLOCK_DELAYS.diagnostic}
        />
      ) : null}

      {/* Bloc B — Explication (masqué si `null` ou string vide — supprime le
          fallback générique "Vue d'ensemble de votre situation financière"
          qui apparaissait avant en tête de chaque réponse) */}
      {response.explanation ? (
        <ExplanationBlock text={response.explanation} delay={BLOCK_DELAYS.explanation} />
      ) : null}

      {/* Bloc C — Data points (optionnel) */}
      {response.dataPoints && response.dataPoints.length > 0 ? (
        <DataPointsBlock points={response.dataPoints} delay={BLOCK_DELAYS.data} />
      ) : null}

      {/* Bloc D — Comparaison (optionnel) */}
      {response.comparison ? (
        <ComparisonBlock comparison={response.comparison} delay={BLOCK_DELAYS.comparison} />
      ) : null}

      {/* Bloc E — Actions (toujours présent) */}
      {visibleActions.length > 0 ? (
        <ActionsBlock
          actions={visibleActions}
          delay={BLOCK_DELAYS.actions}
          onAction={handleAction}
        />
      ) : null}

      {/* Bloc F — Questions de suivi (toujours présent) */}
      {response.followUpQuestions.length > 0 && onAskFollowUp ? (
        <FollowUpBlock
          questions={response.followUpQuestions}
          delay={BLOCK_DELAYS.followUp}
          onPick={onAskFollowUp}
        />
      ) : null}

      {/* Bloc G — Actions sur le message (Copier / Régénérer). Cohérent avec
          ChatGPT / Claude : présent sous chaque réponse assistant finalisée,
          à droite, plus discret que les chips d'action métier. Masqué pendant
          le streaming par AiMessageBubble (qui ne rend pas AiResponseCard). */}
      {(onCopy || onRegenerate) ? (
        <MessageActionsBlock onCopy={onCopy} onRegenerate={onRegenerate} />
      ) : null}
    </div>
  );
}

/**
 * Boutons Copier + Régénérer rendus sous la réponse assistant. Comportement :
 *   - Copier : navigator.clipboard.writeText, feedback Check 1.5 s.
 *   - Régénérer : appelle `onRegenerate` directement (pas de confirmation).
 *
 * Erreur clipboard silencieuse (peut être indisponible en HTTP non-localhost).
 */
function MessageActionsBlock({
  onCopy,
  onRegenerate,
}: {
  onCopy?: () => void;
  onRegenerate?: () => void;
}) {
  /**
   * Feedback visuel "Copié !" géré via mutation DOM directe (data-attribute
   * `data-copied` + swap des nodes Check/Copy par CSS sibling). On évite
   * `useState` côté React pour que le composant reste stateless — le test
   * walker (qui appelle les fonctions de composants pour traverser leur
   * output) ne supporte pas les hooks. La logique reste simple et locale.
   */
  const handleCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
    onCopy?.();
    const btn = e.currentTarget;
    btn.setAttribute("data-copied", "true");
    btn.setAttribute("aria-label", "Copié !");
    const label = btn.querySelector("[data-copy-label]");
    if (label) label.textContent = "Copié !";
    const iconCopy = btn.querySelector("[data-copy-icon='default']") as HTMLElement | null;
    const iconCheck = btn.querySelector("[data-copy-icon='done']") as HTMLElement | null;
    if (iconCopy) iconCopy.style.display = "none";
    if (iconCheck) iconCheck.style.display = "inline-block";
    btn.style.color = "var(--app-success)";
    setTimeout(() => {
      btn.removeAttribute("data-copied");
      btn.setAttribute("aria-label", "Copier");
      if (label) label.textContent = "Copier";
      if (iconCopy) iconCopy.style.display = "inline-block";
      if (iconCheck) iconCheck.style.display = "none";
      btn.style.color = "var(--app-text-tertiary)";
    }, 1500);
  };

  return (
    <div className="flex justify-end gap-1.5 pt-1">
      {onCopy ? (
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copier"
          data-ai-action="copy"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition"
          style={{ color: "var(--app-text-tertiary)", backgroundColor: "transparent" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--app-surface-soft)";
            if (!e.currentTarget.hasAttribute("data-copied")) {
              e.currentTarget.style.color = "var(--app-text-secondary)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            if (!e.currentTarget.hasAttribute("data-copied")) {
              e.currentTarget.style.color = "var(--app-text-tertiary)";
            }
          }}
        >
          <Copy
            data-copy-icon="default"
            className="h-3.5 w-3.5"
            style={{ display: "inline-block" }}
          />
          <Check
            data-copy-icon="done"
            className="h-3.5 w-3.5"
            style={{ display: "none" }}
          />
          <span data-copy-label>Copier</span>
        </button>
      ) : null}
      {onRegenerate ? (
        <button
          type="button"
          onClick={onRegenerate}
          aria-label="Régénérer"
          data-ai-action="regenerate"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition"
          style={{ color: "var(--app-text-tertiary)", backgroundColor: "transparent" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--app-surface-soft)";
            e.currentTarget.style.color = "var(--app-text-secondary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--app-text-tertiary)";
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Régénérer</span>
        </button>
      ) : null}
    </div>
  );
}

function DiagnosticBlock({
  status,
  message,
  delay,
}: {
  status: AiDiagnosticStatus;
  message: string;
  delay: number;
}) {
  const s = STATUS_TO_STYLE[status];
  const Icon = s.Icon;
  return (
    <div
      className="vyzor-block-enter-12 flex items-start gap-2.5 rounded-lg px-3.5 py-2.5"
      style={{
        backgroundColor: s.bg,
        borderLeft: `3px solid ${s.border}`,
        animationDelay: `${delay}ms`,
      }}
    >
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: s.color }} />
      <p className="text-[13px] font-semibold leading-snug" style={{ color: s.color }}>
        {message}
      </p>
    </div>
  );
}

/**
 * Rendu de l'explication avec **gras** simple. Pas de markdown complet —
 * juste le bold pour mettre en avant les mots-clés financiers.
 */
function ExplanationBlock({ text, delay }: { text: string; delay: number }) {
  const tokens = renderBold(text);
  return (
    <p
      className="vyzor-block-enter-12 text-[13px] leading-relaxed"
      style={{ color: "var(--app-text-secondary)", animationDelay: `${delay}ms` }}
    >
      {tokens}
    </p>
  );
}

function renderBold(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) tokens.push(text.slice(lastIndex, match.index));
    tokens.push(
      <strong key={`b-${key++}`} className="font-semibold text-white">
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) tokens.push(text.slice(lastIndex));
  return tokens;
}

function DataPointsBlock({ points, delay }: { points: AiDataPoint[]; delay: number }) {
  return (
    <div
      className="vyzor-block-enter-12 flex flex-col gap-2 sm:flex-row"
      style={{ animationDelay: `${delay}ms` }}
    >
      {points.map((p, i) => (
        <div key={`${p.label}-${i}`} className="flex-1">
          <AiDataCard
            label={p.label}
            value={p.value}
            variationPct={p.variationPct ?? null}
            kpiId={p.kpiId}
            sparklinePoints={p.sparklinePoints}
          />
        </div>
      ))}
    </div>
  );
}

function ComparisonBlock({
  comparison,
  delay,
}: {
  comparison: NonNullable<AiStructuredResponse["comparison"]>;
  delay: number;
}) {
  const maxAbs = Math.max(Math.abs(comparison.current.value), Math.abs(comparison.reference.value));
  const currentPct = maxAbs > 0 ? (Math.abs(comparison.current.value) / maxAbs) * 100 : 0;
  const referencePct = maxAbs > 0 ? (Math.abs(comparison.reference.value) / maxAbs) * 100 : 0;

  return (
    <div
      className="vyzor-block-enter-12 rounded-lg p-3"
      style={{ backgroundColor: "var(--app-surface-soft)", animationDelay: `${delay}ms` }}
    >
      <div className="space-y-2">
        <Bar
          label={comparison.current.label}
          value={comparison.current.value}
          widthPct={currentPct}
          color="linear-gradient(90deg, rgba(197,160,89,0.6), rgba(197,160,89,0.2))"
        />
        <Bar
          label={comparison.reference.label}
          value={comparison.reference.value}
          widthPct={referencePct}
          color="var(--app-border-strong)"
          textColor="var(--app-text-secondary)"
        />
      </div>
    </div>
  );
}

function Bar({
  label,
  value,
  widthPct,
  color,
  textColor = "var(--app-text-primary)",
}: {
  label: string;
  value: number;
  widthPct: number;
  color: string;
  textColor?: string;
}) {
  const formatted = formatBarValue(value);
  return (
    <div className="flex items-center gap-3">
      <div
        className="relative h-6 flex-1 overflow-hidden rounded"
        style={{ backgroundColor: "var(--app-surface-soft)" }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded transition-all"
          style={{ width: `${Math.max(widthPct, 4)}%`, background: color }}
        />
      </div>
      <div className="flex min-w-[110px] flex-col text-right">
        <span className="text-[12px] font-semibold" style={{ color: textColor }}>
          {formatted}
        </span>
        <span className="text-[10px]" style={{ color: "var(--app-text-tertiary)" }}>
          {label}
        </span>
      </div>
    </div>
  );
}

function formatBarValue(value: number): string {
  if (Math.abs(value) >= 1000) return `${Math.round(value).toLocaleString("fr-FR")}`;
  return value.toFixed(1).replace(".0", "");
}

function ActionsBlock({
  actions,
  delay,
  onAction,
}: {
  actions: AiAction[];
  delay: number;
  onAction: (action: AiAction) => void;
}) {
  return (
    <div
      className="vyzor-block-enter-12 flex flex-wrap gap-2"
      style={{ animationDelay: `${delay}ms` }}
    >
      {actions.map((action, i) => {
        const Icon = ACTION_ICONS[action.icon] ?? ArrowRight;
        return (
          <button
            key={`${action.label}-${i}`}
            type="button"
            onClick={() => onAction(action)}
            aria-label={action.label}
            className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition"
            style={{
              borderColor: "rgba(197, 160, 89, 0.4)",
              color: "var(--app-brand-gold-deep)",
              backgroundColor: "transparent",
              boxShadow: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(197, 160, 89, 0.1)";
              e.currentTarget.style.borderColor = "rgba(197, 160, 89, 0.6)";
              // Glow doré subtil — renforce l'affordance "interactive" sans
              // être tape-à-l'œil. 12 px de blur, opacité 0.15.
              e.currentTarget.style.boxShadow = "0 0 12px rgba(197, 160, 89, 0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.borderColor = "rgba(197, 160, 89, 0.4)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FollowUpBlock({
  questions,
  delay,
  onPick,
}: {
  questions: string[];
  delay: number;
  onPick: (q: string) => void;
}) {
  return (
    <div
      className="vyzor-block-enter-12 flex flex-wrap gap-2"
      style={{ animationDelay: `${delay}ms` }}
    >
      {questions.map((q, i) => (
        <button
          key={`${q}-${i}`}
          type="button"
          onClick={() => onPick(q)}
          aria-label={`Poser la question : ${q}`}
          data-ai-followup
          className="vyzor-followup-chip rounded-full border px-3 py-1 text-[12px] transition"
          style={{
            borderColor: "var(--app-border-strong)",
            backgroundColor: "var(--app-surface-soft)",
            color: "var(--app-text-secondary)",
          }}
        >
          {q}
        </button>
      ))}
    </div>
  );
}
