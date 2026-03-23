// app/403/page.tsx
// Page d'accès interdit (403) affichable explicitement par navigation ou redirection.
import { ErrorStatusPage } from "@/components/ui/ErrorStatusPage";

export default function ForbiddenPage() {
  return (
    <ErrorStatusPage
      statusCode={403}
      title="Accès interdit"
      description="Vous n'avez pas les droits nécessaires pour accéder à cette ressource."
      primaryCtaLabel="Retour à l’accueil"
      primaryCtaHref="/"
    />
  );
}
