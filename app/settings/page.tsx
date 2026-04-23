// File: app/settings/page.tsx
// Role: route serveur App Router qui affiche la page de parametres applicatifs.
import { AuthGate } from "@/components/auth/AuthGate";
import { SettingsView } from "@/components/settings/SettingsView";

export default function SettingsPage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full overflow-hidden px-3 py-8 md:px-4 lg:px-6">
      <AuthGate>
        <SettingsView />
      </AuthGate>
    </main>
  );
}
