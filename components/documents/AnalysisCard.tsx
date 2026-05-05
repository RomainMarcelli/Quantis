"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  FolderInput,
  Plug,
  Star,
  Trash2,
} from "lucide-react";
import { formatCurrency, INSUFFICIENT_DATA_LABEL } from "@/components/dashboard/formatting";
import { ConfirmDialog } from "@/components/documents/ConfirmDialog";
import {
  describeAnalysisSource,
  getAnalysisSourceKind,
  writeActiveAnalysisId,
} from "@/lib/source/activeSource";
import type { AnalysisRecord } from "@/types/analysis";

type AnalysisCardProps = {
  analysis: AnalysisRecord;
  folders: string[];
  onDelete: (id: string) => void;
  onMove: (id: string, targetFolder: string) => void;
  isActive?: boolean;
  onSetActive?: (id: string) => void;
};

export function AnalysisCard({ analysis, folders, onDelete, onMove, isActive = false, onSetActive }: AnalysisCardProps) {
  const router = useRouter();
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Détermine la "présentation" de la source : un fichier uploadé garde son
  // nom et son icône type-fichier ; une source dynamique (Pennylane / MyUnisoft
  // / Odoo) prend l'icône Plug + le label provider — sinon l'utilisateur voit
  // "Analyse sans fichier" et ne sait pas que c'est sa sync Pennylane.
  const sourceKind = getAnalysisSourceKind(analysis);
  const isDynamic =
    sourceKind === "pennylane" || sourceKind === "myunisoft" || sourceKind === "odoo";
  const sourceFile = analysis.sourceFiles[0];
  const description = describeAnalysisSource(analysis);
  const fileName = isDynamic
    ? description.label
    : sourceFile?.name ?? "Analyse sans fichier";
  const fileType: "pdf" | "excel" | "fec" | "pennylane" | "myunisoft" | "odoo" = isDynamic
    ? sourceKind
    : (sourceFile?.type ?? "pdf");
  const ca = analysis.kpis.ca;
  const score = analysis.quantisScore?.quantis_score ?? null;

  // Couleurs par type — étendues aux sources dynamiques pour qu'elles ne
  // ressemblent pas à un PDF (palette rouge) par accident.
  const TYPE_VISUALS: Record<
    typeof fileType,
    { iconClass: string; bgClass: string; badge: string; badgeClass: string }
  > = {
    pdf: { iconClass: "text-rose-400", bgClass: "bg-rose-500/10", badge: "PDF", badgeClass: "bg-rose-500/15 text-rose-300" },
    excel: { iconClass: "text-emerald-400", bgClass: "bg-emerald-500/10", badge: "EXCEL", badgeClass: "bg-emerald-500/15 text-emerald-300" },
    fec: { iconClass: "text-cyan-400", bgClass: "bg-cyan-500/10", badge: "FEC", badgeClass: "bg-cyan-500/15 text-cyan-300" },
    pennylane: { iconClass: "text-quantis-gold", bgClass: "bg-quantis-gold/10", badge: "PENNYLANE", badgeClass: "bg-quantis-gold/15 text-quantis-gold" },
    myunisoft: { iconClass: "text-violet-300", bgClass: "bg-violet-500/10", badge: "MYUNISOFT", badgeClass: "bg-violet-500/15 text-violet-300" },
    odoo: { iconClass: "text-fuchsia-300", bgClass: "bg-fuchsia-500/10", badge: "ODOO", badgeClass: "bg-fuchsia-500/15 text-fuchsia-300" },
  };
  const visuals = TYPE_VISUALS[fileType];

  const scoreColor =
    score === null
      ? "text-white/40 bg-white/5"
      : score >= 80
        ? "text-green-400 bg-green-500/10"
        : score >= 60
          ? "text-amber-400 bg-amber-500/10"
          : score >= 40
            ? "text-orange-400 bg-orange-500/10"
            : "text-red-400 bg-red-500/10";

  const scoreLabel =
    score === null
      ? INSUFFICIENT_DATA_LABEL
      : score >= 80
        ? "Excellent"
        : score >= 60
          ? "Bon"
          : score >= 40
            ? "Fragile"
            : "Critique";

  const formattedDate = new Date(analysis.createdAt).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  const otherFolders = folders.filter(
    (f) => f.toLowerCase() !== analysis.folderName.toLowerCase()
  );

  // Bordure dorée + halo si active. Opacité réduite si non-active (toujours
  // consultable via "Voir l'analyse" mais visuellement reléguée).
  const containerClasses = [
    "group relative flex flex-col rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5",
    isActive
      ? "border-quantis-gold/60 bg-quantis-gold/[0.06] shadow-[0_4px_28px_rgba(245,158,11,0.18)] hover:border-quantis-gold/80"
      : onSetActive
        ? "border-white/10 bg-white/[0.04] opacity-75 hover:border-amber-400/40 hover:bg-white/[0.06] hover:opacity-100 hover:shadow-[0_4px_24px_rgba(245,158,11,0.08)]"
        : "border-white/10 bg-white/[0.04] hover:border-amber-400/40 hover:bg-white/[0.06] hover:shadow-[0_4px_24px_rgba(245,158,11,0.08)]",
  ].join(" ");

  function handleSetActive() {
    writeActiveAnalysisId(analysis.id);
    onSetActive?.(analysis.id);
  }

  return (
    <>
      <div className={containerClasses}>
        {isActive ? (
          <span className="absolute -top-2 left-4 inline-flex items-center gap-1 rounded-full border border-quantis-gold/60 bg-quantis-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black shadow-md">
            <Star className="h-2.5 w-2.5" />
            Active
          </span>
        ) : null}
        <div className="mb-4 flex items-start gap-3">
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${visuals.bgClass}`}>
            {isDynamic ? (
              <Plug className={`h-5 w-5 ${visuals.iconClass}`} />
            ) : fileType === "excel" ? (
              <FileSpreadsheet className={`h-5 w-5 ${visuals.iconClass}`} />
            ) : (
              <FileText className={`h-5 w-5 ${visuals.iconClass}`} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium leading-snug text-white" title={fileName}>
              {fileName}
            </p>
            <p className="mt-1 text-xs text-white/40">
              {isDynamic ? description.detail : formattedDate}
            </p>
          </div>
          <span className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${visuals.badgeClass}`}>
            {visuals.badge}
          </span>
        </div>

        {analysis.fiscalYear ? (
          <p className="mb-3 text-xs text-white/45">Exercice {analysis.fiscalYear}</p>
        ) : null}

        <div className="mb-5 rounded-xl border border-white/5 bg-black/25 px-4 py-3">
          <div className="mb-2">
            <p className="text-[10px] uppercase tracking-wider text-white/30">Chiffre d&apos;affaires</p>
            <p className="mt-0.5 text-2xl font-bold tracking-tight text-white">
              {ca !== null ? formatCurrency(ca) : <span className="text-white/25">N/D</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ${scoreColor}`}>
              <BarChart3 className="h-3.5 w-3.5" />
              {score !== null ? score : "—"}
            </span>
            <span className={`text-xs ${score === null ? "text-white/30" : scoreColor.split(" ")[0]}`}>
              {scoreLabel}
            </span>
          </div>
        </div>

        {/* Bouton "source active" : visible uniquement si onSetActive câblé.
            État active = bouton désactivé (déjà active, juste un repère visuel).
            État inactive = bouton secondaire qui pousse l'id en localStorage
            via writeActiveAnalysisId (déclenche un event que SyntheseView écoute). */}
        {onSetActive ? (
          isActive ? (
            <div className="mb-2 inline-flex items-center justify-center gap-1.5 rounded-xl border border-quantis-gold/40 bg-quantis-gold/10 py-2 text-xs font-semibold text-quantis-gold">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Source active du dashboard
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSetActive}
              className="mb-2 inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 py-2 text-xs font-medium text-white/80 transition-colors hover:border-quantis-gold/40 hover:bg-quantis-gold/10 hover:text-quantis-gold"
              title="Utiliser cette analyse comme source du dashboard"
            >
              <Star className="h-3.5 w-3.5" />
              Utiliser comme source active
            </button>
          )
        ) : null}

        <div className="mt-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(`/analysis/${analysis.id}`)}
            className="flex-1 rounded-xl border border-quantis-gold/30 bg-quantis-gold/10 py-2.5 text-xs font-semibold text-quantis-gold transition-colors hover:bg-quantis-gold/20"
          >
            Voir l&apos;analyse
          </button>
          {otherFolders.length > 0 ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMoveMenu((v) => !v)}
                className="rounded-xl border border-white/10 p-2.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/70"
                title="Déplacer vers un autre dossier"
              >
                <FolderInput className="h-3.5 w-3.5" />
              </button>
              {showMoveMenu ? (
                <div className="absolute bottom-full right-0 z-20 mb-1 w-52 rounded-xl border border-white/15 bg-[#111218] p-1.5 shadow-2xl">
                  <p className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-white/35">D&eacute;placer vers</p>
                  {otherFolders.map((folder) => (
                    <button
                      key={folder}
                      type="button"
                      onClick={() => {
                        onMove(analysis.id, folder);
                        setShowMoveMenu(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-white/70 transition-colors hover:bg-white/10"
                    >
                      <FolderInput className="h-3 w-3 text-white/30" />
                      {folder}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-xl border border-white/10 p-2.5 text-white/30 transition-colors hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400"
            title="Supprimer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Supprimer cette analyse"
        message={`L'analyse "${fileName}" sera supprimée définitivement. Cette action est irréversible.`}
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDelete(analysis.id);
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}
