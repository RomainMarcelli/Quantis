// app/501/page.tsx
// Page "Not Implemented" (501) pour les fonctionnalités en préparation côté produit.
import { ErrorStatusPage } from "@/components/ui/ErrorStatusPage";

export default function NotImplementedPage() {
  return (
    <ErrorStatusPage
      statusCode={501}
      title="Fonctionnalité non implémentée"
      description="Cette action est prévue mais n'est pas encore disponible dans cette version de Vyzor."
      primaryCtaLabel="Retour à l’accueil"
      primaryCtaHref="/"
    />
  );
}
