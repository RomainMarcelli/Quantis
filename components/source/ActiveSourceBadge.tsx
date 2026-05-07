// Badge "source active" affiché dans le header du dashboard.
// Format : "Pennylane · sync il y a 2h" + bouton "Changer de source" qui
// renvoie sur /documents.
"use client";

import { useRouter } from "next/navigation";
import { Database, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import { describeAnalysisSource } from "@/lib/source/sourceKind";
import type { AnalysisRecord } from "@/types/analysis";

type ActiveSourceBadgeProps = {
  analysis: AnalysisRecord | null;
};

export function ActiveSourceBadge({ analysis }: ActiveSourceBadgeProps) {
  const router = useRouter();

  if (!analysis) {
    return (
      <button
        type="button"
        onClick={() => router.push("/documents")}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
        title="Aucune source active"
      >
        <Database className="h-3.5 w-3.5 text-white/40" />
        <span>Aucune source active</span>
        <span className="text-quantis-gold">→</span>
      </button>
    );
  }

  const desc = describeAnalysisSource(analysis);
  const icon = (() => {
    switch (desc.kind) {
      case "pennylane":
      case "myunisoft":
      case "odoo":
        return <Database className="h-3.5 w-3.5 text-emerald-400" />;
      case "fec":
        return <FileSpreadsheet className="h-3.5 w-3.5 text-sky-400" />;
      default:
        return <FileText className="h-3.5 w-3.5 text-rose-400" />;
    }
  })();

  return (
    <div className="flex items-center gap-2 rounded-xl border border-quantis-gold/30 bg-quantis-gold/5 px-3 py-1.5">
      {icon}
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[11px] font-semibold text-white" title={desc.label}>
          {desc.label}
        </span>
        <span className="text-[10px] text-white/50">{desc.detail}</span>
      </div>
      <button
        type="button"
        onClick={() => router.push("/documents")}
        className="ml-2 inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-white/70 hover:bg-white/10"
        title="Changer la source active depuis Documents"
      >
        <RefreshCw className="h-3 w-3" />
        Changer
      </button>
    </div>
  );
}
