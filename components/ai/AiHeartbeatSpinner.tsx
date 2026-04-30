// File: components/ai/AiHeartbeatSpinner.tsx
// Role: spinner « onde pulsante » or — 3 cercles concentriques qui pulsent
// en alternance pendant que l'IA réfléchit. Remplace le spinner classique
// (Loader2) du AiChatPanel pour un rendu plus futuriste / cockpit.
"use client";

export function AiHeartbeatSpinner({ label = "Vyzor analyse vos données" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8" role="status" aria-live="polite">
      <div className="relative h-16 w-16">
        {/* 3 cercles dorés concentriques pulsant en stagger 300 ms. */}
        <span
          aria-hidden
          className="vyzor-heart-circle absolute inset-0 rounded-full"
          style={{
            backgroundColor: "rgba(197, 160, 89, 0.2)",
            animationDelay: "0ms",
          }}
        />
        <span
          aria-hidden
          className="vyzor-heart-circle absolute inset-2 rounded-full"
          style={{
            backgroundColor: "rgba(197, 160, 89, 0.15)",
            animationDelay: "300ms",
          }}
        />
        <span
          aria-hidden
          className="vyzor-heart-circle absolute inset-4 rounded-full"
          style={{
            backgroundColor: "rgba(197, 160, 89, 0.1)",
            animationDelay: "600ms",
          }}
        />
      </div>
      <p className="mt-4 text-xs text-white/60">
        {label}
        <span className="vyzor-typing-dot" style={{ animationDelay: "0ms" }}>.</span>
        <span className="vyzor-typing-dot" style={{ animationDelay: "200ms" }}>.</span>
        <span className="vyzor-typing-dot" style={{ animationDelay: "400ms" }}>.</span>
      </p>
    </div>
  );
}
