import { useProductTourContext } from "@/components/product-tour/ProductTourProvider";

export function useProductTour() {
  return useProductTourContext();
}
