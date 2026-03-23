// app/dashboard/page.tsx
// Route legacy conservée pour compatibilité: redirection vers la vue principale d'analyse.
import { redirect } from "next/navigation";

export default function DashboardPage() {
  redirect("/analysis");
}
