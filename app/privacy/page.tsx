// File: app/privacy/page.tsx
// Role: politique de confidentialité — structure RGPD (responsable de
// traitement, données collectées, finalités, base légale, durée de
// conservation, destinataires, droits). Contenu à finaliser par
// l'équipe juridique avec le DPO.
import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Politique de confidentialité · Vyzor",
  description: "Politique de protection des données personnelles de Vyzor.",
};

export default function PrivacyPage() {
  return (
    <LegalPageShell
      title="Politique de confidentialité"
      lastUpdated="03/05/2026"
    >
      <p>
        Vyzor accorde une importance particulière à la protection de vos
        données personnelles. La présente politique a pour objet de vous
        informer, en application du Règlement (UE) 2016/679 (« RGPD ») et
        de la loi Informatique et Libertés modifiée, des conditions dans
        lesquelles vos données sont collectées et traitées.
      </p>

      <h2>1. Responsable du traitement</h2>
      <p>
        Le responsable du traitement est <strong>Vyzor</strong>, dont le
        siège social est situé [Adresse]. Pour toute question relative à
        vos données, vous pouvez contacter notre délégué à la protection
        des données à l&apos;adresse{" "}
        <a href="mailto:dpo@vyzor.fr">dpo@vyzor.fr</a>.
      </p>

      <h2>2. Données collectées</h2>
      <ul>
        <li>
          <strong>Données d&apos;identification</strong> : nom, prénom,
          adresse email, mot de passe (haché).
        </li>
        <li>
          <strong>Données entreprise</strong> : raison sociale, SIREN,
          taille, secteur, objectifs d&apos;usage.
        </li>
        <li>
          <strong>Données comptables et bancaires</strong> : importées via
          les connecteurs activés par l&apos;utilisateur (logiciel comptable,
          agrégateur bancaire).
        </li>
        <li>
          <strong>Données techniques</strong> : adresse IP, logs de
          connexion, identifiant de session.
        </li>
      </ul>

      <h2>3. Finalités</h2>
      <p>Vos données sont traitées aux fins suivantes :</p>
      <ul>
        <li>Création et gestion de votre compte utilisateur.</li>
        <li>Calcul des indicateurs financiers et du Quantis Score.</li>
        <li>
          Génération des analyses produites par l&apos;assistant IA, sur la
          base des données que vous nous confiez.
        </li>
        <li>
          Sécurité du Service (détection de fraudes, journalisation des
          accès).
        </li>
        <li>
          Communication avec vous (notifications produit, support, emails
          transactionnels).
        </li>
      </ul>

      <h2>4. Base légale</h2>
      <p>
        Les traitements reposent sur l&apos;exécution du contrat (CGU) que
        vous concluez avec Vyzor, sur votre consentement explicite pour les
        connecteurs tiers, et sur l&apos;intérêt légitime de Vyzor pour la
        sécurité et l&apos;amélioration du Service.
      </p>

      <h2>5. Durée de conservation</h2>
      <p>
        Vos données sont conservées pendant toute la durée de votre relation
        contractuelle avec Vyzor, puis archivées en base intermédiaire pour
        une durée maximale de 5 ans à des fins probatoires, sauf obligation
        légale de conservation plus longue.
      </p>

      <h2>6. Destinataires</h2>
      <p>
        Vos données sont accessibles uniquement aux équipes habilitées de
        Vyzor et à ses sous-traitants techniques (hébergeur, prestataires
        d&apos;agrégation comptable et bancaire), sous engagement contractuel
        de confidentialité. Aucun transfert hors de l&apos;Union Européenne
        n&apos;est réalisé sans garanties appropriées.
      </p>

      <h2>7. Sécurité</h2>
      <p>
        Vos données sont chiffrées au repos (AES-256) et en transit (TLS
        1.3). L&apos;hébergement est réalisé en France et les accès sont
        journalisés.
      </p>

      <h2>8. Vos droits</h2>
      <p>
        Conformément au RGPD, vous disposez des droits suivants :
      </p>
      <ul>
        <li>Droit d&apos;accès à vos données.</li>
        <li>Droit de rectification et d&apos;effacement.</li>
        <li>Droit à la portabilité.</li>
        <li>Droit d&apos;opposition et de limitation du traitement.</li>
        <li>
          Droit de définir des directives sur le sort de vos données après
          votre décès.
        </li>
      </ul>
      <p>
        Pour exercer ces droits, écrivez-nous à{" "}
        <a href="mailto:dpo@vyzor.fr">dpo@vyzor.fr</a>. Vous disposez également
        du droit d&apos;introduire une réclamation auprès de la CNIL
        (www.cnil.fr).
      </p>

      <h2>9. Cookies</h2>
      <p>
        Vyzor utilise uniquement les cookies strictement nécessaires au
        fonctionnement du Service (session, préférences d&apos;affichage).
        Aucun cookie publicitaire ou de mesure tierce n&apos;est déposé.
      </p>
    </LegalPageShell>
  );
}
