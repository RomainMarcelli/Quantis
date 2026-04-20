// app/401/page.tsx
// Page non autorisé (401) pour les cas de session absente/expirée.
import { ErrorStatusPage } from "@/components/ui/ErrorStatusPage";

export default function UnauthorizedPage() {
  return (
    <ErrorStatusPage
      statusCode={401}
      title="Non autorisé"
      description="Votre session n’est pas valide ou a expiré. Merci de vous reconnecter."
      primaryCtaLabel="Retour à la connexion"
      primaryCtaHref="/"
    />
  );
}
