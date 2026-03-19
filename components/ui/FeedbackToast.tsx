"use client";

type FeedbackToastProps = {
  type: "success" | "error" | "info";
  message: string;
};

export function FeedbackToast({ type, message }: FeedbackToastProps) {
  const styles =
    type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : type === "error"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-slate-200 bg-white text-slate-800";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed right-4 top-4 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg ${styles}`}
    >
      {message}
    </div>
  );
}

