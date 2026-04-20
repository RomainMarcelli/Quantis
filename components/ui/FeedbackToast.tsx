// File: components/ui/FeedbackToast.tsx
// Role: notification temporaire reutilisable avec style premium sombre coherent avec la DA globale.
"use client";

import { useTheme } from "@/hooks/useTheme";

type FeedbackToastProps = {
  type: "success" | "error" | "info";
  message: string;
};

export function FeedbackToast({ type, message }: FeedbackToastProps) {
  const { isDark } = useTheme();

  const styles =
    type === "success"
      ? isDark
        ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"
        : "border-emerald-700/45 bg-emerald-100 text-emerald-900"
      : type === "error"
        ? isDark
          ? "border-rose-400/35 bg-rose-500/15 text-rose-100"
          : "border-rose-700/50 bg-rose-100 text-rose-900"
        : isDark
          ? "border-white/15 bg-white/10 text-white/90"
          : "border-slate-500/35 bg-slate-100 text-slate-900";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed right-4 top-4 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm ${styles}`}
    >
      {message}
    </div>
  );
}
