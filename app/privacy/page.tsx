// File: app/privacy/page.tsx
// Role: politique de confidentialité de Vyzor — version finalisée
// (Loi Informatique et Libertés + RGPD). Hébergeur Firebase / Vercel,
// LLM (Anthropic, OpenAI) en mode Zero Data Retention, sous-traitants
// listés (Qonto, etc.). À mettre à jour si la stack ou les sous-traitants
// évoluent.
import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Politique de confidentialité · Vyzor",
  description:
    "Politique de confidentialité et de traitement des données de Vyzor (RGPD).",
};

export default function PrivacyPage() {
  return (
    <LegalPageShell
      title="Politique de confidentialité et de traitement des données"
      lastUpdated="03/05/2026"
    >
      <h2>Article 1 – Préambule et champ d&apos;application</h2>
      <p>
        La société <strong>VYZOR</strong> (en cours de formation) accorde une
        importance majeure à la confidentialité et à la sécurité des données à
        caractère personnel et des données financières traitées via sa
        plateforme. La présente politique s&apos;inscrit dans le strict respect
        de la <strong>Loi Informatique et Libertés du 6 janvier 1978 modifiée</strong>{" "}
        et du <strong>Règlement (UE) 2016/679 (RGPD)</strong>.
      </p>

      <h2>Article 2 – Le responsable du traitement</h2>
      <p>
        Le responsable du traitement des données collectées via le Site est la
        société <strong>VYZOR</strong>, Société par Actions Simplifiée en cours
        de formation, dont le siège social est situé au{" "}
        <strong>2 rue Huguette Schwartz, 75014 Paris</strong>.
      </p>
      <p>
        Pour toute question relative à la gestion de vos données, vous pouvez
        nous contacter à l&apos;adresse suivante :{" "}
        <a href="mailto:admin@vyzor.fr">admin@vyzor.fr</a>.
      </p>

      <h2>Article 3 – Nature des données collectées</h2>
      <p>
        Dans le cadre de l&apos;exploitation de la plateforme, VYZOR est amenée
        à collecter :
      </p>
      <ul>
        <li>
          <strong>Données d&apos;identification</strong> : nom, prénom, adresse
          email professionnelle, numéro de téléphone.
        </li>
        <li>
          <strong>Données professionnelles</strong> : nom du cabinet
          d&apos;expertise comptable, fonction, nombre de collaborateurs,
          logiciel de production comptable utilisé.
        </li>
        <li>
          <strong>Données financières et d&apos;exploitation</strong> : Fichiers
          d&apos;Écritures Comptables (FEC), données de facturation et
          indicateurs de performance (KPIs) des clients de l&apos;Utilisateur.
        </li>
        <li>
          <strong>Données de navigation</strong> : adresse IP, type de
          navigateur, pages visitées, durée de session (collectées via cookies
          analytiques, cf. Article 9).
        </li>
      </ul>

      <h2>Article 4 – Finalités et bases légales</h2>
      <p>
        Les traitements mis en œuvre répondent aux finalités suivantes :
      </p>
      <ul>
        <li>
          <strong>Exécution du contrat</strong> (ou mesures précontractuelles) :
          création du compte utilisateur, accès à l&apos;application, génération
          des tableaux de bord automatisés, support technique.
        </li>
        <li>
          <strong>Intérêt légitime</strong> : amélioration de l&apos;interface
          utilisateur, correction de bugs (debugging), statistiques d&apos;audience
          du Site.
        </li>
        <li>
          <strong>Consentement</strong> : envoi de newsletters, communications
          marketing, dépôt de cookies non essentiels. L&apos;Utilisateur peut
          retirer son consentement à tout moment sans que cela n&apos;affecte la
          licéité du traitement fondé sur le consentement donné avant le retrait
          de celui-ci.
        </li>
      </ul>

      <h2>Article 5 – Sécurité et protection des modèles d&apos;IA</h2>
      <p>
        VYZOR met en œuvre toutes les mesures techniques et organisationnelles
        appropriées pour garantir un niveau de sécurité adapté au risque.
      </p>
      <p>
        <strong>Clause stricte relative à l&apos;Intelligence Artificielle</strong> :
        VYZOR s&apos;engage formellement. Aucune donnée financière (FEC, bilans,
        liasses) importée par l&apos;Utilisateur n&apos;est, ni ne sera, utilisée
        pour entraîner des modèles de langages (LLM) publics ou des
        intelligences artificielles partagées avec des tiers. Les environnements
        de calcul sont isolés.
      </p>
      <p>
        <strong>Zero Data Retention (ZDR)</strong> : les appels API vers les
        fournisseurs de modèles de langage sont effectués avec les options de
        non-rétention des données (Zero Data Retention) lorsque celles-ci sont
        disponibles. Cela signifie que les fournisseurs de LLM ne conservent pas
        les données transmises par VYZOR après le traitement de chaque requête.
      </p>

      <h2>Article 6 – Sous-traitants et transfert de données</h2>
      <p>
        Dans le cadre de l&apos;exploitation de la plateforme, VYZOR fait appel
        aux sous-traitants suivants :
      </p>
      <ul>
        <li>
          <strong>Hébergement de l&apos;application et des données financières</strong> :
          Google Firebase (Google Cloud Platform), avec une configuration ciblant
          les régions de l&apos;Union Européenne.
        </li>
        <li>
          <strong>Hébergement du site vitrine</strong> : Vercel, Inc. (serveurs
          pouvant être situés hors UE, transferts encadrés par les clauses
          contractuelles types). Le site vitrine ne collecte pas de données
          financières.
        </li>
        <li>
          <strong>Fournisseurs de modèles de langage (LLM)</strong> : Anthropic
          (API Claude) et/ou OpenAI (API GPT), utilisés exclusivement en inférence
          (pas d&apos;entraînement). Les données sont transmises via API sécurisée
          avec option Zero Data Retention activée.
        </li>
        <li>
          <strong>Services bancaires</strong> : Qonto (gestion du compte
          professionnel de la société).
        </li>
      </ul>
      <p>
        Tous les sous-traitants de VYZOR sont soumis à des obligations de
        confidentialité et de sécurité au moins aussi strictes que celles de la
        présente politique. En cas de transfert de données hors de l&apos;Union
        Européenne, VYZOR s&apos;assure que des garanties appropriées sont mises
        en place (clauses contractuelles types de la Commission européenne, ou
        décision d&apos;adéquation).
      </p>

      <h2>Article 7 – Durée de conservation</h2>
      <ul>
        <li>
          <strong>Données prospects</strong> : 3 ans à compter du dernier contact
          émanant du prospect.
        </li>
        <li>
          <strong>Données clients (comptes actifs)</strong> : pendant toute la
          durée de la relation contractuelle, puis archivées pour une durée de
          5 ans (prescription légale).
        </li>
        <li>
          <strong>Données financières (FEC)</strong> : conservées uniquement le
          temps nécessaire à la génération du tableau de bord ou supprimées
          immédiatement sur demande.
        </li>
        <li>
          <strong>Cookies</strong> : durée maximale de 13 mois conformément aux
          recommandations de la CNIL.
        </li>
      </ul>

      <h2>Article 8 – Droits des personnes concernées</h2>
      <p>
        Vous disposez d&apos;un droit d&apos;accès, de rectification,
        d&apos;effacement (droit à l&apos;oubli), de limitation, de portabilité
        de vos données et du droit de vous opposer à leur traitement. Vous
        disposez également du droit de retirer votre consentement à tout moment
        pour les traitements fondés sur celui-ci.
      </p>
      <p>
        Pour exercer ces droits, adressez votre demande à :{" "}
        <a href="mailto:admin@vyzor.fr">admin@vyzor.fr</a>. Nous nous engageons à
        répondre dans un délai d&apos;un (1) mois à compter de la réception de
        la demande.
      </p>
      <p>
        En cas de litige, vous pouvez introduire une réclamation auprès de la
        CNIL (
        <a href="https://www.cnil.fr" target="_blank" rel="noreferrer">
          www.cnil.fr
        </a>
        ).
      </p>

      <h2>Article 9 – Cookies et traceurs</h2>
      <p>
        Le Site utilise des cookies, c&apos;est-à-dire de petits fichiers texte
        déposés sur votre terminal lors de la consultation du Site. Les cookies
        utilisés se répartissent en deux catégories :
      </p>
      <ul>
        <li>
          <strong>Cookies strictement nécessaires</strong> : ils permettent la
          navigation sur le Site et l&apos;utilisation de ses fonctionnalités
          essentielles (authentification, sécurité, préférences de session). Ces
          cookies ne nécessitent pas votre consentement.
        </li>
        <li>
          <strong>Cookies analytiques</strong> : ils permettent de mesurer
          l&apos;audience du Site, de comprendre comment les Utilisateurs
          interagissent avec la plateforme et d&apos;améliorer l&apos;expérience
          utilisateur. Ces cookies sont soumis à votre consentement préalable.
        </li>
      </ul>
      <p>
        Vous pouvez à tout moment gérer vos préférences en matière de cookies
        via le bandeau de gestion des cookies affiché lors de votre première
        visite, ou en modifiant les paramètres de votre navigateur. Le refus des
        cookies analytiques n&apos;a aucune incidence sur votre accès au Site et
        à ses fonctionnalités.
      </p>
      <p>
        <strong>Durée maximale des cookies</strong> : 13 mois conformément aux
        recommandations de la CNIL. Les informations collectées via les cookies
        sont conservées pour une durée maximale de 25 mois.
      </p>

      <h2>Article 10 – Mise à jour de la politique</h2>
      <p>
        VYZOR se réserve le droit de modifier la présente politique de
        confidentialité à tout moment. En cas de modification substantielle, les
        Utilisateurs seront informés par email ou par notification sur la
        plateforme. La date de dernière mise à jour est indiquée en tête du
        présent document.
      </p>
    </LegalPageShell>
  );
}
