import { describe, expect, it } from "vitest";
import { getProductTourSteps, getTourStepIds } from "@/lib/onboarding/productTour";

describe("productTour", () => {
  it("provides authenticated tour steps with unique ids", () => {
    const steps = getProductTourSteps("authenticated");
    const ids = getTourStepIds("authenticated");

    expect(steps.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("provides anonymous tour steps with non-empty route and target", () => {
    const steps = getProductTourSteps("anonymous");

    expect(steps.length).toBeGreaterThan(0);
    steps.forEach((step) => {
      expect(step.route.length).toBeGreaterThan(0);
      expect(step.targetId.length).toBeGreaterThan(0);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThan(0);
    });
  });
});
