// File: components/kpi/KpiTooltip.tsx
// Role: popover affiché au survol de l'icône ✨ posée dans le coin sup. droit
// d'une carte KPI. Lit les méta-données depuis le `kpiRegistry`.
//
// Contenu (6 lignes — spec produit) :
//   1. Nom complet du KPI (gras, blanc, 14 px)
//   2. Définition vulgarisée (gris #D1D5DB, 12 px) — depuis tooltip.explanation
//   3. Signal contextuel — UNIQUEMENT si diagnostic = good ou danger
//      (bandeau vert/rouge, bord gauche 3 px coloré)
//   4. Benchmark sectoriel — UNIQUEMENT si tooltip.benchmark existe
//   5. Formule — code monospace (JetBrains Mono), 11 px, fond rgba blanc 0.05
//   6. Question suggérée — bouton or qui ouvre l'AiChatPanel pré-rempli
//   7. Lien discret "Ou ouvrir le chat sans question" — ouvre le chat lié
//      au KPI sans envoyer la question (n'engage pas de tokens)
//
// NE figurent PAS : valeur courante, variation N-1, mini-graph, catégorie,
// nom vulgarisé. Ces infos sont sur la carte.
//
// ─── Choix architecturaux ───────────────────────────────────────────────
//
// Portal : le popover est rendu dans `document.body` via createPortal. Les
// cartes parents (`precision-card fade-up`) ont `overflow: hidden` pour leur
// effet de gradient, ce qui clippait le popover positionné en absolute.
//
// Ancrage coin-à-coin : on aligne UN COIN du popover sur LE MÊME COIN de la
// carte KPI. Le coin retenu dépend de l'emplacement du trigger DANS la carte :
//   - trigger dans la moitié haute → coin haut (tooltip s'étend vers le bas)
//   - trigger dans la moitié basse → coin bas  (tooltip s'étend vers le haut)
// Côté horizontal : suit `align`. Le popover OVERLAPPE la tuile — le backdrop
// blur derrière reste visible mais flouté, ce qui suffit à dégager le tooltip.
//
// Backdrop blur : un overlay plein écran s'affiche derrière le popover pour
// flouter/dimmer le reste de la page. Aide à focaliser l'attention sur le
// tooltip.
"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, Sparkles } from "lucide-react";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import { getKpiDiagnostic, pickSuggestedQuestion } from "@/lib/kpi/kpiDiagnostic";

type KpiTooltipProps = {
  kpiId: string;
  /** Valeur courante du KPI — sert à calculer le diagnostic (good/warning/danger). */
  value: number | null | undefined;
  /**
   * Position horizontale du popover par rapport au trigger.
   *  - "right" (défaut) : aligné à droite (le popover s'étire vers la gauche).
   *  - "left" : aligné à gauche (le popover s'étire vers la droite).
   * Le clamp horizontal évite tout débordement viewport.
   */
  align?: "left" | "right";
};

const POPOVER_WIDTH = 320;
const VIEWPORT_PADDING = 12;

// Durée des transitions enter/exit. ~200 ms est la zone douce — au-delà laggy,
// en-deçà raide. Doit matcher la valeur dans `transition-*`.
const ENTER_DURATION_MS = 220;
const LEAVE_DURATION_MS = 180;

type CornerVertical = "top" | "bottom";
type CornerHorizontal = "right" | "left";
type Position = {
  vertical: CornerVertical;
  horizontal: CornerHorizontal;
  // Coordonnées du coin ancré (en px depuis le bord correspondant du viewport).
  vAnchor: number;
  hAnchor: number;
};

/**
 * Remonte l'arbre DOM jusqu'à la carte KPI parente (`precision-card` ou
 * <article>). On ancre le popover sur cette carte, pas sur le trigger.
 */
