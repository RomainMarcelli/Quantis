// File: app/settings/page.tsx
// Role: route serveur App Router qui affiche la page de parametres applicatifs.
import { SettingsView } from "@/components/settings/SettingsView";

export default function SettingsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8">
      <SettingsView />
    </main>
  );
}
