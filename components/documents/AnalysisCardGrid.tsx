"use client";

import { AnalysisCard } from "@/components/documents/AnalysisCard";
import type { AnalysisRecord } from "@/types/analysis";

type AnalysisCardGridProps = {
  analyses: AnalysisRecord[];
  folders: string[];
  onDelete: (id: string) => void;
  onMove: (id: string, targetFolder: string) => void;
  /** Nom du dossier actif. Toutes les cards de ce dossier sont highlightées en
   *  doré — l'activation se fait au niveau dossier (un seul clic active toute
   *  la série multi-exercices), plus par card individuelle. */
  activeFolderName?: string | null;
};

export function AnalysisCardGrid({
  analyses,
  folders,
  onDelete,
  onMove,
  activeFolderName
}: AnalysisCardGridProps) {
  const normalizedActive = activeFolderName?.toLowerCase() ?? null;
  return (
    <div className="grid w-full gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {analyses.map((analysis) => (
        <AnalysisCard
          key={analysis.id}
          analysis={analysis}
          folders={folders}
          onDelete={onDelete}
          onMove={onMove}
          isActive={normalizedActive !== null && analysis.folderName.toLowerCase() === normalizedActive}
        />
      ))}
    </div>
  );
}
