import { AuthGate } from "@/components/auth/AuthGate";
import { DocumentsView } from "@/components/documents/DocumentsView";

export default function DocumentsPage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full px-3 py-8 md:px-4 lg:px-6">
      <AuthGate>
        <DocumentsView />
      </AuthGate>
    </main>
  );
}