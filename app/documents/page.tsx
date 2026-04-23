import { AuthGate } from "@/components/auth/AuthGate";
import { DocumentsView } from "@/components/documents/DocumentsView";

export default function DocumentsPage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full overflow-hidden px-3 py-8 md:px-4 lg:px-6">
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />
      <AuthGate>
        <DocumentsView />
      </AuthGate>
    </main>
  );
}
