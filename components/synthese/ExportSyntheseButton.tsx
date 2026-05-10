// File: components/synthese/ExportSyntheseButton.tsx
// Role: bouton "Exporter la synthèse" du AppHeader (page /synthese) avec
// dropdown PDF / Word. Le dropdown est rendu via createPortal pour
// échapper à l'overflow:hidden de la card AppHeader (sinon il est coupé).
"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Download, FileText } from "lucide-react";

export type ExportFormat = "pdf" | "docx";

type Props = {
  onExport: (format: ExportFormat) => void | Promise<void>;
  disabled?: boolean;
  /** Libellé du bouton (défaut "Exporter la synthèse"). Utilisé pour
   *  réutiliser le composant sur les pages États financiers ("Exporter le
   *  bilan" / "Exporter le compte de résultat"). */
  label?: string;
};

export function ExportSyntheseButton({
  onExport, disabled = false, label = "Exporter la synthèse",
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 180;
    setPos({
      top: rect.bottom + 6,
      left: Math.max(8, rect.right - menuWidth),
      width: menuWidth,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handlePick(format: ExportFormat) {
    setOpen(false);
    setBusy(true);
    try {
      await onExport(format);
    } finally {
      setBusy(false);
    }
  }

  const menu =
    open && pos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[1000] overflow-hidden rounded-lg shadow-xl"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              backgroundColor: "var(--app-surface)",
              border: "1px solid var(--app-border-strong)",
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => void handlePick("pdf")}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition"
              style={{ color: "var(--app-text-primary)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--app-surface-soft)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <FileText className="h-3.5 w-3.5" style={{ color: "var(--app-brand-gold-deep)" }} />
              Format PDF
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void handlePick("docx")}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition"
              style={{
                color: "var(--app-text-primary)",
                borderTop: "1px solid var(--app-border)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--app-surface-soft)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <FileText className="h-3.5 w-3.5" style={{ color: "var(--app-brand-gold-deep)" }} />
              Format Word
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled || busy}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50"
        style={{
          border: "1px solid rgb(var(--app-brand-gold-deep-rgb) / 30%)",
          color: "var(--app-brand-gold-deep)",
          backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 10%)",
        }}
        onMouseEnter={(e) => {
          if (disabled || busy) return;
          e.currentTarget.style.backgroundColor =
            "rgb(var(--app-brand-gold-deep-rgb) / 18%)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor =
            "rgb(var(--app-brand-gold-deep-rgb) / 10%)";
        }}
      >
        <Download className="h-3.5 w-3.5" />
        {busy ? "Export en cours…" : label}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {menu}
    </>
  );
}
