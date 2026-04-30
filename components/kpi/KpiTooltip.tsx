// File: components/kpi/KpiTooltip.tsx
// Role: popover affiché au survol de l'icône ✨ posée dans le coin sup. droit
// d'une carte KPI. Refonte 6 lignes (cf. spec produit) :
//   1. Nom complet du KPI (gras, blanc, 14 px)
//   2. Définition vulgarisée (gris #D1D5DB, 12 px) — depuis tooltip.explanation
//   3. Signal contextuel — UNIQUEMENT si diagnostic = good ou danger
//      (bandeau vert/rouge, bord gauche 3 px coloré)
//   4. Benchmark sectoriel — UNIQUEMENT si tooltip.benchmark existe
//      (📊 + texte gris italique 11 px)
//   5. Formule — code monospace (JetBrains Mono), 11 px, fond rgba blanc 0.05
//   6. Question suggérée — bouton or (#C5A059) qui ouvre l'AiChatPanel avec la
//      question pré-remplie (utilise useAiChat du provider global)
//
// NE figurent PAS dans le tooltip : valeur courante, variation N-1, mini-graph,
// catégorie, nom vulgarisé. Ces infos sont déjà sur la carte.
//
// ─── Choix architecturaux ───────────────────────────────────────────────
//
// Portal : le popover est rendu dans `document.body` via createPortal — les
// cartes parents (`precision-card`) ont `overflow: hidden` qui clippait le
// popover positionné en absolute.
//
// Position : au-dessus de la carte par défaut, auto-flip en dessous si la
// place manque au-dessus. Mesure faite via getBoundingClientRect au mount,
// puis ré-évaluée après peinture du popover (RAF) pour utiliser la hauteur
// réelle plutôt qu'une estimation.
//
// Animation : fade-in 150 ms + translateY(-4 px → 0). Volontairement court
// pour ne pas freiner l'utilisateur quand il survole rapidement plusieurs
// cartes.
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
   * Position horizontale du popover par rapport à la carte parente.
   *  - "right" (défaut) : aligné au coin droit de la carte.
   *  - "left" : aligné au coin gauche de la carte.
   * Le clamp horizontal évite tout débordement viewport.
   */
  align?: "left" | "right";
};

const POPOVER_WIDTH = 360;
const POPOVER_MAX_HEIGHT = 400;
const VIEWPORT_PADDING = 12;
// Marge verticale entre le popover et la carte. 12 px : assez d'air pour
// distinguer les deux blocs sans casser le lien visuel.
const CARD_GAP = 12;
const ENTER_DURATION_MS = 150;
const LEAVE_DURATION_MS = 150;
// Estimation utilisée le temps que le popover soit peint pour qu'on puisse
// mesurer sa vraie hauteur. 280 px couvre le scénario typique 6 lignes.
const ESTIMATED_HEIGHT = 280;

type Side = "top" | "bottom";
type Position = { side: Side; top: number; left: number };

