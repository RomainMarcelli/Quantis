// File: components/dashboard/widgets/WidgetGrid.tsx
// Role: grille de widgets avec drag-drop reorder via @dnd-kit. Rend les
// widgets dans l'ordre du layout courant ; l'utilisateur peut réordonner
// par drag en mode édition. Le résolveur de viz (`renderWidget`) est
// injecté par le parent — il choisit quel composant rendre selon le
// `vizType` du widget.
//
// Sélection : en mode édition, un clic sur un widget le marque "sélectionné"
// (wiggle + poignées toujours visibles). Click sur le canvas désélectionne.
"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates
} from "@dnd-kit/sortable";
import { WidgetFrame } from "@/components/dashboard/widgets/WidgetFrame";
import type { DashboardLayout, WidgetInstance } from "@/types/dashboard";

export type WidgetGridRenderer = (widget: WidgetInstance) => ReactNode;

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
  // PointerSensor avec un activationConstraint pour ne pas confondre clic
  // (sur un bouton interne par ex.) et début de drag. distance:5 → on ne
  // démarre le drag qu'après un déplacement réel de 5 px. Indispensable
  // depuis qu'on attache les listeners de drag à TOUT le widget (pas
  // juste à la poignée) — sinon chaque clic-pour-sélectionner deviendrait
  // un drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const widgetIds = useMemo(() => layout.widgets.map((w) => w.id), [layout.widgets]);

  // ID du widget actuellement sélectionné (mode édition uniquement).
  // Un clic sur un widget = sélection ; clic ailleurs (ou hors édition) = reset.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  // Reset de la sélection quand on quitte le mode édition.
  useEffect(() => {
    if (!isEditing) setSelectedId(null);
  }, [isEditing]);

  // Désélectionne quand l'utilisateur clique en dehors d'un widget.
  // (pointerdown plutôt que click pour réagir avant le drag éventuel)
  useEffect(() => {
    if (!isEditing) return;
    function onDocPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Si le pointerdown vient de la grille mais pas d'un widget enfant,
      // on désélectionne. data-widget-id est posé sur chaque WidgetFrame.
      const widgetEl = target.closest<HTMLElement>("[data-widget-id]");
      if (!widgetEl) {
        setSelectedId(null);
      }
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [isEditing]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = widgetIds.indexOf(String(active.id));
    const newIndex = widgetIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(widgetIds, oldIndex, newIndex));
  }

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
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={widgetIds} strategy={rectSortingStrategy}>
        {/* Grille à rangées fixes (200px) + flow dense pour que les
            widgets de tailles variées (S/M/L sur les 2 axes) s'imbriquent
            sans laisser de trous. La hauteur d'un widget = N×200 + (N-1)×gap
            avec N ∈ {1,2,3} selon son axe `height`. */}
        <div ref={gridRef} className="grid auto-rows-[200px] grid-flow-row-dense grid-cols-1 gap-5 md:grid-cols-12">
          {layout.widgets.map((widget) => (
            <WidgetFrame
              key={widget.id}
              widget={widget}
              isEditing={isEditing}
              isSelected={selectedId === widget.id}
              onSelect={() => setSelectedId(widget.id)}
              onRemove={() => {
                if (selectedId === widget.id) setSelectedId(null);
                onRemove(widget.id);
              }}
              onUpdateSize={(patch) => onUpdateWidget(widget.id, patch)}
            >
              {renderWidget(widget)}
            </WidgetFrame>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
