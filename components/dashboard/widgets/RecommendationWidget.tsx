// File: components/dashboard/widgets/RecommendationWidget.tsx
// Role: widget "Recommandation stratégique" — affiche le 1er message d'action
// du SyntheseViewModel sous forme de bandeau d'agent (équivalent de l'ancien
// AIInsight du cockpit).
"use client";

import { AIInsight } from "@/components/dashboard/AIInsight";

type RecommendationWidgetProps = {
  message: string;
  ctaLabel?: string;
};

export function RecommendationWidget({ message, ctaLabel }: RecommendationWidgetProps) {
  return <AIInsight message={message} ctaLabel={ctaLabel ?? "Ouvrir le plan d'action"} />;
}
