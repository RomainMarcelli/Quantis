// app/not-found.tsx
// Page 404 globale App Router (route introuvable) avec DA premium.
import { ErrorStatusPage } from "@/components/ui/ErrorStatusPage";

export default function NotFound() {
  return (
    <ErrorStatusPage
      statusCode={404}
      title="Page introuvable"
      description="La ressource demandée n’existe pas ou a été déplacée. Vérifiez l’URL puis réessayez."
      primaryCtaLabel="Retour au dashboard"
      primaryCtaHref="/dashboard"
    />
  );
}
