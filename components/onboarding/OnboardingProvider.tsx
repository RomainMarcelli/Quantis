"use client";

import { ProductTourProvider, useProductTourContext } from "@/components/product-tour/ProductTourProvider";

export const OnboardingProvider = ProductTourProvider;

export function useOnboardingContext() {
  const tour = useProductTourContext();

  return {
    isOpen: tour.isActive,
    currentStep: tour.currentStep,
    stepIndex: tour.stepIndex,
    stepsCount: tour.stepsCount,
    startTour: tour.startTour,
    restartTour: tour.restartTour,
    nextStep: tour.next,
    previousStep: tour.prev,
    skipTour: tour.skip
  };
}

