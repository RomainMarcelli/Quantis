import { useProductTour } from "@/hooks/useProductTour";

export function useOnboarding() {
  const tour = useProductTour();

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
