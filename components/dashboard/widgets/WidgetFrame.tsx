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
import { X } from "lucide-react";
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

type ResizePreview = {
  widthPx: number;
  heightPx: number;
  anchor: { left?: number; right?: number; top?: number; bottom?: number };
};

type WidgetFrameProps = {
  widget: WidgetInstance;
  isEditing: boolean;
  onRemove: () => void;
  onUpdateSize: (patch: WidgetSizePatch) => void;
  /** True si CE widget est le widget actuellement sélectionné en mode édition.
   *  La sélection est portée par WidgetGrid (clic = sélectionne, clic ailleurs
   *  = désélectionne). Quand sélectionné : poignées toujours visibles + wiggle. */
  isSelected?: boolean;
  /** Callback quand l'utilisateur clique le widget en mode édition (sélection). */
  onSelect?: () => void;
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
// et chaque widget consomme N rangées. Cohérent avec une matrice 3×3
// stricte : les widgets s'alignent toujours sur la même grille verticale.
const HEIGHT_TO_ROW_SPAN: Record<WidgetSize, string> = {
  S: "row-span-1",
  M: "row-span-2",
  L: "row-span-3"
};

// Hauteur effective en px pour le calcul de snap pendant le drag.
// Doit rester synchronisée avec ROW_HEIGHT_PX dans WidgetGrid (200) +
// le gap-5 (20 px) entre les rangées.
const ROW_HEIGHT_PX = 200;
const ROW_GAP_PX = 20;
const HEIGHT_PX: Record<WidgetSize, number> = {
  S: ROW_HEIGHT_PX,
  M: ROW_HEIGHT_PX * 2 + ROW_GAP_PX,
  L: ROW_HEIGHT_PX * 3 + ROW_GAP_PX * 2
};

const NEXT_HEIGHT: Record<WidgetSize, WidgetSize> = { S: "M", M: "L", L: "S" };
const NEXT_WIDTH: Record<WidgetWidth, WidgetWidth> = { XS: "S", S: "M", M: "L", L: "XS" };

// Cherche la dimension cible la plus proche en pixels, restreinte au
// sous-ensemble `allowed` (filtré par les contraintes du vizType).
function nearestSize<T extends string>(
  allowed: T[],
  target: number,
  resolvePx: (size: T) => number
): T {
  let best = allowed[0];
  let bestDist = Infinity;
  for (const s of allowed) {
    const d = Math.abs(resolvePx(s) - target);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

export function WidgetFrame({
  widget,
  isEditing,
  onRemove,
  onUpdateSize,
  isSelected = false,
  onSelect,
  children
}: WidgetFrameProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
    disabled: !isEditing
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [preview, setPreview] = useState<ResizePreview | null>(null);
  // Hover du widget — visible le chrome au survol même si non sélectionné.
  const [isHovered, setIsHovered] = useState(false);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  // Auto-corrige les tailles persistées qui violent les contraintes
  // actuelles (ex. layout antérieur sans contraintes). On rend avec la
  // taille clampée — la persistance se mettra à jour au prochain patch.
  const widthAxis = clampWidth(widget.vizType, widget.size);
  const heightAxis = clampHeight(widget.vizType, widget.height ?? "S");
  const colSpanClass = WIDTH_TO_COL_SPAN[widthAxis];
  const rowSpanClass = HEIGHT_TO_ROW_SPAN[heightAxis];

  // Chrome visible : hover, sélectionné, drag actif, ou resize en cours.
  const showChrome = isEditing && (isHovered || isSelected || isDragging || preview !== null);
  // Wiggle : seulement quand sélectionné (signal "tu manipules ce widget").
  const wiggleClass = isEditing && isSelected && !isDragging && !preview ? "widget-wiggle" : "";

  function setRefs(node: HTMLDivElement | null) {
    setNodeRef(node);
    containerRef.current = node;
  }

  // En mode édition, on attache les listeners de drag à TOUT le widget
  // (pas juste à la poignée GripVertical) pour permettre de drag depuis
  // n'importe où. Les boutons internes (X remove + 8 ResizeHandle) ont
  // leur propre stopPropagation pour ne pas interférer. Le PointerSensor
  // a un activationConstraint distance=5 (cf. WidgetGrid) → un clic court
  // ne déclenche pas de drag, donc le simple click pour sélectionner
  // continue de fonctionner.
  const dragProps = isEditing ? { ...attributes, ...listeners } : {};

  return (
    <div
      ref={setRefs}
      style={style}
      className={`group/widget relative ${colSpanClass} ${rowSpanClass} ${wiggleClass} ${
        isEditing ? "cursor-grab active:cursor-grabbing" : ""
      } ${isSelected ? "ring-2 ring-quantis-gold/50 ring-offset-2 ring-offset-quantis-base rounded-2xl" : ""}`}
      data-widget-id={widget.id}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        if (!isEditing) return;
        // On ne sélectionne que si le clic vient du widget lui-même, pas
        // d'un bouton interne (drag handle, X, resize). stopPropagation
        // côté boutons internes empêche de remonter ici.
        if (onSelect) onSelect();
      }}
      {...dragProps}
    >
      {/* Wrapper plein-cadre pour que le card enfant remplisse le BBOX. */}
      <div className="h-full w-full">
        {children}
      </div>

      {preview ? (
        <div
          className="pointer-events-none absolute z-20 rounded-2xl border-2 border-dashed border-quantis-gold/50 bg-quantis-gold/5"
          style={{
            left: preview.anchor.left,
            right: preview.anchor.right,
            top: preview.anchor.top,
            bottom: preview.anchor.bottom,
            width: preview.widthPx,
            height: preview.heightPx
          }}
        />
      ) : null}

      {showChrome ? (
        <div className="pointer-events-none absolute inset-0 z-10">
          {/* Bouton de suppression — pour les widgets non-fixes uniquement.
              stopPropagation au pointerdown ET au click pour ne pas déclencher
              le drag global du widget parent ni le onSelect. */}
          {widget.isFixed ? null : (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              aria-label="Supprimer le widget"
              className="pointer-events-auto absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-400/30 bg-rose-500/15 text-rose-200 backdrop-blur transition hover:bg-rose-500/25 hover:text-rose-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          <ResizeHandle position="top" dirX={0} dirY={-1} containerRef={containerRef} widget={widget} onUpdateSize={onUpdateSize} onPreview={setPreview} />
          <ResizeHandle position="bottom" dirX={0} dirY={1} containerRef={containerRef} widget={widget} onUpdateSize={onUpdateSize} onPreview={setPreview} />
          <ResizeHandle position="left" dirX={-1} dirY={0} containerRef={containerRef} widget={widget} onUpdateSize={onUpdateSize} onPreview={setPreview} />
          <ResizeHandle position="right" dirX={1} dirY={0} containerRef={containerRef} widget={widget} onUpdateSize={onUpdateSize} onPreview={setPreview} />
          <ResizeHandle position="top-left" dirX={-1} dirY={-1} containerRef={containerRef} widget={widget} onUpdateSize={onUpdateSize} onPreview={setPreview} />
          <ResizeHandle position="top-right" dirX={1} dirY={-1} containerRef={containerRef} widget={widget} onUpdateSize={onUpdateSize} onPreview={setPreview} />
          <ResizeHandle position="bottom-left" dirX={-1} dirY={1} containerRef={containerRef} widget={widget} onUpdateSize={onUpdateSize} onPreview={setPreview} />
          <ResizeHandle position="bottom-right" dirX={1} dirY={1} containerRef={containerRef} widget={widget} onUpdateSize={onUpdateSize} onPreview={setPreview} />
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

const HANDLE_ANCHOR: Record<HandlePosition, ResizePreview["anchor"]> = {
  top: { left: 0, bottom: 0 },
  bottom: { left: 0, top: 0 },
  left: { right: 0, top: 0 },
  right: { left: 0, top: 0 },
  "top-left": { right: 0, bottom: 0 },
  "top-right": { left: 0, bottom: 0 },
  "bottom-left": { right: 0, top: 0 },
  "bottom-right": { left: 0, top: 0 }
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
  onPreview
}: {
  position: HandlePosition;
  dirX: -1 | 0 | 1;
  dirY: -1 | 0 | 1;
  containerRef: React.RefObject<HTMLDivElement | null>;
  widget: WidgetInstance;
  onUpdateSize: (patch: WidgetSizePatch) => void;
  onPreview: (preview: ResizePreview | null) => void;
}) {
  const { position: posClass, cursor } = HANDLE_STYLES[position];
  const anchor = HANDLE_ANCHOR[position];

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
    let targetW: WidgetWidth = clampWidth(widget.vizType, widget.size);
    let targetH: WidgetSize = clampHeight(widget.vizType, widget.height ?? "S");

    function handleMove(moveEvent: PointerEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;

      if (dirX !== 0) {
        const desiredW = startW + dx * dirX;
        targetW = nearestSize(allowedW, desiredW, (s) => widthPxForSize(s, parentRect.width));
      }
      if (dirY !== 0) {
        const desiredH = startH + dy * dirY;
        targetH = nearestSize(allowedH, desiredH, (s) => HEIGHT_PX[s]);
      }

      if (moved) {
        onPreview({
          widthPx: dirX !== 0 ? widthPxForSize(targetW, parentRect.width) : startW,
          heightPx: dirY !== 0 ? HEIGHT_PX[targetH] : startH,
          anchor
        });
      }
    }

    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      onPreview(null);

      if (moved) {
        const patch: WidgetSizePatch = {};
        if (dirX !== 0 && targetW !== widget.size) patch.size = targetW;
        if (dirY !== 0 && targetH !== (widget.height ?? "S")) patch.height = targetH;
        if (patch.size || patch.height) onUpdateSize(patch);
      } else {
        // Clic = cycle vers la prochaine taille autorisée par les contraintes.
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
