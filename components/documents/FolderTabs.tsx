"use client";

import { Folder, Pencil, Plus, Trash2 } from "lucide-react";

type FolderItem = {
  name: string;
  analysisCount: number;
};

type FolderTabsProps = {
  folders: FolderItem[];
  activeFolder: string;
  onSelect: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
  onCreate: () => void;
};

export function FolderTabs({
  folders,
  activeFolder,
  onSelect,
  onRename,
  onDelete,
  onCreate
}: FolderTabsProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 px-1 pb-px">
      {folders.map((folder) => {
        const isActive = folder.name.toLowerCase() === activeFolder.toLowerCase();
        return (
          <button
            key={folder.name}
            type="button"
            onClick={() => onSelect(folder.name)}
            className={`group relative flex flex-shrink-0 items-center gap-2 px-4 py-3 text-xs font-medium transition-colors ${
              isActive
                ? "text-quantis-gold"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            <Folder className={`h-3.5 w-3.5 ${isActive ? "text-quantis-gold" : "text-white/30"}`} />
            <span>{folder.name}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              isActive ? "bg-quantis-gold/15 text-quantis-gold" : "bg-white/5 text-white/30"
            }`}>
              {folder.analysisCount}
            </span>

            <span className="ml-0.5 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onRename(folder.name); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onRename(folder.name); } }}
                className="rounded p-1 text-white/30 hover:bg-white/10 hover:text-white/70"
                title="Renommer"
              >
                <Pencil className="h-2.5 w-2.5" />
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onDelete(folder.name); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onDelete(folder.name); } }}
                className="rounded p-1 text-white/30 hover:bg-rose-500/10 hover:text-rose-400"
                title="Supprimer"
              >
                <Trash2 className="h-2.5 w-2.5" />
              </span>
            </span>

            {isActive ? (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-quantis-gold" />
            ) : null}
          </button>
        );
      })}

      <button
        type="button"
        onClick={onCreate}
        className="flex flex-shrink-0 items-center gap-1.5 px-3 py-3 text-xs text-white/35 transition-colors hover:text-white/60"
      >
        <Plus className="h-3.5 w-3.5" />
        Nouveau dossier
      </button>
    </div>
  );
}