/**
 * Remonte l'arbre DOM jusqu'à la carte KPI parente (`precision-card` ou
 * <article>). On positionne le popover par rapport à cette carte, pas par
 * rapport au trigger qui est juste l'icône ✨ dans son coin.
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
  // Découplage présence DOM / état animé pour permettre la transition de sortie.
  const [renderInDom, setRenderInDom] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  // Petit délai à la fermeture pour laisser la souris migrer du trigger au
  // popover sans flicker.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // open=true  → renderInDom=true (frame N), puis animateIn=true (frame N+2)
  // open=false → animateIn=false, puis renderInDom=false après LEAVE_DURATION
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

  // Calcul position — au-dessus de la carte par défaut, flip en bas si pas
  // assez d'espace au-dessus. Première passe avec hauteur estimée, seconde
  // passe (RAF) avec hauteur réelle mesurée.
  useLayoutEffect(() => {
    if (!open) return;
    function compute() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const card = findKpiCardAncestor(trigger);
      const anchorRect = card
        ? card.getBoundingClientRect()
        : trigger.getBoundingClientRect();
      const vpHeight = window.innerHeight;
      const vpWidth = window.innerWidth;

      const popoverEl = popoverRef.current;
      const measuredHeight =
        popoverEl?.getBoundingClientRect().height ?? ESTIMATED_HEIGHT;

      // Auto-flip : on garde "top" tant qu'il y a la place, sinon "bottom".
      // Si aucun des deux côtés ne loge entièrement le popover, on prend le
      // côté avec le plus d'espace (max-height + scroll s'occupent du reste).
      const spaceAbove = anchorRect.top - VIEWPORT_PADDING;
      const spaceBelow = vpHeight - anchorRect.bottom - VIEWPORT_PADDING;
      const fitsAbove = spaceAbove >= measuredHeight + CARD_GAP;
      const side: Side = fitsAbove || spaceAbove >= spaceBelow ? "top" : "bottom";

      const top =
        side === "top"
          ? Math.max(VIEWPORT_PADDING, anchorRect.top - measuredHeight - CARD_GAP)
          : anchorRect.bottom + CARD_GAP;

      const rawLeft =
        align === "right" ? anchorRect.right - POPOVER_WIDTH : anchorRect.left;
      const minLeft = VIEWPORT_PADDING;
      const maxLeft = vpWidth - POPOVER_WIDTH - VIEWPORT_PADDING;
      const left = Math.max(minLeft, Math.min(maxLeft, rawLeft));

      setPosition({ side, top, left });
    }
    compute();
    // Seconde passe : popoverRef est peuplée au prochain frame, on peut
    // recalculer avec la vraie hauteur.
    const r = requestAnimationFrame(compute);
    window.addEventListener("scroll", compute, { passive: true, capture: true });
    window.addEventListener("resize", compute);
    return () => {
      cancelAnimationFrame(r);
      window.removeEventListener("scroll", compute, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", compute);
    };
  }, [open, align, renderInDom]);

  if (!definition) return null;

  const diagnostic = getKpiDiagnostic(value, definition.thresholds);
  // Signal contextuel : UNIQUEMENT good ou danger. warning/neutral → pas de
  // bandeau (spec produit : on garde les zones intermédiaires neutres).
  const signal =
    diagnostic === "good"
      ? {
          text: definition.tooltip.goodSign,
          color: "#86EFAC",
          bg: "rgba(34, 197, 94, 0.08)",
          border: "#22C55E",
        }
      : diagnostic === "danger"
        ? {
            text: definition.tooltip.badSign,
            color: "#FCA5A5",
            bg: "rgba(239, 68, 68, 0.08)",
            border: "#EF4444",
          }
        : null;
  const question = pickSuggestedQuestion(definition, diagnostic);

  const popoverStyle: React.CSSProperties = {
    position: "fixed",
    top: position?.top ?? -9999,
    left: position?.left ?? -9999,
    width: POPOVER_WIDTH,
    maxWidth: POPOVER_WIDTH,
    maxHeight: POPOVER_MAX_HEIGHT,
    overflowY: "auto",
    backgroundColor: "rgba(26, 26, 46, 0.98)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    borderLeft: "3px solid #C5A059",
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    padding: 16,
    zIndex: 999,
    boxShadow:
      "0 12px 32px rgba(0, 0, 0, 0.55), 0 0 24px rgba(197, 160, 89, 0.18)",
    opacity: animateIn ? 1 : 0,
    transform: animateIn ? "translateY(0)" : "translateY(-4px)",
    transition: `opacity ${ENTER_DURATION_MS}ms ease-out, transform ${ENTER_DURATION_MS}ms ease-out`,
  };

  return (
    <span
      className="relative inline-block"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
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
            <div
              ref={popoverRef}
              id={tooltipId}
              role="tooltip"
              onMouseEnter={handleEnter}
              onMouseLeave={handleLeave}
              style={popoverStyle}
            >
              {/* Ligne 1 — Nom complet du KPI */}
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#FFFFFF",
                  margin: 0,
                  lineHeight: 1.3,
                }}
              >
                {definition.label}
              </p>

              {/* Ligne 2 — Définition (depuis tooltip.explanation) */}
              <p
                style={{
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: "#D1D5DB",
                  marginTop: 10,
                  marginBottom: 0,
                }}
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
                  style={{
                    marginTop: 10,
                    marginBottom: 0,
                    fontSize: 11,
                    fontStyle: "italic",
                    color: "#9CA3AF",
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
                  color: "#9CA3AF",
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
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "rgba(197, 160, 89, 0.18)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "rgba(197, 160, 89, 0.1)";
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 12px",
                  backgroundColor: "rgba(197, 160, 89, 0.1)",
                  border: "1px solid #C5A059",
                  borderRadius: 8,
                  color: "#C5A059",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  textAlign: "left",
                  lineHeight: 1.4,
                  transition: "background-color 150ms ease-out",
                }}
              >
                <MessageCircle
                  style={{ width: 14, height: 14, flexShrink: 0 }}
                />
                <span>{question}</span>
              </button>
            </div>,
            document.body
          )
        : null}
    </span>
  );
}
