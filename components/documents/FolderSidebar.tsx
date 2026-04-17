"use client";

import { Folder, Pencil, Plus, Trash2 } from "lucide-react";

type FolderItem = {
  name: string;
  analysisCount: number;
};

type FolderSidebarProps = {
  folders: FolderItem[];
  activeFolder: string;
  onSelect: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
  onCreate: () => void;
};

export function FolderSidebar({
  folders,
  activeFolder,
  onSelect,
  onRename,
  onDelete,
  onCreate
}: FolderSidebarProps) {
  return (
    <aside className="flex w-[280px] flex-shrink-0 flex-col rounded-2xl border border-white/10 bg-white/[0.03] lg:sticky lg:top-4 lg:h-fit">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Dossiers</p>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {folders.map((folder) => {
          const isActive = folder.name.toLowerCase() === activeFolder.toLowerCase();
          return (
            <button
              key={folder.name}
              type="button"
              onClick={() => onSelect(folder.name)}
              className={`group flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all duration-200 ${
                isActive
                  ? "border border-amber-400/20 bg-amber-500/10 text-amber-300"
                  : "border border-transparent text-white/60 hover:bg-white/5 hover:text-white/85"
              }`}
            >
              <Folder className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-amber-400" : "text-white/30"}`} />
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{folder.name}</span>
              <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                isActive ? "bg-amber-400/15 text-amber-300" : "bg-white/5 text-white/30"
              }`}>
                {folder.analysisCount}
              </span>

              <span className="ml-1 flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onRename(folder.name); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onRename(folder.name); } }}
                  className="rounded p-1 text-white/35 hover:bg-white/10 hover:text-white/70"
                  title="Renommer"
                >
                  <Pencil className="h-3 w-3" />
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onDelete(folder.name); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onDelete(folder.name); } }}
                  className="rounded p-1 text-white/35 hover:bg-rose-500/10 hover:text-rose-400"
                  title="Supprimer"
                >
                  <Trash2 className="h-3 w-3" />
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-2">
        <button
          type="button"
          onClick={onCreate}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium text-white/45 transition-colors hover:bg-white/5 hover:text-white/70"
        >
          <Plus className="h-3.5 w-3.5" />
          Nouveau dossier
        </button>
      </div>
    </aside>
  );
}
