"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

type BreakEvenFullscreenModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  isDark: boolean;
  children: ReactNode;
};

export function BreakEvenFullscreenModal({
  isOpen,
  onClose,
  title,
  subtitle,
  isDark,
  children
}: BreakEvenFullscreenModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[170] flex bg-black/72 backdrop-blur-md" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fermer la vue plein écran"
        onClick={onClose}
      />

      <div className="relative z-[171] flex h-full w-full flex-col px-3 py-3 md:px-6 md:py-5">
        <div
          className={`relative flex h-full w-full flex-col overflow-hidden rounded-2xl border ${
            isDark
              ? "border-white/15 bg-[linear-gradient(180deg,rgba(13,13,18,0.96)_0%,rgba(8,8,12,0.98)_100%)]"
              : "border-slate-300 bg-[linear-gradient(180deg,rgba(255,255,255,0.99)_0%,rgba(248,250,252,0.99)_100%)]"
          }`}
        >
          <header
            className={`flex items-center justify-between border-b px-4 py-3 md:px-6 ${
              isDark ? "border-white/10" : "border-slate-200"
            }`}
          >
            <div className="min-w-0">
              <h3 className={`truncate text-sm font-semibold md:text-base ${isDark ? "text-white" : "text-slate-900"}`}>
                {title}
              </h3>
              <p className={`mt-0.5 truncate text-[11px] md:text-xs ${isDark ? "text-white/55" : "text-slate-500"}`}>
                {subtitle}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                isDark
                  ? "border-white/15 bg-white/5 text-white/80 hover:border-quantis-gold/45 hover:bg-quantis-gold/15 hover:text-quantis-gold"
                  : "border-slate-300 bg-white text-slate-700 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700"
              }`}
              aria-label="Fermer la vue plein écran"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 p-3 md:p-5">{children}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}
