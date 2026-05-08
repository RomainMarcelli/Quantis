// File: components/dashboard/widgets/WidgetGrid.tsx
// Role: grille de widgets avec drag-drop reorder.
//
// Approche classique dnd-kit : pendant le drag, dnd-kit applique des
// transforms CSS aux widgets non-actifs pour signaler visuellement le
// nouvel ordre — SANS modifier le DOM ni la grille. Le commit se fait
// au drop. Avantages :
//   - Aucune re-mesure de la grille pendant le drag → Recharts ne tente
//     pas de re-render ses axes → pas de boucle "Maximum update depth".
//   - Tailles strictement préservées : col-span/row-span n'évoluent jamais
//     pendant le drag, donc pas de "le grand devient petit" visuellement.
//   - Compatible avec une grille mixte (XS/S/M/L × S/M/L).
//
// Pour la robustesse on garde aussi :
//   - `DragStateContext` → `StableChartContainer` met en pause son
//     ResizeObserver pendant le drag (protection si jamais une mesure
//     est déclenchée par un autre chemin).
//   - `React.memo` sur les widgets chart → moins de re-renders inutiles.
//
// Sélection (mode édition) :
//   - Clic simple → sélection unique
//   - Shift+clic → range
//   - Cmd/Ctrl+clic → toggle
//   - Clic hors widget → reset
"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates
} from "@dnd-kit/sortable";
import { WidgetFrame } from "@/components/dashboard/widgets/WidgetFrame";
import { DragStateContext } from "@/components/dashboard/widgets/DragStateContext";
import type { DashboardLayout, WidgetInstance } from "@/types/dashboard";

// Lit l'ordre visuel des widgets (top→bottom, left→right) depuis le DOM.
// Snap des tops à 8px près pour considérer les widgets sur la "même ligne"
// même si les bordures sub-pixel diffèrent légèrement.
function readVisualOrder(grid: HTMLElement | null): string[] | null {
  if (!grid) return null;
  const els = Array.from(grid.querySelectorAll<HTMLElement>("[data-widget-id]"));
  if (!els.length) return null;
  const items = els.map((el) => {
    const rect = el.getBoundingClientRect();
    return {
      id: el.dataset.widgetId ?? "",
      // Bucket les tops par paliers de 8px pour grouper la même rangée.
      row: Math.round(rect.top / 8),
      left: rect.left
    };
  });
  items.sort((a, b) => (a.row !== b.row ? a.row - b.row : a.left - b.left));
  return items.map((i) => i.id).filter(Boolean);
}

export type WidgetGridRenderer = (widget: WidgetInstance) => ReactNode;

export type SelectionModifiers = {
  shift: boolean;
  meta: boolean;
};

type WidgetGridProps = {
  layout: DashboardLayout;
  isEditing: boolean;
  renderWidget: WidgetGridRenderer;
  onReorder: (orderedIds: string[]) => void;
  onRemove: (instanceId: string) => void;
  onUpdateWidget: (instanceId: string, patch: Partial<WidgetInstance>) => void;
};

