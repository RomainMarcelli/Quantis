// File: components/ai/AiResponseCard.tsx
// Role: rend une réponse IA structurée (`AiStructuredResponse`) sous forme
// de blocs visuels distincts plutôt que d'un markdown brut. Les blocs A-F
// apparaissent en cascade avec un stagger de 100 ms (animation
// vyzor-block-stagger définie dans globals.css).
//
// Blocs :
//   A. Diagnostic — bandeau coloré (rouge/vert/neutre) avec icône + message
//   B. Explication — texte 13 px, mots clés en bold blanc
//   C. Data points (optionnel) — micro-cards inline (2-3 chiffres clés)
//   D. Comparaison (optionnel) — 2 barres horizontales (actuel vs référence)
//   E. Actions — chips dorés (Simuler / Voir détail / Comparer)
//   F. Follow-ups — chips discrets (questions de suivi pré-remplies)
//
// Si une réponse n'a pas de structuré (vieille conversation persistée),
// l'appelant doit construire le structuré via `buildStructuredFromMarkdown`.
"use client";

import { useRouter } from "next/navigation";
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

const STATUS_TO_STYLE: Record<
  AiDiagnosticStatus,
  { bg: string; border: string; color: string; Icon: typeof AlertTriangle; emoji: string }
> = {
  danger: {
    bg: "rgba(239, 68, 68, 0.08)",
    border: "#EF4444",
    color: "#FCA5A5",
    Icon: AlertTriangle,
    emoji: "🔴",
  },
  good: {
    bg: "rgba(34, 197, 94, 0.08)",
    border: "#22C55E",
    color: "#86EFAC",
    Icon: CheckCircle,
    emoji: "🟢",
  },
  neutral: {
    bg: "rgba(197, 160, 89, 0.08)",
    border: "#C5A059",
    color: "#E8D9B8",
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
  const router = useRouter();

  function handleAction(action: AiAction) {
    if (action.type === "navigate") {
      // Navigation vers l'onglet/section du KPI. Le routing exact dépend de
      // l'app — on dispatche un événement custom que l'app peut écouter
      // (ou ouvrir une page dédiée plus tard).
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
  }

  return (
    <div className="space-y-3">
      {/* Bloc A — Diagnostic (toujours présent) */}
      <DiagnosticBlock status={response.diagnostic.status} message={response.diagnostic.message} delay={0} />

      {/* Bloc B — Explication (toujours présent) */}
      <ExplanationBlock text={response.explanation} delay={100} />

      {/* Bloc C — Data points (optionnel) */}
      {response.dataPoints && response.dataPoints.length > 0 ? (
        <DataPointsBlock points={response.dataPoints} delay={200} router={router} />
      ) : null}

      {/* Bloc D — Comparaison (optionnel) */}
      {response.comparison ? <ComparisonBlock comparison={response.comparison} delay={300} /> : null}

      {/* Bloc E — Actions (toujours présent) */}
      {response.actions.length > 0 ? (
        <ActionsBlock actions={response.actions} delay={400} onAction={handleAction} />
      ) : null}

      {/* Bloc F — Questions de suivi (toujours présent) */}
      {response.followUpQuestions.length > 0 ? (
        <FollowUpBlock questions={response.followUpQuestions} delay={500} onPick={onFollowUp} />
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
      className="vyzor-block-enter flex items-start gap-2.5 rounded-lg px-3.5 py-2.5"
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
      className="vyzor-block-enter text-[13px] leading-relaxed"
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

function DataPointsBlock({
  points,
  delay,
  router,
}: {
  points: AiDataPoint[];
  delay: number;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <div
      className="vyzor-block-enter flex flex-col gap-2 sm:flex-row"
      style={{ animationDelay: `${delay}ms` }}
    >
      {points.map((p, i) => (
        <button
          key={`${p.label}-${i}`}
          type="button"
          onClick={() => {
            if (p.kpiId) {
              window.dispatchEvent(
                new CustomEvent("vyzor:kpi:navigate", { detail: { kpiId: p.kpiId } })
              );
            }
          }}
          aria-label={`${p.label} : ${p.value}`}
          className="flex flex-1 flex-col items-start gap-0.5 rounded-lg border px-3.5 py-2.5 text-left transition hover:shadow-[0_0_12px_rgba(197,160,89,0.18)]"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            borderColor: "rgba(255, 255, 255, 0.08)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "rgba(197, 160, 89, 0.3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
          }}
        >
          <span className="text-[18px] font-semibold tracking-tight text-white">{p.value}</span>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "#9CA3AF" }}>
            {p.label}
          </span>
        </button>
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
  // Largeurs proportionnelles : la valeur la plus grande (en absolu) = 100%.
  const maxAbs = Math.max(Math.abs(comparison.current.value), Math.abs(comparison.reference.value));
  const currentPct = maxAbs > 0 ? (Math.abs(comparison.current.value) / maxAbs) * 100 : 0;
  const referencePct = maxAbs > 0 ? (Math.abs(comparison.reference.value) / maxAbs) * 100 : 0;

  return (
    <div
      className="vyzor-block-enter rounded-lg p-3"
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
      <div className="relative h-6 flex-1 overflow-hidden rounded" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
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
    <div className="vyzor-block-enter flex flex-wrap gap-2" style={{ animationDelay: `${delay}ms` }}>
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
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(197, 160, 89, 0.1)";
              e.currentTarget.style.borderColor = "rgba(197, 160, 89, 0.6)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.borderColor = "rgba(197, 160, 89, 0.4)";
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
    <div className="vyzor-block-enter flex flex-wrap gap-2" style={{ animationDelay: `${delay}ms` }}>
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
