"use client";

import { AnalysisCard } from "@/components/documents/AnalysisCard";
import type { AnalysisRecord } from "@/types/analysis";

type AnalysisCardGridProps = {
  analyses: AnalysisRecord[];
  folders: string[];
  onDelete: (id: string) => void;
  onMove: (id: string, targetFolder: string) => void;
};

export function AnalysisCardGrid({ analyses, folders, onDelete, onMove }: AnalysisCardGridProps) {
  return (
    <div className="grid w-full gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {analyses.map((analysis) => (
        <AnalysisCard
          key={analysis.id}
          analysis={analysis}
          folders={folders}
          onDelete={onDelete}
          onMove={onMove}
        />
      ))}
    </div>
  );
}