export function WidgetGrid({
  layout,
  isEditing,
  renderWidget,
  onReorder,
  onRemove,
  onUpdateWidget
}: WidgetGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const widgetIds = useMemo(() => layout.widgets.map((w) => w.id), [layout.widgets]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  // DragState exposé via context — consommé par StableChartContainer pour
  // mettre en pause son ResizeObserver pendant le drag.
  const dragState = useMemo(
    () => ({ isDragging: activeDragId !== null }),
    [activeDragId]
  );

  // ─── Selection lifecycle ─────────────────────────────────────────────
  useEffect(() => {
    if (!isEditing) {
      setSelectedIds(new Set());
      setAnchorId(null);
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    function onDocPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const widgetEl = target.closest<HTMLElement>("[data-widget-id]");
      if (!widgetEl) {
        setSelectedIds(new Set());
        setAnchorId(null);
      }
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [isEditing]);

  function handleSelect(widgetId: string, mods: SelectionModifiers) {
    if (mods.shift && anchorId) {
      // Range = ordre VISUEL (top→bottom, left→right), pas ordre DOM.
      // Avec des tailles mixtes en CSS Grid auto-flow, un widget L pousse
      // les suivants à la rangée d'après → ordre visuel ≠ ordre du tableau.
      // Sans ce tri, shift+click ramassait des widgets "fantômes" entre
      // les deux extrémités (présents dans le tableau, mais pas visuellement
      // entre l'anchor et le target).
      const orderedIds = readVisualOrder(gridRef.current) ?? widgetIds;
      const anchorIdx = orderedIds.indexOf(anchorId);
      const targetIdx = orderedIds.indexOf(widgetId);
      if (anchorIdx >= 0 && targetIdx >= 0) {
        const [from, to] =
          anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
        const range = new Set(orderedIds.slice(from, to + 1));
        setSelectedIds(range);
        return;
      }
    }
    if (mods.meta) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(widgetId)) next.delete(widgetId);
        else next.add(widgetId);
        return next;
      });
      setAnchorId(widgetId);
      return;
    }
    setSelectedIds(new Set([widgetId]));
    setAnchorId(widgetId);
  }

  // ─── Drag lifecycle ──────────────────────────────────────────────────
  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    // Multi-sélection : on déplace tout le groupe en bloc, à la position
    // du widget over (en excluant les sélectionnés du remaining).
    if (selectedIds.has(activeId) && selectedIds.size > 1) {
      if (selectedIds.has(overId)) return;
      const orderedSelected = widgetIds.filter((id) => selectedIds.has(id));
      const remaining = widgetIds.filter((id) => !selectedIds.has(id));
      const overIdxInRemaining = remaining.indexOf(overId);
      if (overIdxInRemaining < 0) return;
      const activeIdxOriginal = widgetIds.indexOf(activeId);
      const overIdxOriginal = widgetIds.indexOf(overId);
      const insertAt = overIdxOriginal > activeIdxOriginal
        ? overIdxInRemaining + 1
        : overIdxInRemaining;
      const newOrder = [
        ...remaining.slice(0, insertAt),
        ...orderedSelected,
        ...remaining.slice(insertAt)
      ];
      onReorder(newOrder);
      return;
    }

    // Reorder simple : on retire l'actif et on l'insère à l'index du over.
    // Plus naturel qu'un swap (le déplacement décale les autres au lieu
    // de les permuter pile à pile).
    const oldIndex = widgetIds.indexOf(activeId);
    const newIndex = widgetIds.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = [...widgetIds];
    const [moved] = newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, moved);
    onReorder(newOrder);
  }

  function handleRemove(widgetId: string) {
    if (selectedIds.has(widgetId) && selectedIds.size > 1) {
      const ids = Array.from(selectedIds);
      ids.forEach((id) => onRemove(id));
      setSelectedIds(new Set());
      setAnchorId(null);
      return;
    }
    if (selectedIds.has(widgetId)) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(widgetId);
        return next;
      });
    }
    if (anchorId === widgetId) setAnchorId(null);
    onRemove(widgetId);
  }

  function handleUpdateWidget(widgetId: string, patch: Partial<WidgetInstance>) {
    if (selectedIds.has(widgetId) && selectedIds.size > 1) {
      selectedIds.forEach((id) => onUpdateWidget(id, patch));
      return;
    }
    onUpdateWidget(widgetId, patch);
  }

  useEffect(() => {
    if (!isEditing) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (selectedIds.size === 0) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      e.preventDefault();
      const ids = Array.from(selectedIds);
      ids.forEach((id) => onRemove(id));
      setSelectedIds(new Set());
      setAnchorId(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isEditing, selectedIds, onRemove]);

  if (!layout.widgets.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
        <p className="text-sm text-white/55">
          Aucun widget pour l&apos;instant. Passe en mode édition et clique sur
          {" "}
          <span className="font-medium text-white/80">Ajouter un widget</span>.
        </p>
      </div>
    );
  }

  return (
    <DragStateContext.Provider value={dragState}>
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragId(null)}
    >
      <SortableContext items={widgetIds} strategy={rectSortingStrategy}>
        <div
          ref={gridRef}
          className="grid auto-rows-[200px] grid-cols-1 gap-5 md:grid-cols-12"
        >
          {layout.widgets.map((widget) => (
            <WidgetFrame
              key={widget.id}
              widget={widget}
              isEditing={isEditing}
              isSelected={selectedIds.has(widget.id)}
              onSelect={(mods) => handleSelect(widget.id, mods)}
              onRemove={() => handleRemove(widget.id)}
              onUpdateSize={(patch) => handleUpdateWidget(widget.id, patch)}
            >
              {renderWidget(widget)}
            </WidgetFrame>
          ))}
        </div>
      </SortableContext>
    </DndContext>
    </DragStateContext.Provider>
  );
}