function findKpiCardAncestor(el: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = el?.parentElement ?? null;
  while (cur && cur !== document.body) {
    if (cur.classList.contains("precision-card") || cur.tagName === "ARTICLE") {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

export function KpiTooltip({ kpiId, value, align = "right" }: KpiTooltipProps) {
  const definition = getKpiDefinition(kpiId);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  // Découplage : `renderInDom` = présence dans l'arbre React (= portal monté) ;
  // `animateIn` = classes/styles "ouvert" appliqués. On retarde animateIn d'un
  // double-RAF après le mount pour que le navigateur peigne d'abord l'état
  // initial avant de transitionner — sans ça la transition est invisible.
  const [renderInDom, setRenderInDom] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // Petit délai à la fermeture pour laisser la souris migrer du trigger au
  // popover sans flicker.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setRenderInDom(true);
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => setAnimateIn(true));
        return () => cancelAnimationFrame(r2);
      });
      return () => cancelAnimationFrame(r1);
    } else {
      setAnimateIn(false);
      const t = setTimeout(() => setRenderInDom(false), LEAVE_DURATION_MS);
      return () => clearTimeout(t);
    }
  }, [open]);

  function handleEnter() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  }
  function handleLeave() {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  // Position coin-à-coin sur la carte parente. Vertical = moitié occupée par
  // le trigger (haut → "top", bas → "bottom"). Horizontal = `align`.
  useLayoutEffect(() => {
    if (!open) return;
    function compute() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const triggerRect = trigger.getBoundingClientRect();
      const card = findKpiCardAncestor(trigger);
      const anchorRect = card ? card.getBoundingClientRect() : triggerRect;
      const vpHeight = window.innerHeight;
      const vpWidth = window.innerWidth;

      const triggerCenterY = (triggerRect.top + triggerRect.bottom) / 2;
      const tileCenterY = (anchorRect.top + anchorRect.bottom) / 2;
      const vertical: CornerVertical = triggerCenterY <= tileCenterY ? "top" : "bottom";

      const horizontal: CornerHorizontal = align;

      const vAnchor =
        vertical === "top"
          ? Math.max(VIEWPORT_PADDING, anchorRect.top)
          : Math.max(VIEWPORT_PADDING, vpHeight - anchorRect.bottom);
      const hAnchor =
        horizontal === "right"
          ? Math.max(VIEWPORT_PADDING, vpWidth - anchorRect.right)
          : Math.max(VIEWPORT_PADDING, anchorRect.left);

      setPosition({ vertical, horizontal, vAnchor, hAnchor });
    }
    compute();
    window.addEventListener("scroll", compute, { passive: true, capture: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", compute);
    };
  }, [open, align]);

  if (!definition) return null;

  const diagnostic = getKpiDiagnostic(value, definition.thresholds);
  // Signal contextuel : UNIQUEMENT good ou danger. warning/neutral → pas de
  // bandeau (spec produit : zones intermédiaires neutres).
  const signal =
    diagnostic === "good"
      ? {
          text: definition.tooltip.goodSign,
          color: "#86EFAC",
          bg: "rgba(34, 197, 94, 0.12)",
          border: "#22C55E",
        }
      : diagnostic === "danger"
        ? {
            text: definition.tooltip.badSign,
            color: "#FCA5A5",
            bg: "rgba(239, 68, 68, 0.12)",
            border: "#EF4444",
          }
        : null;
  const question = pickSuggestedQuestion(definition, diagnostic);

  // Style inline du popover : ancré coin-à-coin sur la tuile via top/bottom +
  // left/right. Translation initiale subtile vers le coin ancré → illusion de
  // sortie du coin.
  const verticalOffset = position?.vertical === "top" ? "translateY(-8px)" : "translateY(8px)";
  const transform = animateIn ? "translateY(0) scale(1)" : `${verticalOffset} scale(0.96)`;
  const transformOrigin = position
    ? `${position.vertical} ${position.horizontal}`
    : "top right";

  const positionStyle: React.CSSProperties = position
    ? {
        ...(position.vertical === "top" ? { top: position.vAnchor } : { bottom: position.vAnchor }),
        ...(position.horizontal === "right" ? { right: position.hAnchor } : { left: position.hAnchor }),
      }
    : { top: -9999, left: -9999 };

  const popoverStyle: React.CSSProperties = {
    position: "fixed",
    backgroundColor: "rgba(197, 160, 89, 0.12)",
    opacity: animateIn ? 1 : 0,
    transform,
    // Ease-out-expo : démarre vite puis se cale doucement — signature des UI
    // futuristes (Stripe, Vercel, Linear). Plus naturel qu'un ease-out simple.
    transition: `opacity ${ENTER_DURATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1), transform ${ENTER_DURATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow ${ENTER_DURATION_MS}ms ease-out`,
    transformOrigin,
    boxShadow: animateIn
      ? "0 12px 32px rgba(0, 0, 0, 0.55), 0 0 24px rgba(197, 160, 89, 0.18)"
      : "0 0 0 rgba(0, 0, 0, 0)",
    ...positionStyle,
  };

  // Backdrop : opacité + flou progressifs. Légèrement plus lent que le popover
  // (250 ms vs 220 ms) → impression que le popover "lève" en premier.
  const backdropStyle: React.CSSProperties = {
    backgroundColor: animateIn ? "rgba(9, 9, 11, 0.55)" : "rgba(9, 9, 11, 0)",
    backdropFilter: animateIn ? "blur(2.7px)" : "blur(0px)",
    WebkitBackdropFilter: animateIn ? "blur(2.7px)" : "blur(0px)",
    transition: `background-color 250ms cubic-bezier(0.16, 1, 0.3, 1), backdrop-filter 250ms cubic-bezier(0.16, 1, 0.3, 1), -webkit-backdrop-filter 250ms cubic-bezier(0.16, 1, 0.3, 1)`,
  };

  return (
    <span className="relative inline-block" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {/* Halo doré subtil derrière l'icône — discret pour signaler que c'est
          interactif sans être tape-à-l'œil. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -m-1 rounded-full"
        style={{ backgroundColor: "rgba(197, 160, 89, 0.08)" }}
      />
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Détails sur ${definition.label}`}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={handleEnter}
        onBlur={handleLeave}
        className="relative inline-flex h-6 w-6 items-center justify-center rounded-full border border-quantis-gold/40 bg-quantis-gold/10 text-quantis-gold transition hover:border-quantis-gold/70 hover:bg-quantis-gold/20"
      >
        <Sparkles className="h-3 w-3" />
      </button>

      {mounted && renderInDom
        ? createPortal(
            <>
              {/* Backdrop animé */}
              <div
                aria-hidden
                className="pointer-events-none fixed inset-0 z-[998]"
                style={backdropStyle}
              />

              {/* Popover ancré coin-à-coin */}
              {position ? (
                <div
                  id={tooltipId}
                  role="tooltip"
                  onMouseEnter={handleEnter}
                  onMouseLeave={handleLeave}
                  className="z-[999] w-[320px] max-w-[350px] max-h-[400px] overflow-y-auto rounded-xl border border-quantis-gold/40 border-l-4 border-l-[#C5A059] p-4 text-left backdrop-blur-xl will-change-[opacity,transform]"
                  style={popoverStyle}
                >
                  {/* Ligne 1 — Nom complet du KPI */}
                  <p className="text-sm font-semibold text-white" style={{ margin: 0, lineHeight: 1.3 }}>
                    {definition.label}
                  </p>

                  {/* Ligne 2 — Définition (depuis tooltip.explanation) */}
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "#D1D5DB", marginTop: 10, marginBottom: 0 }}
                  >
                    {definition.tooltip.explanation}
                  </p>

                  {/* Ligne 3 — Signal contextuel (good ou danger uniquement) */}
                  {signal ? (
                    <div
                      style={{
                        marginTop: 10,
                        padding: "8px 10px",
                        backgroundColor: signal.bg,
                        borderLeft: `3px solid ${signal.border}`,
                        borderRadius: 4,
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: signal.color,
                      }}
                    >
                      {signal.text}
                    </div>
                  ) : null}

                  {/* Ligne 4 — Benchmark (uniquement si fourni) */}
                  {definition.tooltip.benchmark ? (
                    <p
                      className="italic"
                      style={{
                        marginTop: 10,
                        marginBottom: 0,
                        fontSize: 11,
                        color: "rgba(255, 255, 255, 0.7)",
                        lineHeight: 1.5,
                      }}
                    >
                      📊 {definition.tooltip.benchmark}
                    </p>
                  ) : null}

                  {/* Ligne 5 — Formule (monospace, code compact) */}
                  <div
                    style={{
                      marginTop: 10,
                      padding: "6px 10px",
                      backgroundColor: "rgba(255, 255, 255, 0.05)",
                      borderRadius: 6,
                      fontFamily:
                        '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: 11,
                      color: "rgba(255, 255, 255, 0.65)",
                      wordBreak: "break-word",
                    }}
                  >
                    {definition.formulaCode}
                  </div>

                  {/* Séparateur entre formule et bouton */}
                  <div
                    style={{
                      height: 1,
                      backgroundColor: "rgba(255, 255, 255, 0.06)",
                      margin: "10px 0",
                    }}
                  />

                  {/* Ligne 6 — Question suggérée → ouvre AiChatPanel pré-rempli */}
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      openAiChat({ kpiId, initialQuestion: question });
                    }}
                    className="flex w-full items-center gap-2 rounded-lg border border-quantis-gold/60 bg-quantis-gold/10 px-3 py-2 text-left text-[12px] font-medium text-quantis-gold transition hover:border-quantis-gold/90 hover:bg-quantis-gold/20"
                  >
                    <MessageCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    <span style={{ lineHeight: 1.4 }}>{question}</span>
                  </button>

                  {/* Action secondaire : ouvrir le chat lié au KPI sans
                      pré-remplir la question. Permet d'explorer librement le
                      KPI (poser sa propre question, choisir parmi les
                      suggestions du panel) sans consommer un round-trip API
                      sur une question qui n'intéresse pas l'utilisateur. */}
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      openAiChat({ kpiId });
                    }}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-white/55 transition hover:text-quantis-gold"
                  >
                    <span>Ou ouvrir le chat sans question</span>
                    <span className="text-quantis-gold/70">→</span>
                  </button>
                </div>
              ) : null}
            </>,
            document.body
          )
        : null}
    </span>
  );
}
