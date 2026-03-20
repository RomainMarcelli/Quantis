// app/500/page.tsx
// Page erreur serveur générique (500) pour indisponibilités temporaires.
import { ErrorStatusPage } from "@/components/ui/ErrorStatusPage";

export default function InternalErrorPage() {
  return (
    <ErrorStatusPage
      statusCode={500}
      title="Erreur serveur"
      description="Une erreur interne est survenue. Réessayez dans quelques instants."
      primaryCtaLabel="Retour au dashboard"
      primaryCtaHref="/dashboard"
    />
  );
}
