import { useOnboardingContext } from "@/components/onboarding/OnboardingProvider";

export function useOnboarding() {
  return useOnboardingContext();
}
