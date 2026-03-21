// File: components/dashboard/tabs/InfoPopover.tsx
// Role: fournit un bouton d'information réutilisable pour expliquer chaque bloc KPI avec un panneau premium.
"use client";

import { CircleHelp, Database, Goal, Sigma } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type InfoPopoverProps = {
  title: string;
  purpose: string;
  displayedData: string;
  formula: string;
};

type PanelPosition = {
  top: number;
  left: number;
};

const PANEL_WIDTH = 352;
const VIEWPORT_PADDING = 12;
const PANEL_ESTIMATED_HEIGHT = 340;

export function InfoPopover({ title, purpose, displayedData, formula }: InfoPopoverProps) {
  // L'état local pilote l'ouverture/fermeture du panneau d'aide du bloc.
  const [isOpen, setIsOpen] = useState(false);
  // L'état de survol ouvre l'aide sans clic lorsque la souris passe sur l'icône.
  const [isHoverOpen, setIsHoverOpen] = useState(false);

  // La position fixe du panneau est recalculée à l'ouverture et pendant les scroll/resize.
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);

  // Le conteneur sert à gérer la fermeture au clic extérieur.
  const containerRef = useRef<HTMLDivElement>(null);
  // Le timeout évite une fermeture instantanée pendant le passage curseur icône -> panneau.
  const hoverCloseTimeoutRef = useRef<number | null>(null);

  // Le bouton déclencheur sert d'ancre visuelle pour placer le panneau.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isPanelVisible = isOpen || isHoverOpen;

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setIsHoverOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setIsHoverOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    function updatePanelPosition() {
      if (!triggerRef.current) {
        return;
      }

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const proposedLeft = triggerRect.right - PANEL_WIDTH;
      const clampedLeft = clamp(proposedLeft, VIEWPORT_PADDING, window.innerWidth - PANEL_WIDTH - VIEWPORT_PADDING);

      // Positionnement intelligent: on ouvre en dessous par défaut, sinon au-dessus si le bloc est trop bas.
      const preferredTopBelow = triggerRect.bottom + 10;
      const preferredTopAbove = triggerRect.top - PANEL_ESTIMATED_HEIGHT - 10;
      const hasRoomBelow = preferredTopBelow + PANEL_ESTIMATED_HEIGHT <= window.innerHeight - VIEWPORT_PADDING;
      const chosenTop = hasRoomBelow ? preferredTopBelow : preferredTopAbove;
      const maxTop = window.innerHeight - PANEL_ESTIMATED_HEIGHT - VIEWPORT_PADDING;
      const clampedTop = clamp(chosenTop, VIEWPORT_PADDING, maxTop);

      setPanelPosition({
        top: clampedTop,
        left: clampedLeft
      });
    }

    if (!isPanelVisible) {
      return;
    }

    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);

    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [isPanelVisible]);

  useEffect(() => {
    // Nettoyage défensif du timer pour éviter les fuites mémoire.
    return () => {
      if (hoverCloseTimeoutRef.current !== null) {
        window.clearTimeout(hoverCloseTimeoutRef.current);
      }
    };
  }, []);

  function openOnHover() {
    if (hoverCloseTimeoutRef.current !== null) {
      window.clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
    setIsHoverOpen(true);
  }

  function closeOnHover() {
    if (hoverCloseTimeoutRef.current !== null) {
      window.clearTimeout(hoverCloseTimeoutRef.current);
    }
    hoverCloseTimeoutRef.current = window.setTimeout(() => {
      setIsHoverOpen(false);
    }, 120);
  }

  return (
    <div
      ref={containerRef}
      className="pointer-events-auto"
      onMouseEnter={openOnHover}
      onMouseLeave={closeOnHover}
      style={{
        position: "absolute",
        top: "0.5rem",
        right: "0.5rem",
        width: "2.25rem",
        height: "2.25rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        onFocus={openOnHover}
        onBlur={closeOnHover}
        className="group inline-flex h-full w-full items-center justify-center rounded-full border border-white/20 bg-[#0f1016]/90 p-0 leading-none text-white/80 shadow-[0_6px_18px_rgba(0,0,0,0.35)] transition hover:border-quantis-gold/70 hover:text-quantis-gold"
        aria-label={`Informations sur ${title}`}
        aria-expanded={isPanelVisible}
      >
        <CircleHelp className="pointer-events-none block h-4 w-4 transition group-hover:scale-105" />
      </button>

      {isPanelVisible && panelPosition
        ? createPortal(
            <div
              className="fixed z-[120] w-[min(92vw,22rem)] overflow-y-auto rounded-2xl border border-white/15 bg-gradient-to-b from-[#151720] to-[#0d0f16] p-4 text-left shadow-[0_24px_70px_rgba(0,0,0,0.6)]"
              style={{
                top: `${panelPosition.top}px`,
                left: `${panelPosition.left}px`,
                maxHeight: "min(70vh, 28rem)"
              }}
              role="dialog"
              aria-label={`Détails du bloc ${title}`}
              onMouseEnter={openOnHover}
              onMouseLeave={closeOnHover}
            >
              {/* En-tête: identifie le bloc et pose un contexte rapide de lecture. */}
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{title}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-white/50">Aide KPI</p>
                </div>
                <span className="inline-flex items-center rounded-md border border-quantis-gold/40 bg-quantis-gold/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-quantis-gold">
                  Info
                </span>
              </div>

              {/* Corps: trois sections structurées pour clarifier usage, contenu et formule. */}
              <div className="mt-3 space-y-2.5 text-xs leading-5 text-white/75">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                  <p className="flex items-center gap-2 font-semibold text-white/90">
                    <Goal className="h-3.5 w-3.5 text-quantis-gold" />
                    À quoi ça sert
                  </p>
                  <p className="mt-1">{purpose}</p>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                  <p className="flex items-center gap-2 font-semibold text-white/90">
                    <Database className="h-3.5 w-3.5 text-quantis-gold" />
                    Ce que ce bloc affiche
                  </p>
                  <p className="mt-1">{displayedData}</p>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                  <p className="flex items-center gap-2 font-semibold text-white/90">
                    <Sigma className="h-3.5 w-3.5 text-quantis-gold" />
                    Comment c&apos;est calculé
                  </p>
                  <p className="mt-1">{formula}</p>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
