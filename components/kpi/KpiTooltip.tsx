// File: components/kpi/KpiTooltip.tsx
// Role: popover affiché au survol d'une icône ✨ posée dans le coin sup. droit
// d'une carte KPI. Lit les méta-données depuis le `kpiRegistry` :
//   - tooltip.explanation (vulgarisée)
//   - signal contextuel (goodSign vert / badSign rouge selon les seuils)
//   - benchmark sectoriel s'il existe
//   - question suggérée (whenGood / whenBad) — bouton désactivé tant que le
//     chat IA n'est pas livré (cf. AI_ARCHITECTURE.md, niveau 2/3 = MT).
//
// Aucun appel API. Tout vient du registre — déterministe et 0-coût.
//
// ─── Choix architecturaux ───────────────────────────────────────────────
//
// Portal : le popover est rendu dans `document.body` via createPortal. Les
// cartes parents (`precision-card fade-up`) ont `overflow: hidden` pour leur
// effet de gradient, ce qui clippait le popover positionné en absolute.
// Le portal le sort du flow et le positionne en `fixed`.
//
// Ancrage `bottom` (et non `top`) : pour le mode "au-dessus", on ancre le
// BAS du popover juste au-dessus du trigger (12 px de marge). Le popover
// grandit vers le haut à mesure que son contenu s'étoffe — son top dépend
// de sa hauteur réelle. Évite le bug "popover trop haut" qui survenait
// quand on calculait top = trigger.top - estimatedHeight (l'estimation
// surdimensionnée laissait un grand vide entre tooltip et trigger).
//
// Backdrop blur : un overlay plein écran s'affiche derrière le popover
// pour flouter/dimmer le reste de la page. Aide à focaliser l'attention
// sur le tooltip et résout l'effet "carte trop voisine qui distrait".
"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, MessageCircle, Sparkles } from "lucide-react";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import { getKpiDiagnostic, pickSuggestedQuestion } from "@/lib/kpi/kpiDiagnostic";
import { useAiChat } from "@/components/ai/AiChatProvider";

type KpiTooltipProps = {
  kpiId: string;
  /** Valeur courante du KPI — sert à calculer le diagnostic (good/warning/danger). */
  value: number | null | undefined;
  /**
   * Position horizontale du popover par rapport au trigger.
   *  - "right" (défaut) : aligné à droite du trigger (le popover s'étire vers la gauche).
   *  - "left" : aligné à gauche (le popover s'étire vers la droite).
   * Le clamp horizontal est fait automatiquement pour ne pas déborder du viewport.
   */
  align?: "left" | "right";
};

const VIEWPORT_PADDING = 12;

// Position : on aligne UN COIN du popover sur LE MÊME COIN de la tuile.
// Le coin retenu dépend de l'emplacement du trigger dans la tuile :
//   - trigger en haut  → coin haut (tooltip s'étend vers le bas, transform-origin haut)
//   - trigger en bas   → coin bas  (tooltip s'étend vers le haut, transform-origin bas)
// Côté horizontal : `align` du composant (right par défaut).
// Le popover OVERLAPPE la tuile — le backdrop blur derrière reste visible
// mais flouté, ce qui suffit à dégager le tooltip visuellement.
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
 * Remonte l'arbre DOM depuis l'élément trigger jusqu'à la première carte KPI
 * (classe `precision-card` qu'on retrouve sur toutes les tuiles dashboard,
 * fallback `<article>` pour les cards historiques sans cette classe).
 * Retourne null si on remonte jusqu'à <body> sans rien trouver — on retombera
 * alors sur la bbox du trigger pour le calcul horizontal.
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

// Durée des transitions enter/exit du popover et du backdrop. On veut quelque
// chose de fluide sans être lent : ~200 ms est la zone douce (au-delà ça fait
// laggy, en-deçà ça reste raide). Doit matcher la valeur dans `transition-*`.
const ENTER_DURATION_MS = 220;
const LEAVE_DURATION_MS = 180;

