// File: app/mentions-legales/page.tsx
// Role: page Mentions légales — accessible publiquement, contenu placeholder
// à finaliser par l'équipe juridique. La structure (édition, hébergeur,
// directeur de publication, propriété intellectuelle, contact) est posée.
import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Mentions légales · Vyzor",
  description: "Mentions légales obligatoires de la plateforme Vyzor.",
};

export default function MentionsLegalesPage() {
  return (
    <LegalPageShell title="Mentions légales" lastUpdated="03/05/2026">
      <p>
        Conformément aux dispositions des articles 6-III et 19 de la loi
        n°2004-575 du 21 juin 2004 pour la confiance dans l&apos;économie
        numérique, dite L.C.E.N., il est porté à la connaissance des
        utilisateurs du site les présentes mentions légales.
      </p>

      <h2>Éditeur du site</h2>
      <p>
        <strong>Vyzor</strong>
        <br />
        [Forme juridique] au capital de [montant] €
        <br />
        Siège social : [Adresse]
        <br />
        SIREN : [Numéro]
        <br />
        Email : <a href="mailto:contact@vyzor.fr">contact@vyzor.fr</a>
      </p>

      <h2>Directeur de la publication</h2>
      <p>[Nom et prénom du directeur de la publication]</p>

      <h2>Hébergeur</h2>
      <p>
        Le site est hébergé par <strong>[Nom de l&apos;hébergeur]</strong>,
        dont le siège social est situé [Adresse de l&apos;hébergeur]. Les
        données sont stockées en France.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        L&apos;ensemble des éléments accessibles sur le site (textes,
        graphismes, logos, marques, logiciels, code source) sont la propriété
        exclusive de Vyzor ou de ses partenaires. Toute reproduction,
        représentation, modification ou exploitation, totale ou partielle,
        sans autorisation écrite préalable, est strictement interdite.
      </p>

      <h2>Responsabilité</h2>
      <p>
        Les informations diffusées sur le site sont fournies à titre indicatif
        et n&apos;engagent pas la responsabilité de Vyzor. L&apos;utilisateur
        reconnaît être seul responsable de l&apos;usage qu&apos;il fait des
        analyses, scores et recommandations produits par la plateforme.
      </p>

      <h2>Contact</h2>
      <p>
        Pour toute question relative aux présentes mentions légales, vous
        pouvez nous écrire à{" "}
        <a href="mailto:contact@vyzor.fr">contact@vyzor.fr</a>.
      </p>
    </LegalPageShell>
  );
}
