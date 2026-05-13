// File: components/dashboard/widgets/DragStateContext.tsx
// Role: contexte qui signale aux composants enfants (notamment
// `StableChartContainer`) qu'un drag est en cours dans le dashboard.
// Permet à ces composants de mettre en pause leur ResizeObserver pendant
// la danse iOS-style — sans ça, Recharts re-rendrait à chaque frame de
// la spring et déclencherait "Maximum update depth exceeded".
"use client";

import { createContext, useContext } from "react";

export type DragState = {
  isDragging: boolean;
};

export const DragStateContext = createContext<DragState>({ isDragging: false });

export function useDragState(): DragState {
  return useContext(DragStateContext);
}
