// File: components/dashboard/widgets/WidgetFrame.tsx
// Role: wrapper d'un widget dans la grille personnalisable.
//
// En mode édition :
//   - chrome (handles drag/resize/remove) UNIQUEMENT sur hover du widget
//     courant + pendant un resize/drag actif → pas de wiggle global, le
//     reste des widgets reste calme
//   - 8 micro-poignées discrètes aux extrémités, drag pour redimensionner
//     avec snap sur la matrice 3×3 (largeur × hauteur), clic = cycle
//   - aperçu pointillé live qui suit le snap pendant le drag
//   - ghost de drag-reorder fourni par dnd-kit (real-time reflow)
//
// Le card enfant prend `h-full` pour remplir le BBOX du widget — pas de
// bande vide entre la bordure du card et la bordure du widget.
//
// Snap & contraintes : chaque vizType déclare un minWidth/minHeight dans
// `widgetSizeConstraints` ; on filtre le set des tailles autorisées avant
// de chercher la plus proche, donc on ne propose jamais une taille non
// réalisable (ex. evolutionChart en col-4).
"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Minus, MoreHorizontal } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { WidgetInstance, WidgetSize, WidgetWidth } from "@/types/dashboard";
import {
  clampHeight,
  clampWidth,
  getAllowedHeights,
  getAllowedWidths
} from "@/lib/dashboard/widgetSizeConstraints";

type WidgetSizePatch = { size?: WidgetWidth; height?: WidgetSize };

type WidgetFrameProps = {
  widget: WidgetInstance;
  isEditing: boolean;
  onRemove: () => void;
  onUpdateSize: (patch: WidgetSizePatch) => void;
  /** Callback quand l'utilisateur clique l'icône "cibles" du widget en mode
   *  édition. Reçoit le `kpiId` du widget pour ouvrir l'éditeur. Si non
   *  fourni, l'icône n'est pas affichée. */
  onConfigureTarget?: (kpiId: string) => void;
  /** True si CE widget fait partie de la sélection courante (mode édition).
   *  La sélection est portée par WidgetGrid (clic = sélectionne, shift+clic
   *  = range, cmd/ctrl+clic = toggle, clic ailleurs = reset). */
  isSelected?: boolean;
  /** Position explicite calculée par WidgetGrid (gridColumn / gridRow).
   *  Quand fournie, on l'applique en inline style et on bypasse les
   *  classes col-span/row-span responsive. Permet à WidgetGrid de gérer
   *  les positions pour la danse iOS-style + animations FLIP. */
  gridPosition?: {
    col: number;
    row: number;
    colSpan: number;
    rowSpan: number;
  };
  /** Callback quand l'utilisateur clique le widget en mode édition.
   *  Reçoit les modificateurs clavier pour piloter la multi-sélection. */
  onSelect?: (mods: { shift: boolean; meta: boolean }) => void;
  children: ReactNode;
};

const WIDTH_TO_COL_SPAN: Record<WidgetWidth, string> = {
  // Matrice 4×3 — 4 paliers de largeur sur grille 12 colonnes.
  XS: "col-span-12 md:col-span-6 lg:col-span-3",  // 1/4
  S: "col-span-12 md:col-span-6 lg:col-span-4",   // 1/3
  M: "col-span-12 lg:col-span-6",                 // 1/2
  L: "col-span-12"                                // 1/1
};

// Fraction de la grille (12 col) occupée par chaque palier — sert au
// calcul des cibles de snap pendant le drag.
const WIDTH_FRACTION: Record<WidgetWidth, number> = {
  XS: 3 / 12,
  S: 4 / 12,
  M: 6 / 12,
  L: 12 / 12
};

// Hauteur via row-span — la grille parente déclare un auto-rows fixe (200px)
// et chaque widget consomme N rangées. XL (4 rangées = 860 px) est réservé
// aux charts riches qui exploitent vraiment l'espace vertical (point mort,
// chart custom multi-séries) ; cf. widgetSizeConstraints.MAX_HEIGHTS qui
// plafonne les autres widgets à L.
const HEIGHT_TO_ROW_SPAN: Record<WidgetSize, string> = {
  S: "row-span-1",
  M: "row-span-2",
  L: "row-span-3",
  XL: "row-span-4"
};

// Hauteur effective en px pour le calcul de snap pendant le drag.
// Doit rester synchronisée avec ROW_HEIGHT_PX dans WidgetGrid (200) +
// le gap-5 (20 px) entre les rangées.
const ROW_HEIGHT_PX = 200;
const ROW_GAP_PX = 20;
const HEIGHT_PX: Record<WidgetSize, number> = {
  S: ROW_HEIGHT_PX,
  M: ROW_HEIGHT_PX * 2 + ROW_GAP_PX,
  L: ROW_HEIGHT_PX * 3 + ROW_GAP_PX * 2,
  XL: ROW_HEIGHT_PX * 4 + ROW_GAP_PX * 3
};

