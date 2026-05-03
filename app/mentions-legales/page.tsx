// File: app/mentions-legales/page.tsx
// Role: redirige vers la page unifiée /cgu (mentions légales + CGU regroupées
// dans un seul document). Conservé pour ne pas casser d'éventuels liens
// externes pointant vers /mentions-legales.
import { redirect } from "next/navigation";

export default function MentionsLegalesPage() {
  redirect("/cgu");
}
