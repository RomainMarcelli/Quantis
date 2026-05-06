// File: components/ai/AiSpinner.tsx
// Role: spinner « onde pulsante » or — 3 cercles concentriques aux opacités
// dégradées (0.6 / 0.4 / 0.2) qui pulsent en stagger 300 ms (scale 0.8 → 1.2).
// Affiché dans la zone de message pendant que l'IA réfléchit.
//
// Ancien nom : AiHeartbeatSpinner (conservé en re-export pour les call-sites
// qui n'auraient pas migré). À supprimer dans une itération ultérieure.
"use client";

const CIRCLES = [
  { inset: 0, opacity: 0.6, delay: "0ms" },
  { inset: 8, opacity: 0.4, delay: "300ms" },
  { inset: 16, opacity: 0.2, delay: "600ms" },
];

export function AiSpinner({ label = "Analyse en cours" }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-8"
      role="status"
      aria-live="polite"
      aria-label={`${label}…`}
    >
      <div className="relative h-16 w-16">
        {CIRCLES.map((c, i) => (
          <span
            key={i}
            aria-hidden
            className="vyzor-heart-circle absolute rounded-full"
            style={{
              top: c.inset,
              right: c.inset,
              bottom: c.inset,
              left: c.inset,
              backgroundColor: `rgba(197, 160, 89, ${c.opacity})`,
              animationDelay: c.delay,
            }}
          />
        ))}
      </div>
      <p
        className="mt-4 text-xs italic"
        style={{ color: "rgba(255, 255, 255, 0.4)" }}
      >
        {label}
        <span className="vyzor-typing-dot" style={{ animationDelay: "0ms" }}>.</span>
        <span className="vyzor-typing-dot" style={{ animationDelay: "200ms" }}>.</span>
        <span className="vyzor-typing-dot" style={{ animationDelay: "400ms" }}>.</span>
      </p>
    </div>
  );
}

/** Alias rétro-compatible — pour les imports qui n'ont pas encore migré. */
export const AiHeartbeatSpinner = AiSpinner;