const NEXT_HEIGHT: Record<WidgetSize, WidgetSize> = { S: "M", M: "L", L: "XL", XL: "S" };
const NEXT_WIDTH: Record<WidgetWidth, WidgetWidth> = { XS: "S", S: "M", M: "L", L: "XS" };

// Snap directionnel : on bascule vers la taille SUIVANTE dès que la cible
// dépasse 20 % du gap. Très responsive — l'utilisateur drag ~20 % du saut
// (~45 px pour passer de M à L en hauteur) et la transition se fait.
function nearestSize<T extends string>(
  allowed: T[],
  target: number,
  resolvePx: (size: T) => number
): T {
  if (allowed.length === 0) return allowed[0];
  const sorted = [...allowed].sort((a, b) => resolvePx(a) - resolvePx(b));
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = resolvePx(sorted[i]);
    const b = resolvePx(sorted[i + 1]);
    const snapThreshold = a + (b - a) * 0.2; // 20 % du gap = bascule
    if (target < snapThreshold) return sorted[i];
  }
  return sorted[sorted.length - 1];
}

export function WidgetFrame({
  widget,
  isEditing,
  onRemove,
  onUpdateSize,
  onConfigureTarget,
  isSelected = false,
  gridPosition,
  onSelect,
  children
}: WidgetFrameProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
    disabled: !isEditing
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Resize en cours — sert à garder le chrome visible et à figer le wiggle
  // pendant qu'on tire la poignée. Pas de preview overlay : le widget se
  // ré-aligne directement à la taille snap (commit live).
  const [isResizing, setIsResizing] = useState(false);
  // Hover du widget — visible le chrome au survol même si non sélectionné.
  const [isHovered, setIsHovered] = useState(false);

  // Style dnd-kit : on N'APPLIQUE le transform/transition inline QUE si
  // dnd-kit a quelque chose à dire (drag actif, ou snap-back en cours).
  // Sinon le transform inline (même undefined) bloque l'animation CSS
  // `widget-wiggle-rotate` qui s'appuie sur `transform: rotate(...)`.
  const positionStyle: React.CSSProperties = gridPosition
    ? {
        gridColumn: `${gridPosition.col} / span ${gridPosition.colSpan}`,
        gridRow: `${gridPosition.row} / span ${gridPosition.rowSpan}`
      }
    : {};
  const dndTransform = transform ? CSS.Transform.toString(transform) : null;
  const style: React.CSSProperties = {
    ...positionStyle,
    ...(dndTransform || isDragging
      ? {
          transform: dndTransform ?? undefined,
          transition,
        }
      : {}),
    ...(isDragging
      ? {
          zIndex: 50,
          boxShadow: "0 18px 48px rgba(0,0,0,0.55)",
          cursor: "grabbing"
        }
      : {})
  };

  // Auto-corrige les tailles persistées qui violent les contraintes
  // actuelles (ex. layout antérieur sans contraintes). On rend avec la
  // taille clampée — la persistance se mettra à jour au prochain patch.
  const widthAxis = clampWidth(widget.vizType, widget.size);
  const heightAxis = clampHeight(widget.vizType, widget.height ?? "S");
  const colSpanClass = WIDTH_TO_COL_SPAN[widthAxis];
  const rowSpanClass = HEIGHT_TO_ROW_SPAN[heightAxis];

  // Chrome visible : hover, sélectionné, drag actif, ou resize en cours.
  const showChrome = isEditing && (isHovered || isSelected || isDragging || isResizing);
  // Wiggle : actif dès qu'un widget est sélectionné (y compris au hover —
  // l'utilisateur veut le voir bouger même quand il regarde le widget).
  // Le hit-test précis est garanti par :
  //   - sélection au `pointerdown` (avant toute frame d'animation, on capte
  //     immédiatement l'élément sous le curseur) — cf. handlePointerDown
  //   - guard `closest("[data-widget-id]")` qui bloque la propagation si la
  //     cible n'est pas dans CE widget
  // Désactivé pendant drag/resize pour ne pas perturber les manipulations.
  const wiggleClass =
    isEditing && isSelected && !isDragging && !isResizing
      ? "widget-wiggle"
      : "";

  function setRefs(node: HTMLDivElement | null) {
    setNodeRef(node);
    containerRef.current = node;
  }

  // En mode édition, on attache les listeners de drag à TOUT le widget
  // (pas juste à une poignée) pour permettre de drag depuis n'importe où.
  // Les boutons internes (X remove + 8 ResizeHandle) ont leur propre
  // stopPropagation pour ne pas interférer. Le PointerSensor a un
  // activationConstraint distance=5 (cf. WidgetGrid) → un clic court ne
  // déclenche pas de drag.
  //
  // On COMPOSE manuellement onPointerDown avec dnd-kit pour faire deux
  // choses dans l'ordre : (1) sélection immédiate, (2) bootstrap drag-kit.
  // Sans cette composition, un simple `{...listeners}` après notre
  // onPointerDown l'écraserait, et inversement.
  const dndPointerDown = listeners?.onPointerDown as
    | ((e: React.PointerEvent<HTMLDivElement>) => void)
    | undefined;

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Garde : on ne sélectionne que si la cible réelle du clic appartient
    // à CE widget. Sans ça, un événement qui buble depuis un descendant
    // hors-widget (ex. tooltip Recharts portalisé, overlay z-index) peut
    // faire fire le handler du voisin et expliquer les sélections "fantômes"
    // sur les côtés d'un gros widget.
    const target = e.target as HTMLElement | null;
    const closestWidget = target?.closest<HTMLElement>("[data-widget-id]");
    if (closestWidget && closestWidget.dataset.widgetId !== widget.id) {
      return;
    }

    // 1. Sélection au pointerdown (avant que le wiggle ne déplace l'élément
    //    entre press et release — sinon clic perdu sur un voisin).
    if (isEditing && e.button === 0 && onSelect) {
      onSelect({ shift: e.shiftKey, meta: e.metaKey || e.ctrlKey });
    }
    // 2. Forward à dnd-kit pour qu'il puisse activer le drag à 5px de move.
    if (dndPointerDown) dndPointerDown(e);
  }

  return (
    <div
      ref={setRefs}
      style={style}
      className={`group/widget relative ${gridPosition ? "" : `${colSpanClass} ${rowSpanClass}`} ${wiggleClass} ${
        isEditing ? "cursor-grab select-none active:cursor-grabbing" : ""
      } ${isSelected ? "ring-2 ring-quantis-gold/50 ring-offset-2 ring-offset-quantis-base rounded-2xl" : ""}`}
      data-widget-id={widget.id}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...(isEditing ? { ...attributes, ...listeners } : {})}
      onPointerDown={isEditing ? handlePointerDown : undefined}
    >
      {/* Wrapper plein-cadre pour que le card enfant remplisse le BBOX. */}
      <div className="h-full w-full">
        {children}
      </div>

      {showChrome ? (
        <div className="pointer-events-none absolute inset-0 z-10">
          {/* Bouton de suppression — disponible sur tous les widgets.
              stopPropagation au pointerdown ET au click pour ne pas déclencher
              le drag global du widget parent ni le onSelect. */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label="Supprimer le widget"
            className="pointer-events-auto absolute -left-1.5 -top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-neutral-700/95 text-white shadow-lg backdrop-blur transition hover:bg-neutral-600"
          >
            <Minus className="h-4 w-4" strokeWidth={3} />
          </button>

          {/* Bouton "cibles" — alertes & objectifs sur ce KPI. Visible
              uniquement si la prop onConfigureTarget est fournie (donc en
              édition pour les widgets KPI/Card supportés). */}
          {onConfigureTarget ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onConfigureTarget(widget.kpiId);
              }}
              aria-label="Définir alertes et objectifs"
              title="Alertes & objectifs"
              className="pointer-events-auto absolute -right-1.5 -top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-neutral-700/95 text-quantis-gold shadow-lg backdrop-blur transition hover:bg-neutral-600"
            >
              <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          ) : null}

          {/* Poignée de redimensionnement style iOS — bottom-right unique,
              snap diagonal sur la matrice (largeur, hauteur). Commit live. */}
          <ResizeHandle position="bottom-right" dirX={1} dirY={1} containerRef={containerRef} widget={widget} onUpdateSize={onUpdateSize} onResizingChange={setIsResizing} />
        </div>
      ) : null}
    </div>
  );
}

