// File: lib/dashboard/widgetPlacement.ts
// Role: helpers de placement libre des widgets dans la grille 12 colonnes.
// Chaque widget a une `size` (XS/S/M/L → 3/4/6/12 cols) et une `height`
// (S/M/L → 1/2/3 rows). En mode "free placement" l'utilisateur place le
// widget où il veut via (col, row), et on autorise les trous.

import type { WidgetInstance, WidgetSize, WidgetWidth } from "@/types/dashboard";

export const GRID_COLS = 12;

// Colspan par palier de largeur — aligné avec WIDTH_TO_COL_SPAN dans
// WidgetFrame (la version Tailwind qu'on utilise pour les widgets sans
// (col, row) explicite). 1/4, 1/3, 1/2, 1/1.
export const WIDTH_TO_COLSPAN: Record<WidgetWidth, number> = {
  XS: 3,
  S: 4,
  M: 6,
  L: 12,
};

export const HEIGHT_TO_ROWSPAN: Record<WidgetSize, number> = {
  S: 1,
  M: 2,
  L: 3,
  XL: 4,
};

export function widgetColSpan(w: Pick<WidgetInstance, "size">): number {
  return WIDTH_TO_COLSPAN[w.size];
}

export function widgetRowSpan(w: Pick<WidgetInstance, "height">): number {
  return HEIGHT_TO_ROWSPAN[w.height ?? "S"];
}

/**
 * Vérifie si une cellule (col, row) avec (colSpan, rowSpan) entre en
 * collision avec un widget déjà placé. Les widgets sans (col, row) sont
 * ignorés (ils ne sont pas placés explicitement, donc pas de collision
 * avec un autre placement explicite).
 */
function collidesWith(
  col: number, row: number, colSpan: number, rowSpan: number,
  others: WidgetInstance[],
): boolean {
  for (const w of others) {
    if (w.col === undefined || w.row === undefined) continue;
    const wCol = w.col;
    const wRow = w.row;
    const wColSpan = widgetColSpan(w);
    const wRowSpan = widgetRowSpan(w);
    const overlapsX = col < wCol + wColSpan && wCol < col + colSpan;
    const overlapsY = row < wRow + wRowSpan && wRow < row + rowSpan;
    if (overlapsX && overlapsY) return true;
  }
  return false;
}

/**
 * Cherche la première cellule libre où un widget de taille donnée peut être
 * placé sans chevauchement. Parcours en lecture latine (row puis col), borne
 * la grille en colonnes (12) et étend les rangées tant que nécessaire.
 */
export function findFirstFreeCell(
  size: WidgetWidth, height: WidgetSize | undefined,
  others: WidgetInstance[],
): { col: number; row: number } {
  const colSpan = WIDTH_TO_COLSPAN[size];
  const rowSpan = HEIGHT_TO_ROWSPAN[height ?? "S"];
  // Borne supérieure raisonnable — au-delà de 50 rangées on s'arrête (la
  // grille deviendrait inexploitable de toute façon).
  for (let row = 0; row < 50; row++) {
    for (let col = 0; col + colSpan <= GRID_COLS; col++) {
      if (!collidesWith(col, row, colSpan, rowSpan, others)) {
        return { col, row };
      }
    }
  }
  return { col: 0, row: 0 };
}

/**
 * Détecte la collision d'un widget candidat (col, row, colSpan, rowSpan)
 * avec la liste `others`. `excludeId` permet d'ignorer le widget lui-même
 * (utile à drag-end où on évalue la nouvelle position du widget actif).
 */
export function isCellOccupied(
  col: number, row: number, colSpan: number, rowSpan: number,
  others: WidgetInstance[], excludeId?: string,
): boolean {
  return collidesWith(
    col, row, colSpan, rowSpan,
    others.filter((w) => w.id !== excludeId),
  );
}

/**
 * Cherche la cellule libre la PLUS PROCHE de (targetCol, targetRow) où un
 * widget de taille (colSpan, rowSpan) peut être placé. Scan en spirale
 * carrée centrée sur la cible, expansion croissante. Stop quand on trouve
 * une cellule libre — sinon fallback sur la première cell libre globale.
 */
export function findNearestFreeCell(
  targetCol: number, targetRow: number,
  colSpan: number, rowSpan: number,
  others: WidgetInstance[],
  excludeId?: string,
): { col: number; row: number } {
  const candidates = others.filter((w) => w.id !== excludeId);
  // Si la cible est libre, on la prend directement.
  const clampedTarget = {
    col: Math.max(0, Math.min(GRID_COLS - colSpan, targetCol)),
    row: Math.max(0, targetRow),
  };
  if (!collidesWith(clampedTarget.col, clampedTarget.row, colSpan, rowSpan, candidates)) {
    return clampedTarget;
  }
  // Scan en distance Manhattan croissante autour de la cible. Borne
  // raisonnable : la grille a 12 cols ; au-delà de 20 rangées de scan, on
  // tombe en fallback.
  for (let radius = 1; radius <= 20; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.abs(dc) + Math.abs(dr) !== radius) continue;
        const c = clampedTarget.col + dc;
        const r = clampedTarget.row + dr;
        if (c < 0 || c + colSpan > GRID_COLS || r < 0) continue;
        if (!collidesWith(c, r, colSpan, rowSpan, candidates)) {
          return { col: c, row: r };
        }
      }
    }
  }
  // Dernier recours : première cell libre globale.
  return { col: 0, row: 0 };
}


/**
 * Snap une position pixel (relative au coin haut-gauche de la grille) vers
 * la cellule (col, row) la plus proche, clampée aux limites.
 */
export function snapPxToCell(
  pxX: number, pxY: number,
  cellWidthPx: number, cellHeightPx: number,
  colSpan: number, rowSpan: number,
): { col: number; row: number } {
  const col = Math.max(0, Math.min(GRID_COLS - colSpan, Math.round(pxX / cellWidthPx)));
  const row = Math.max(0, Math.round(pxY / cellHeightPx));
  return { col, row };
}

/**
 * Calcule la rangée maximale occupée par les widgets — utile pour
 * dimensionner la grille (ajouter une rangée vide en bas pour laisser
 * l'utilisateur déposer un widget sous les autres).
 */
export function maxRow(widgets: WidgetInstance[]): number {
  let max = 0;
  for (const w of widgets) {
    if (w.row === undefined) continue;
    const bottom = w.row + widgetRowSpan(w);
    if (bottom > max) max = bottom;
  }
  return max;
}
