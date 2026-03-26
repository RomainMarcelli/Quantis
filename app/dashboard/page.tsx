// app/dashboard/page.tsx
// Route legacy conservée pour compatibilité: redirection vers la vue principale de synthèse.
import { redirect } from "next/navigation";

export default function DashboardPage() {
  redirect("/synthese");
}
