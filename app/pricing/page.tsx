// app/pricing/page.tsx
// Route serveur App Router de la page offres, avec shell visuel premium coherent avec /analysis.
import { PricingView } from "@/components/pricing/PricingView";

export default function PricingPage() {
  return (
    <main className="premium-analysis-root relative mx-auto min-h-screen w-full overflow-hidden px-4 py-8">
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />
      <PricingView />
    </main>
  );
}
