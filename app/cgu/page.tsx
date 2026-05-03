// File: app/cgu/page.tsx
// Role: page Conditions Générales d'Utilisation — placeholder structuré
// (objet, accès, comptes, données, propriété intellectuelle, responsabilité,
// résiliation, droit applicable). Contenu à finaliser par l'équipe juridique.
import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation · Vyzor",
  description: "Conditions générales d'utilisation de la plateforme Vyzor.",
};

export default function CguPage() {
  return (
    <LegalPageShell
      title="Conditions générales d'utilisation"
      lastUpdated="03/05/2026"
    >
      <p>
        Les présentes Conditions Générales d&apos;Utilisation (ci-après
        « CGU ») ont pour objet de définir les modalités et conditions
        d&apos;utilisation de la plateforme Vyzor (ci-après le « Service »).
      </p>

      <h2>1. Objet</h2>
      <p>
        Vyzor est une plateforme d&apos;intelligence financière permettant aux
        entreprises de connecter leurs flux comptables et bancaires, de
        consulter des indicateurs de performance et de bénéficier d&apos;un
        assistant IA d&apos;analyse.
      </p>

      <h2>2. Acceptation</h2>
      <p>
        L&apos;utilisation du Service implique l&apos;acceptation pleine et
        entière des présentes CGU. L&apos;utilisateur reconnaît en avoir pris
        connaissance et les accepte sans réserve lors de la création de son
        compte.
      </p>

      <h2>3. Création et gestion du compte</h2>
      <ul>
        <li>
          La création d&apos;un compte nécessite une adresse email valide et
          un mot de passe respectant les règles de complexité minimales.
        </li>
        <li>
          L&apos;utilisateur s&apos;engage à fournir des informations exactes
          (raison sociale, SIREN, secteur, etc.) et à les maintenir à jour.
        </li>
        <li>
          L&apos;utilisateur est seul responsable de la confidentialité de
          ses identifiants et de toute activité réalisée depuis son compte.
        </li>
      </ul>

      <h2>4. Données et synchronisations</h2>
      <p>
        L&apos;utilisateur autorise Vyzor à se connecter aux services tiers
        qu&apos;il sélectionne (logiciel comptable, agrégateur bancaire) afin
        d&apos;importer les données nécessaires aux analyses. Cette connexion
        peut être révoquée à tout moment depuis les paramètres du compte.
      </p>

      <h2>5. Propriété intellectuelle</h2>
      <p>
        Le Service, dans son intégralité, demeure la propriété exclusive de
        Vyzor. Aucune cession de droit n&apos;est consentie à
        l&apos;utilisateur en dehors d&apos;un droit personnel,
        non-exclusif et non-cessible d&apos;utilisation pour la durée de son
        abonnement.
      </p>

      <h2>6. Responsabilité</h2>
      <p>
        Les analyses, scores et recommandations produits par Vyzor sont
        fournis à titre informatif. Ils ne constituent pas un conseil
        financier, comptable, fiscal ou juridique au sens réglementaire.
        L&apos;utilisateur reste seul juge des décisions qu&apos;il prend
        sur la base de ces éléments.
      </p>

      <h2>7. Résiliation</h2>
      <p>
        L&apos;utilisateur peut résilier son compte à tout moment depuis ses
        paramètres. Vyzor se réserve le droit de suspendre ou résilier un
        compte en cas de manquement aux présentes CGU.
      </p>

      <h2>8. Modifications</h2>
      <p>
        Vyzor se réserve le droit de modifier les présentes CGU à tout
        moment. Les utilisateurs sont informés des modifications par email
        ou par notification dans l&apos;application.
      </p>

      <h2>9. Droit applicable</h2>
      <p>
        Les présentes CGU sont soumises au droit français. Tout litige relatif
        à leur exécution ou leur interprétation relève de la compétence
        exclusive des tribunaux compétents du ressort de [Ville].
      </p>
    </LegalPageShell>
  );
}
