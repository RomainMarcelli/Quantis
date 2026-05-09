// File: components/layout/NotificationsBell.tsx
// Role: bouton "cloche" dans le AppHeader avec dropdown placeholder pour
// les notifications utilisateur. Brief 09/06/2026 : l'icône est posée
// dans la barre d'utilitaires en haut à droite. Pour l'instant, le
// dropdown affiche un état vide ("Aucune notification") — on branchera
// une vraie source (Firestore) dans une itération ultérieure.
//
// Le dropdown est rendu via createPortal pour échapper au `overflow:hidden`
// de la card AppHeader.
"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell } from "lucide-react";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
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

  const menu =
    open && pos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Notifications"
            className="fixed z-[1000] overflow-hidden rounded-xl shadow-xl"
            style={{
              top: pos.top,
              right: pos.right,
              width: 320,
              maxHeight: 400,
              backgroundColor: "var(--app-surface)",
              border: "1px solid var(--app-border-strong)",
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{ borderBottom: "1px solid var(--app-border)" }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-[0.06em]"
                style={{ color: "var(--app-text-secondary)" }}
              >
                Notifications
              </p>
            </div>
            <div className="px-4 py-8 text-center">
              <p className="text-sm" style={{ color: "var(--app-text-tertiary)" }}>
                Aucune notification pour le moment.
              </p>
              <p
                className="mt-1 text-[11px]"
                style={{ color: "var(--app-text-tertiary)" }}
              >
                Vous serez prévenu ici dès qu'un événement nécessite votre attention.
              </p>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        title="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-xl p-2 transition"
        style={{
          border: "1px solid var(--app-border)",
          backgroundColor: "var(--app-surface-soft)",
          color: "var(--app-text-secondary)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--app-surface-medium)";
          e.currentTarget.style.color = "var(--app-text-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "var(--app-surface-soft)";
          e.currentTarget.style.color = "var(--app-text-secondary)";
        }}
      >
        <Bell className="h-4 w-4" />
      </button>
      {menu}
    </>
  );
}
