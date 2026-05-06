// File: app/cgu/page.tsx
// Role: page unifiée Mentions légales + CGU de Vyzor (lien unique).
// Pré-formation SAS Vyzor, hébergement Vercel + serveurs UE séparés
// pour les données financières.
import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Mentions légales et CGU · Vyzor",
  description:
    "Mentions légales et conditions générales d'utilisation de la plateforme Vyzor.",
};

export default function CguPage() {
  return (
    <LegalPageShell
      title="Mentions légales et conditions générales d'utilisation"
      lastUpdated="03/05/2026"
    >
      <h2>Article 1 – Mentions légales</h2>

      <h3>1.1. Éditeur du Site</h3>
      <p>
        Le présent site web, accessible à l&apos;URL{" "}
        <a href="https://www.vyzor.fr" target="_blank" rel="noreferrer">
          www.vyzor.fr
        </a>
        , est édité par <strong>Antoine CAYER</strong>, agissant pour le compte
        de la société <strong>VYZOR</strong>, Société par Actions Simplifiée
        (SAS) en cours de formation.
      </p>
      <p>
        Adresse de domiciliation :{" "}
        <strong>2 rue Huguette Schwartz, 75014 Paris</strong>.
      </p>
      <p>
        Directeur de la publication : <strong>Antoine CAYER</strong>.
      </p>
      <p>
        Contact : <a href="mailto:admin@vyzor.fr">admin@vyzor.fr</a>
      </p>

      <h3>1.2. Hébergement</h3>
      <p>
        Le Site est hébergé par la société <strong>Vercel, Inc.</strong>, dont
        le siège social est situé au 340 S Lemon Ave #4133, Walnut, California
        91789, États-Unis. Les données applicatives et financières sont
        hébergées séparément sur des serveurs situés au sein de l&apos;Union
        Européenne.
      </p>

      <h2>Article 2 – Objet des CGU</h2>
      <p>
        Les présentes Conditions Générales d&apos;Utilisation ont pour objet
        d&apos;encadrer l&apos;accès et l&apos;utilisation du Site et des
        services VYZOR par tout internaute (ci-après l&apos;«&nbsp;Utilisateur&nbsp;»).
        La navigation sur le Site emporte acceptation sans réserve des présentes
        CGU.
      </p>

      <h2>Article 3 – Accès au Site et aux services</h2>
      <p>
        L&apos;Éditeur s&apos;efforce de permettre l&apos;accès au Site 24
        heures sur 24, 7 jours sur 7, sauf en cas de force majeure ou d&apos;un
        événement hors du contrôle de l&apos;Éditeur, et sous réserve des
        éventuelles pannes et interventions de maintenance nécessaires au bon
        fonctionnement du Site et des services. La responsabilité de
        l&apos;Éditeur ne saurait être engagée en cas d&apos;impossibilité
        d&apos;accès à ce Site et/ou d&apos;utilisation des services.
      </p>

      <h2>Article 4 – Propriété intellectuelle</h2>
      <p>
        La structure générale du Site, ainsi que les textes, graphiques, images,
        sons, algorithmes, bases de données et vidéos la composant, sont la
        propriété de l&apos;Éditeur ou de ses partenaires. Toute représentation,
        reproduction, exploitation partielle ou totale des contenus et services
        proposés par le Site, par quelque procédé que ce soit, sans
        l&apos;autorisation préalable et par écrit de l&apos;Éditeur, est
        strictement interdite et serait susceptible de constituer une
        contrefaçon au sens des articles L.335-2 et suivants du Code de la
        propriété intellectuelle.
      </p>

      <h2>Article 5 – Limitation de responsabilité</h2>
      <p>
        Les informations contenues sur ce Site sont aussi précises que possible
        et le Site est périodiquement remis à jour. Toutefois, il peut contenir
        des inexactitudes, des omissions ou des lacunes. Les services de VYZOR
        (notamment en phase de Bêta) constituent des outils d&apos;aide à la
        décision. L&apos;Utilisateur, particulièrement s&apos;il agit en tant
        que professionnel du chiffre, conserve l&apos;entière responsabilité de
        l&apos;exploitation des données et des conseils financiers prodigués à
        ses propres clients.
      </p>

      <h2>Article 6 – Droit applicable et juridiction compétente</h2>
      <p>
        Les présentes CGU sont régies par la loi française. En cas de litige
        n&apos;ayant pu faire l&apos;objet d&apos;un accord à l&apos;amiable,
        les tribunaux du ressort de la Cour d&apos;Appel de Paris seront seuls
        compétents.
      </p>
    </LegalPageShell>
  );
}
