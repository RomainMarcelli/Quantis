// File: app/account/page.tsx
// Role: route serveur App Router qui charge la vue compte avec contexte de provenance (analysis/dashboard).
import { AccountView } from "@/components/account/AccountView";

type AccountPageProps = {
  searchParams?: Promise<{ from?: string }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const params = (await searchParams) ?? {};
  const fromAnalysis = params.from === "analysis";

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8">
      <AccountView fromAnalysis={fromAnalysis} />
    </main>
  );
}
