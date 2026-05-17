// app/invite/[token]/page.tsx
// Landing page pour un dirigeant invité par son cabinet.
// Charge l'invitation depuis Firestore (client), affiche le nom de
// l'entreprise, puis bascule sur /register après stockage du token en
// localStorage. Après signup, AuthPage POST /api/invite/accept.
import { InviteAcceptView } from "@/components/auth/InviteAcceptView";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;
  return (
    <main className="premium-analysis-root relative min-h-screen w-full px-4 py-12 md:py-16">
      <InviteAcceptView token={token} />
    </main>
  );
}
