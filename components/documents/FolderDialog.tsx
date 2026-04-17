"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type FolderDialogProps = {
  isOpen: boolean;
  mode: "create" | "rename";
  initialName?: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
};

export function FolderDialog({ isOpen, mode, initialName = "", onSubmit, onClose }: FolderDialogProps) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialName]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const title = mode === "create" ? "Nouveau dossier" : "Renommer le dossier";
  const cta = mode === "create" ? "Créer" : "Renommer";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111218] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-white/50 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onSubmit(name.trim());
          }}
          placeholder="Nom du dossier"
          className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/35 outline-none focus:border-quantis-gold/50"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70 hover:bg-white/10"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => onSubmit(name.trim())}
            className="btn-gold-premium rounded-xl px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cta}
          </button>
        </div>
      </div>
    </div>
  );
}
