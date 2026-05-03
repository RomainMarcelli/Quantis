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
  CheckCircle,
  Eye,
  Lightbulb,
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

/** Mapping des 5 niveaux de diagnostic vers l'apparence UI. Les emojis
 *  dupliquent l'icône lucide pour les utilisateurs qui scannent vite — la
 *  couleur portait déjà l'info, l'emoji renforce. */
const STATUS_TO_STYLE: Record<
  AiDiagnosticStatus,
  { bg: string; border: string; color: string; Icon: typeof AlertTriangle; emoji: string }
> = {
  excellent: {
    bg: "rgba(34, 197, 94, 0.10)",
    border: "#22C55E",
    color: "#86EFAC",
    Icon: CheckCircle,
    emoji: "✅",
  },
  good: {
    bg: "rgba(197, 160, 89, 0.08)",
    border: "#C5A059",
    color: "#E8D9B8",
    Icon: CheckCircle,
    emoji: "👍",
  },
  warning: {
    bg: "rgba(245, 158, 11, 0.08)",
    border: "#F59E0B",
    color: "#FCD34D",
    Icon: AlertTriangle,
    emoji: "⚠️",
  },
  danger: {
    bg: "rgba(239, 68, 68, 0.08)",
    border: "#EF4444",
    color: "#FCA5A5",
    Icon: AlertTriangle,
    emoji: "🚨",
  },
  neutral: {
    bg: "rgba(255, 255, 255, 0.04)",
    border: "rgba(255, 255, 255, 0.2)",
    color: "rgba(255, 255, 255, 0.85)",
    Icon: Lightbulb,
    emoji: "💡",
  },
};

type AiResponseCardProps = {
  response: AiStructuredResponse;
  /** Callback quand l'utilisateur clique sur un follow-up — envoyé comme nouveau message. */
  onFollowUp: (question: string) => void;
};

export function AiResponseCard({ response, onFollowUp }: AiResponseCardProps) {
  function handleAction(action: AiAction) {
    if (typeof window === "undefined") return;
    if (action.type === "navigate") {
      // Navigation vers l'onglet/section du KPI. Le routing exact dépend de
      // l'app — on dispatche un événement custom que les pages peuvent écouter.
      window.dispatchEvent(
        new CustomEvent("vyzor:kpi:navigate", { detail: { kpiId: action.target } })
      );
      return;
    }
    if (action.type === "simulate") {
      window.dispatchEvent(
        new CustomEvent("vyzor:simulation:open", {
          detail: { scenario: action.target },
        })
      );
      return;
    }
    if (action.type === "compare") {
      window.dispatchEvent(
        new CustomEvent("vyzor:temporality:set", { detail: { period: action.target } })
      );
      return;
    }
    if (action.type === "detail") {
      // "detail" = ouvrir le détail d'un KPI/section (équivalent navigate
      // mais sans hover sur l'onglet — focus direct sur la card du KPI).
      window.dispatchEvent(
        new CustomEvent("vyzor:kpi:focus", { detail: { kpiId: action.target } })
      );
      return;
    }
  }

  return (
    <div className="space-y-3">
      {/* Bloc A — Diagnostic (toujours présent) */}
      <DiagnosticBlock
        status={response.diagnostic.status}
        message={response.diagnostic.message}
        delay={BLOCK_DELAYS.diagnostic}
      />

      {/* Bloc B — Explication (toujours présent) */}
      <ExplanationBlock text={response.explanation} delay={BLOCK_DELAYS.explanation} />

      {/* Bloc C — Data points (optionnel) */}
      {response.dataPoints && response.dataPoints.length > 0 ? (
        <DataPointsBlock points={response.dataPoints} delay={BLOCK_DELAYS.data} />
      ) : null}

      {/* Bloc D — Comparaison (optionnel) */}
      {response.comparison ? (
        <ComparisonBlock comparison={response.comparison} delay={BLOCK_DELAYS.comparison} />
      ) : null}

      {/* Bloc E — Actions (toujours présent) */}
      {response.actions.length > 0 ? (
        <ActionsBlock
          actions={response.actions}
          delay={BLOCK_DELAYS.actions}
          onAction={handleAction}
        />
      ) : null}

      {/* Bloc F — Questions de suivi (toujours présent) */}
      {response.followUpQuestions.length > 0 ? (
        <FollowUpBlock
          questions={response.followUpQuestions}
          delay={BLOCK_DELAYS.followUp}
          onPick={onFollowUp}
        />
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
  return (
    <div
      className="vyzor-block-enter-12 flex items-start gap-2.5 rounded-lg px-3.5 py-2.5"
      style={{
        backgroundColor: s.bg,
        borderLeft: `3px solid ${s.border}`,
        animationDelay: `${delay}ms`,
      }}
    >
      <span className="text-base leading-none flex-shrink-0" aria-hidden>
        {s.emoji}
      </span>
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
      style={{ color: "rgba(255, 255, 255, 0.75)", animationDelay: `${delay}ms` }}
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
      style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", animationDelay: `${delay}ms` }}
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
          color="rgba(255, 255, 255, 0.1)"
          textColor="rgba(255, 255, 255, 0.6)"
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
  textColor = "rgba(255, 255, 255, 0.85)",
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
        style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
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
        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>
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
              color: "#C5A059",
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
          className="rounded-full border px-3 py-1 text-[12px] transition"
          style={{
            borderColor: "rgba(255, 255, 255, 0.08)",
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            color: "rgba(255, 255, 255, 0.7)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(197, 160, 89, 0.08)";
            e.currentTarget.style.color = "#E8D9B8";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.03)";
            e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)";
          }}
        >
          {q}
        </button>
      ))}
    </div>
  );
}