// ─── ResizeHandle ──────────────────────────────────────────────────────

type HandlePosition =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

const HANDLE_STYLES: Record<HandlePosition, { position: string; cursor: string }> = {
  top: { position: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-ns-resize" },
  bottom: { position: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "cursor-ns-resize" },
  left: { position: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-ew-resize" },
  right: { position: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2", cursor: "cursor-ew-resize" },
  "top-left": { position: "left-0 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-nwse-resize" },
  "top-right": { position: "right-0 top-0 translate-x-1/2 -translate-y-1/2", cursor: "cursor-nesw-resize" },
  "bottom-left": { position: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "cursor-nesw-resize" },
  "bottom-right": { position: "right-0 bottom-0 translate-x-1/2 translate-y-1/2", cursor: "cursor-nwse-resize" }
};

function widthPxForSize(size: WidgetWidth, gridWidthPx: number): number {
  return gridWidthPx * WIDTH_FRACTION[size];
}

function ResizeHandle({
  position,
  dirX,
  dirY,
  containerRef,
  widget,
  onUpdateSize,
  onResizingChange
}: {
  position: HandlePosition;
  dirX: -1 | 0 | 1;
  dirY: -1 | 0 | 1;
  containerRef: React.RefObject<HTMLDivElement | null>;
  widget: WidgetInstance;
  onUpdateSize: (patch: WidgetSizePatch) => void;
  onResizingChange: (resizing: boolean) => void;
}) {
  const { position: posClass, cursor } = HANDLE_STYLES[position];

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const elem = containerRef.current;
    if (!elem) return;
    const parent = elem.parentElement;
    if (!parent) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = elem.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const startW = startRect.width;
    const startH = startRect.height;

    // Set des tailles autorisées selon la viz — restreint le snap pour
    // éviter de proposer une taille non réalisable.
    const allowedW = getAllowedWidths(widget.vizType);
    const allowedH = getAllowedHeights(widget.vizType);

    let moved = false;
    // Dernière taille committée — on commit live à chaque saut de palier.
    // On compare contre cette ref locale (pas widget.size, qui ne se met
    // à jour qu'au prochain render via les props).
    let committedW: WidgetWidth = clampWidth(widget.vizType, widget.size);
    let committedH: WidgetSize = clampHeight(widget.vizType, widget.height ?? "S");

    onResizingChange(true);

    function handleMove(moveEvent: PointerEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;

      let nextW = committedW;
      let nextH = committedH;
      if (dirX !== 0) {
        const desiredW = startW + dx * dirX;
        nextW = nearestSize(allowedW, desiredW, (s) => widthPxForSize(s, parentRect.width));
      }
      if (dirY !== 0) {
        const desiredH = startH + dy * dirY;
        nextH = nearestSize(allowedH, desiredH, (s) => HEIGHT_PX[s]);
      }

      // Commit live : on n'envoie un patch que si on a sauté à un nouveau
      // palier — pas à chaque frame. Le snap discret limite la fréquence.
      if (moved && (nextW !== committedW || nextH !== committedH)) {
        const patch: WidgetSizePatch = {};
        if (nextW !== committedW) patch.size = nextW;
        if (nextH !== committedH) patch.height = nextH;
        committedW = nextW;
        committedH = nextH;
        onUpdateSize(patch);
      }
    }

    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      onResizingChange(false);

      // Drag = déjà committé live. Click sans drag = cycle vers la prochaine
      // taille autorisée (raccourci historique conservé).
      if (!moved) {
        const patch: WidgetSizePatch = {};
        if (dirX !== 0) {
          const next = NEXT_WIDTH[widget.size];
          patch.size = clampWidth(widget.vizType, next);
        }
        if (dirY !== 0) {
          const next = NEXT_HEIGHT[widget.height ?? "S"];
          patch.height = clampHeight(widget.vizType, next);
        }
        onUpdateSize(patch);
      }
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  // Visuel iOS-style pour bottom-right : petit grip arrondi en gris foncé,
  // chevauchant le coin du widget (offset négatif). Les autres positions
  // gardent leur petit dot historique au cas où on les remettrait.
  const isIosGrip = position === "bottom-right";
  if (isIosGrip) {
    return (
      <button
        type="button"
        onPointerDown={handlePointerDown}
        aria-label="Redimensionner"
        className="pointer-events-auto absolute -bottom-1 -right-1 cursor-nwse-resize inline-flex h-6 w-6 items-center justify-center rounded-full bg-neutral-700/95 text-white/80 shadow-lg backdrop-blur transition hover:bg-neutral-600"
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
          <path
            d="M5 13 L13 13 L13 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    );
  }
  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      aria-label="Redimensionner"
      className={`pointer-events-auto absolute ${posClass} ${cursor} h-2 w-2 rounded-full border border-white/30 bg-white/40 transition hover:scale-150 hover:border-white/60 hover:bg-white/80`}
    />
  );
}

// Helpers exportés — utiles si on veut programmatiquement cycler une
// dimension (ex. resetToDefault, raccourci clavier futur).
export function getNextWidgetWidth(current: WidgetWidth): WidgetWidth {
  return NEXT_WIDTH[current];
}
export function getNextWidgetHeight(current: WidgetSize): WidgetSize {
  return NEXT_HEIGHT[current];
}
