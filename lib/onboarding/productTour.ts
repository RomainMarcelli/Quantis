import type { ProductTourAudience, ProductTourStep } from "@/types/onboarding";

export const AUTHENTICATED_TOUR_STEPS: ProductTourStep[] = [
  {
    id: "tour-welcome",
    title: "Bienvenue sur Quantis",
    description:
      "Ravi de vous compter parmi nous. Quantis est votre nouvel allié dans le pilotage de votre entreprise. Commençons par découvrir les fonctionnalités.",
    route: "/synthese",
    targetId: "body",
    preferredPlacement: "center"
  },
  {
    id: "tour-synthese-sidebar",
    title: "Naviguer dans Quantis",
    description:
      "Utilisez ce menu pour passer instantanément entre votre synthèse globale, vos analyses détaillées, vos documents et la gestion de votre compte.",
    route: "/synthese",
    targetId: "synthese-sidebar-nav",
    preferredPlacement: "right"
  },
  {
    id: "tour-synthese-kpis",
    title: "La synthèse de votre entreprise",
    description:
      "Gardez un œil sur vos indicateurs clés : Chiffre d'affaires, EBE et Trésorerie. L'essentiel de votre performance est réuni ici pour un pilotage réactif.",
    route: "/synthese",
    targetId: "synthese-kpi-container",
    preferredPlacement: "bottom"
  },
  {
    id: "tour-synthese-score",
    title: "Le Quantis Score",
    description:
      "Cet indicateur résume la santé financière globale de votre entreprise. Votre objectif : optimiser vos leviers pour atteindre les 100.",
    route: "/synthese",
    targetId: "synthese-quantis-score",
    preferredPlacement: "right"
  },
  {
    id: "tour-analysis-tabs",
    title: "Le tableau de bord",
    description:
      "Explorez votre performance sous tous les angles : création de valeur, investissements, financement et rentabilité. C'est ici que se prennent les décisions stratégiques.",
    route: "/analysis",
    targetId: "analysis-tabs-menu",
    preferredPlacement: "bottom"
  },
  {
    id: "tour-analysis-1",
    title: "Votre création de valeur",
    description:
      "Analysez la richesse réelle générée par votre exploitation. Suivez votre croissance et identifiez précisément votre point mort opérationnel.",
    route: "/analysis",
    targetId: "tour-tab-valeur",
    section: "creation-valeur",
    preferredPlacement: "top"
  },
  {
    id: "tour-analysis-2",
    title: "Gestion des investissements",
    description:
      "Optimisez votre Besoin en Fonds de Roulement (BFR). Suivez vos ratios de rotation pour libérer des liquidités et améliorer votre agilité financière.",
    route: "/analysis",
    targetId: "tour-tab-investissement",
    section: "investissements",
    preferredPlacement: "top"
  },
  {
    id: "tour-analysis-3",
    title: "Votre financement",
    description:
      "Pilotez votre indépendance financière. Surveillez vos ratios de liquidité et de solvabilité pour garantir la pérennité de votre structure.",
    route: "/analysis",
    targetId: "tour-tab-financement",
    section: "financement",
    preferredPlacement: "top"
  },
  {
    id: "tour-analysis-4",
    title: "Vos rentabilités",
    description:
      "Mesurez le rendement de vos capitaux. Comparez vos performances économiques et financières pour valider la pertinence de votre stratégie.",
    route: "/analysis",
    targetId: "tour-tab-rentabilite",
    section: "rentabilite",
    preferredPlacement: "top"
  },
  {
    id: "tour-documents-files",
    title: "Votre coffre-fort documentaire",
    description:
      "Retrouvez ici tous vos documents comptables et financiers importés. Votre historique de données est centralisé et sécurisé.",
    route: "/documents",
    targetId: "documents-files",
    preferredPlacement: "right"
  },
  {
    id: "tour-documents-upload",
    title: "Nourrir votre croissance",
    description:
      "Un nouveau bilan ? Déposez vos fichiers ou saisissez vos données manuellement pour obtenir une analyse instantanément mise à jour.",
    route: "/documents",
    targetId: "documents-upload",
    preferredPlacement: "right"
  },
  {
    id: "tour-upload-cta",
    title: "Actualiser l'analyse",
    description:
      "Lancez une nouvelle analyse en un clic pour intégrer vos dernières données et ajuster votre trajectoire stratégique.",
    route: "/documents",
    targetId: "documents-update",
    preferredPlacement: "bottom"
  },
  {
    id: "tour-final",
    title: "Vous êtes prêt à utiliser Quantis",
    description:
      "Le guide est terminé. Vous pouvez le relancer à tout moment depuis les paramètres ou nous contacter directement si vous avez des questions.",
    route: "/synthese",
    targetId: "body",
    preferredPlacement: "center"
  }
];

export const ANONYMOUS_TOUR_STEPS: ProductTourStep[] = [
  {
    id: "tour-home-cta",
    title: "Point d'entrée principal",
    description: "Commencez ici pour lancer l'évaluation financière de votre entreprise.",
    route: "/",
    targetId: "home-cta-evaluate",
    advanceOnTargetClick: true,
    preferredPlacement: "bottom"
  },
  {
    id: "tour-upload-dropzone",
    title: "Déposer un fichier",
    description: "Déposez un fichier Excel dans cette zone pour générer votre analyse automatiquement.",
    route: "/upload",
    targetId: "upload-dropzone",
    preferredPlacement: "bottom"
  },
  {
    id: "tour-upload-context",
    title: "Contexte entreprise",
    description: "Optionnel: renseignez la taille et le secteur pour contextualiser les KPI.",
    route: "/upload",
    targetId: "upload-context",
    preferredPlacement: "top"
  },
  {
    id: "tour-upload-submit",
    title: "Lancer l'analyse",
    description: "Une fois prêt, cliquez sur \"Lancer l'analyse\" pour générer vos résultats.",
    route: "/upload",
    targetId: "upload-submit",
    preferredPlacement: "bottom"
  },
  {
    id: "tour-register-switch",
    title: "Connexion ou inscription",
    description: "Vous pouvez basculer entre les deux modes depuis ce sélecteur.",
    route: "/register",
    targetId: "auth-mode-switch",
    preferredPlacement: "bottom"
  },
  {
    id: "tour-register-identity",
    title: "Informations du compte",
    description:
      "Renseignez nom, prénom, email et mot de passe pour créer votre accès personnel en toute sécurité.",
    route: "/register",
    targetId: "auth-identity-context",
    preferredPlacement: "top"
  },
  {
    id: "tour-register-company",
    title: "Informations société",
    description: "Ces champs servent à personnaliser l'expérience et fiabiliser l'analyse.",
    route: "/register",
    targetId: "auth-company-context",
    preferredPlacement: "top"
  },
  {
    id: "tour-register-submit",
    title: "Finaliser votre compte",
    description: "Validez ici pour créer votre espace et sauvegarder vos analyses.",
    route: "/register",
    targetId: "auth-submit",
    preferredPlacement: "top"
  }
];

export function getProductTourSteps(audience: ProductTourAudience): ProductTourStep[] {
  return audience === "authenticated" ? AUTHENTICATED_TOUR_STEPS : ANONYMOUS_TOUR_STEPS;
}

export function getTourStepIds(audience: ProductTourAudience): string[] {
  return getProductTourSteps(audience).map((step) => step.id);
}
