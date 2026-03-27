import type { ProductTourAudience, ProductTourStep } from "@/types/onboarding";

const AUTHENTICATED_TOUR_STEPS: ProductTourStep[] = [
  {
    id: "tour-synthese-score",
    title: "Votre score global",
    description: "Le Quantis Score résume la santé financière globale de votre entreprise.",
    route: "/synthese",
    targetId: "synthese-quantis-score",
    preferredPlacement: "right"
  },
  {
    id: "tour-synthese-kpis",
    title: "Vos KPI prioritaires",
    description: "Ici, vous retrouvez les indicateurs clés: chiffre d'affaires, EBE et trésorerie.",
    route: "/synthese",
    targetId: "synthese-kpi-ca",
    preferredPlacement: "bottom"
  },
  {
    id: "tour-synthese-actions",
    title: "Actions recommandées",
    description: "Cette zone liste les actions les plus utiles pour améliorer votre trajectoire.",
    route: "/synthese",
    targetId: "synthese-actions",
    preferredPlacement: "top"
  },
  {
    id: "tour-synthese-sidebar",
    title: "Navigation latérale",
    description: "Utilisez ce menu pour passer rapidement entre synthèse, tableau de bord et documents.",
    route: "/synthese",
    targetId: "synthese-sidebar-nav",
    preferredPlacement: "right"
  },
  {
    id: "tour-analysis-tabs",
    title: "Sections financières",
    description: "Ces onglets permettent d'explorer chaque angle d'analyse: création, investissement, financement et rentabilité.",
    route: "/analysis",
    targetId: "analysis-tabs-menu",
    preferredPlacement: "bottom"
  },
  {
    id: "tour-analysis-point-mort",
    title: "Seuil de rentabilité",
    description: "Ce bloc montre à partir de quel niveau d'activité vous couvrez vos coûts.",
    route: "/analysis",
    targetId: "analysis-vc-point-mort",
    section: "creation-valeur",
    preferredPlacement: "top"
  },
  {
    id: "tour-analysis-financement",
    title: "Indépendance financière",
    description: "Cet indicateur explique votre dépendance à la dette et la robustesse de votre structure.",
    route: "/analysis",
    targetId: "analysis-fin-levier",
    section: "financement",
    preferredPlacement: "left"
  },
  {
    id: "tour-analysis-rentabilite",
    title: "Rentabilité du capital",
    description: "Le ROE vous aide à lire ce que vos fonds propres rapportent réellement.",
    route: "/analysis",
    targetId: "analysis-rent-roe",
    section: "rentabilite",
    preferredPlacement: "right"
  },
  {
    id: "tour-documents-files",
    title: "Historique documentaire",
    description: "Retrouvez ici vos fichiers importés et leur rattachement aux analyses.",
    route: "/documents",
    targetId: "documents-files",
    preferredPlacement: "right"
  },
  {
    id: "tour-documents-upload",
    title: "Ajouter des données",
    description: "Vous pouvez déposer un fichier ou saisir des données manuellement depuis cet espace.",
    route: "/documents",
    targetId: "documents-upload",
    preferredPlacement: "right"
  },
  {
    id: "tour-upload-cta",
    title: "Lancer une nouvelle analyse",
    description: "Cette zone d'import permet de démarrer une nouvelle analyse en quelques secondes.",
    route: "/upload",
    targetId: "upload-dropzone",
    preferredPlacement: "bottom"
  }
];

const ANONYMOUS_TOUR_STEPS: ProductTourStep[] = [
  {
    id: "tour-home-cta",
    title: "Point d'entrée principal",
    description: "Commencez ici pour lancer l'évaluation financière de votre entreprise.",
    route: "/",
    targetId: "home-cta-evaluate",
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
    description: "Renseignez la taille et le secteur pour contextualiser les KPI et les recommandations.",
    route: "/upload",
    targetId: "upload-context",
    preferredPlacement: "top"
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
