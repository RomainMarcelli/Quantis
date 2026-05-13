// app/etats-financiers/page.tsx
// Brief 09/06/2026 : la page unifiée (bilan + CDR cumulés) est
// supprimée — l'utilisateur accède désormais à chaque document via
// le sous-menu sidebar. On redirige par défaut sur /bilan pour ne
// pas casser les liens externes / l'icône principale de sidebar.
import { redirect } from "next/navigation";

export default function EtatsFinanciersIndexPage() {
  redirect("/etats-financiers/bilan");
}
