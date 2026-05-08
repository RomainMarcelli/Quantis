// File: lib/dashboard/widgetLayout.ts
// Role: layout déterministe pour widgets dans une grille 12 colonnes.
// Pour chaque widget dans l'ordre donné, place au PREMIER slot disponible
// qui peut accueillir sa taille (col-span × row-span). Émule l'algorithme
// auto-flow de CSS Grid mais en JS — sortie : positions explicites
// (col, row) que l'on applique en `gridColumn` / `gridRow` inline.
//
// Pourquoi : CSS Grid auto-flow ne nous donne pas de contrôle sur les
// positions intermédiaires pendant un drag. En calculant nous-mêmes les
// positions, on peut animer les transitions entre states (FLIP) sans
// dépendre du layout engine du navigateur. Indispensable pour la "danse"
// iOS-style avec items hétérogènes.

import type { WidgetInstance, WidgetSize, WidgetWidth } from "@/types/dashboard";
import { clampHeight, clampWidth } from "@/lib/dashboard/widgetSizeConstraints";

const COLS = 12;

const WIDTH_TO_SPAN: Record<WidgetWidth, number> = {
  XS: 3,
  S: 4,
  M: 6,
  L: 12
};

const HEIGHT_TO_SPAN: Record<WidgetSize, number> = {
  S: 1,
  M: 2,
  L: 3
};

export type WidgetGridPosition = {
  col: number; // 1-indexed grid column start
  row: number; // 1-indexed grid row start
  colSpan: number;
  rowSpan: number;
};

export type WidgetLayoutResult = {
  positions: Map<string, WidgetGridPosition>;
  totalRows: number;
};

export function computeWidgetPositions(
  widgets: WidgetInstance[]
): WidgetLayoutResult {
  const positions = new Map<string, WidgetGridPosition>();
  // occupied[r][c] = true → cellule occupée. Étendu dynamiquement quand on
  // a besoin de rangées supplémentaires.
  const occupied: boolean[][] = [];
  let maxRow = 0;

  for (const widget of widgets) {
    const widthAxis = clampWidth(widget.vizType, widget.size);
    const heightAxis = clampHeight(widget.vizType, widget.height ?? "S");
    const colSpan = WIDTH_TO_SPAN[widthAxis];
    const rowSpan = HEIGHT_TO_SPAN[heightAxis];

    let placed = false;
    let row = 0;
    while (!placed) {
      // Garantit que `occupied` couvre les `rowSpan` rangées à partir de `row`.
      while (occupied.length <= row + rowSpan - 1) {
        occupied.push(new Array(COLS).fill(false));
      }
      // Cherche une colonne libre où le widget rentre entièrement.
      for (let col = 0; col + colSpan <= COLS; col++) {
        let canFit = true;
        for (let r = row; r < row + rowSpan && canFit; r++) {
          for (let c = col; c < col + colSpan && canFit; c++) {
            if (occupied[r][c]) canFit = false;
          }
        }
        if (canFit) {
          for (let r = row; r < row + rowSpan; r++) {
            for (let c = col; c < col + colSpan; c++) {
              occupied[r][c] = true;
            }
          }
          positions.set(widget.id, {
            col: col + 1,
            row: row + 1,
            colSpan,
            rowSpan
          });
          maxRow = Math.max(maxRow, row + rowSpan);
          placed = true;
          break;
        }
      }
      if (!placed) row++;
    }
  }

  return { positions, totalRows: maxRow };
}
