// File: components/dashboard/navigation/TestTopStatus.tsx
// Role: affiche un bandeau de contexte simple et propre pour les vues de test (sans superposition absolue).
"use client";

type TestTopStatusProps = {
  label: string;
};

export function TestTopStatus({ label }: TestTopStatusProps) {
  return (
    <div className="inline-flex items-center gap-3 rounded-md border border-white/15 bg-black/35 px-3 py-1.5">
      <div className="flex items-center gap-2 border-r border-white/10 pr-3">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-quantis-gold shadow-[0_0_6px_rgba(197,160,89,0.45)]" />
        <span className="text-[10px] font-mono uppercase text-white/60">SYS.OVR</span>
      </div>
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/80">{label}</span>
    </div>
  );
}
