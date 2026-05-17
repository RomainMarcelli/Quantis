// File: app/page.tsx
// Role: point d'entrée — redirige selon l'état auth + accountType.
//
// feature/cabinet-ux : le visiteur non authentifié arrive sur /onboarding
// (picker pré-auth company_owner vs firm_member). L'user authentifié est
// envoyé directement vers son dashboard selon son accountType.
//
// Composant client minimal (pas de SSR) — toute la logique de routage est
// gardée dans EntryRedirect pour éviter les flashs et permettre la
// résolution accountType depuis Firestore.
import { EntryRedirect } from "@/components/auth/EntryRedirect";

type HomePageProps = {
  searchParams?: Promise<{
    next?: string | string[];
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = (await searchParams) ?? {};
  const rawNext = Array.isArray(params.next) ? params.next[0] ?? "" : params.next ?? "";
  const nextRedirect = rawNext.startsWith("/") ? rawNext : null;

  return <EntryRedirect nextRedirect={nextRedirect} />;
}