export function KpiTooltip({ kpiId, value, align = "right" }: KpiTooltipProps) {
  const definition = getKpiDefinition(kpiId);
  const { open: openAiChat } = useAiChat();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  // Découplage : `renderInDom` = présence dans l'arbre React (= portal monté) ;
  // `animateIn` = classes/styles "ouvert" appliqués. On retarde animateIn d'un
  // double-RAF après le mount pour que le navigateur peigne d'abord l'état
  // initial (opacity:0, scale:0.96…) avant de transitionner vers l'état final.
  // Sans ce délai, le navigateur compose directement à l'état final et la
  // transition est invisible — c'est le bug "raide" qu'on observe.
  const [renderInDom, setRenderInDom] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // Petit délai à la fermeture pour permettre à la souris de migrer
  // de l'icône au popover sans flicker.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Synchronise renderInDom + animateIn avec open. Cycle ouvert :
  //   open=true  → renderInDom=true (frame N) → animateIn=true (frame N+2)
  //   open=false → animateIn=false (frame N) → renderInDom=false après LEAVE_DURATION_MS
  useEffect(() => {
    if (open) {
      setRenderInDom(true);
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => setAnimateIn(true));
        // On chaîne 2 RAF pour s'assurer que l'état initial est peint avant
        // de passer à l'état final (sinon transition skip côté navigateur).
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

  // Calcule la position du popover en fixed.
  // Le popover s'aligne COIN À COIN sur la tuile parente. Le coin retenu
  // dépend de l'emplacement du trigger DANS la tuile :
  //   - trigger dans la moitié haute → coin haut de la tuile (tooltip
  //     descend vers le bas en overlappant la partie haute de la tuile)
  //   - trigger dans la moitié basse → coin bas de la tuile (tooltip remonte)
  // Horizontal : suit `align` (right ou left).
  // Le popover OVERLAPPE la tuile — le backdrop blur derrière fait suffi-
  // samment ressortir le tooltip pour qu'on n'ait pas besoin d'un offset.
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

      // Coin vertical : trigger dans la moitié haute → "top" (ancre haut),
      // sinon "bottom" (ancre bas). Centre du trigger comparé au centre de
      // la tuile.
      const triggerCenterY = (triggerRect.top + triggerRect.bottom) / 2;
      const tileCenterY = (anchorRect.top + anchorRect.bottom) / 2;
      const vertical: CornerVertical = triggerCenterY <= tileCenterY ? "top" : "bottom";

      // Coin horizontal : suit la prop `align`. Pas de re-détection auto :
      // on respecte le choix du consommateur (puis clamp viewport si
      // débordement).
      const horizontal: CornerHorizontal = align;

      // Coordonnée du coin ancré (en distance depuis le bord correspondant
      // du viewport). Clamp pour qu'on ne sorte jamais de l'écran de plus
      // que VIEWPORT_PADDING.
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
    // Recompute si la fenêtre bouge ou si on scrolle la page.
    window.addEventListener("scroll", compute, { passive: true, capture: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", compute);
    };
  }, [open, align]);

  if (!definition) return null;

  const diagnostic = getKpiDiagnostic(value, definition.thresholds);
  const signal =
    diagnostic === "good"
      ? { text: definition.tooltip.goodSign, className: "text-emerald-300" }
      : diagnostic === "danger" || diagnostic === "warning"
        ? { text: definition.tooltip.badSign, className: "text-rose-300" }
        : null;
  const question = pickSuggestedQuestion(definition, diagnostic);

  // Style inline du popover : ancré coin-à-coin sur la tuile via `top`/`bottom`
  // + `left`/`right`. La transformation initiale (translate-y subtil vers le
  // coin ancré) donne l'illusion que le popover "sort" du coin où il s'ancre.
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
    // Ease-out-expo : la transition démarre vite puis se cale doucement —
    // signature des UI "futuristes" (Stripe, Vercel, Linear). Plus naturel
    // qu'un ease-out classique sur ce genre d'apparition.
    transition: `opacity ${ENTER_DURATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1), transform ${ENTER_DURATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow ${ENTER_DURATION_MS}ms ease-out`,
    transformOrigin,
    // Glow doré subtil qui apparaît avec le popover — renforce l'effet
    // "matérialisation" plutôt qu'apparition sèche.
    boxShadow: animateIn
      ? "0 12px 32px rgba(0, 0, 0, 0.55), 0 0 24px rgba(197, 160, 89, 0.18)"
      : "0 0 0 rgba(0, 0, 0, 0)",
    ...positionStyle,
  };

  // Style du backdrop — opacité et flou progressifs pour ne pas frapper d'un
  // coup. Légèrement plus lent que le popover (250 ms vs 220 ms) → impression
  // que le popover "lève" en premier, le décor s'efface ensuite.
  // Flou réduit de 3 → 2.7 px (-10 %) après retour utilisateur : trop opaque
  // sinon, on perd le contexte de la page derrière.
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
              {/* Backdrop animé : opacité + blur progressifs (250 ms ease-out-expo).
                  Légèrement plus lent que le popover pour donner l'impression
                  que le popover "lève" avant que le décor ne s'efface. */}
              <div
                aria-hidden
                className="pointer-events-none fixed inset-0 z-[998]"
                style={backdropStyle}
              />

              {/* Popover : fond doré transparent + backdrop-blur. Animation
                  enter (opacity 0→1, scale 0.96→1, translateY ±8px→0) en
                  ease-out-expo pour un toucher fluide / futuriste. */}
              {position ? (
                <div
                  id={tooltipId}
                  role="tooltip"
                  onMouseEnter={handleEnter}
                  onMouseLeave={handleLeave}
                  className="z-[999] w-[320px] max-w-[350px] max-h-[400px] overflow-y-auto rounded-xl border border-quantis-gold/40 border-l-4 border-l-[#C5A059] p-4 text-left backdrop-blur-xl will-change-[opacity,transform]"
                  style={popoverStyle}
                >
                  {/* Header KPI — label long + unité */}
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{definition.label}</p>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-quantis-gold/70">
                      {definition.unit}
                    </span>
                  </div>

                  {/* Explication vulgarisée */}
                  <p className="mb-3 text-xs leading-relaxed text-white/90">
                    {definition.tooltip.explanation}
                  </p>

                  {/* Diagnostic contextuel — vert ou rouge selon le seuil franchi */}
                  {signal ? (
                    <p
                      className={`mb-3 rounded-md border-l-2 border-l-current bg-black/30 px-2 py-1.5 text-[11px] leading-relaxed ${signal.className}`}
                    >
                      {signal.text}
                    </p>
                  ) : null}

                  {/* Benchmark sectoriel — uniquement si le registre en fournit un */}
                  {definition.tooltip.benchmark ? (
                    <p className="mb-3 text-[11px] italic text-white/70">
                      📊 {definition.tooltip.benchmark}
                    </p>
                  ) : null}

                  {/* Question suggérée — clic = ouvre l'AiChatPanel via le
                      provider global avec la question pré-remplie. La question
                      est envoyée automatiquement à l'API IA, la réponse mock
                      (ou Claude réel si la clé est branchée) s'affiche dans
                      le drawer. */}
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      openAiChat({ kpiId, kpiValue: value ?? null, initialQuestion: question });
                    }}
                    className="mt-1 flex w-full items-center justify-between gap-2 rounded-lg border border-quantis-gold/50 bg-quantis-gold/10 px-3 py-2 text-left text-[11px] font-medium text-quantis-gold transition hover:border-quantis-gold/80 hover:bg-quantis-gold/20"
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className="h-3 w-3 flex-shrink-0" />
                      <span>{question}</span>
                    </span>
                    <ArrowRight className="h-3 w-3 flex-shrink-0 opacity-70" />
                  </button>

                  {/* Action secondaire : ouvrir le chat sans question pré-remplie.
                      Utile quand l'utilisateur veut explorer le KPI librement
                      (poser SA question, ou choisir parmi les suggestions). */}
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      openAiChat({ kpiId, kpiValue: value ?? null });
                    }}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium text-white/55 transition hover:text-quantis-gold"
                  >
                    <MessageCircle className="h-3 w-3" />
                    <span>Ou ouvrir le chat sans question</span>
                    <span className="text-quantis-gold/70">→</span>
                  </button>

                  {/* Formule — petite ligne tech tout en bas pour les curieux */}
                  <p
                    className="mt-3 truncate font-mono text-[10px] text-white/55"
                    title={definition.formula}
                  >
                    {definition.formulaCode}
                  </p>
                </div>
              ) : null}
            </>,
            document.body
          )
        : null}
    </span>
  );
}
