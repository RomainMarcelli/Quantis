"use client";

import { FileText, Plus, Upload } from "lucide-react";

type EmptyFolderStateProps = {
  folderName: string;
  onUpload: () => void;
};

export function EmptyFolderState({ folderName, onUpload }: EmptyFolderStateProps) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-8 py-20">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
        <FileText className="h-9 w-9 text-white/20" />
      </div>
      <p className="mt-6 text-base font-medium text-white/70">
        Aucune analyse dans &laquo;&nbsp;{folderName}&nbsp;&raquo;
      </p>
      <p className="mt-2 max-w-xs text-center text-xs leading-relaxed text-white/40">
        Uploadez une liasse fiscale (PDF ou Excel) pour lancer votre premi&egrave;re analyse financi&egrave;re.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onUpload}
          className="btn-gold-premium inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
        >
          <Upload className="h-4 w-4" />
          Uploader une liasse fiscale
        </button>
        <button
          type="button"
          onClick={onUpload}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white/80"
        >
          <Plus className="h-4 w-4" />
          Nouvelle analyse
        </button>
      </div>
    </div>
  );
}
