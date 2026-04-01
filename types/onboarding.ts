import type { SearchSection } from "@/lib/search/globalSearch";

export type ProductTourRoute =
  | "/"
  | "/upload"
  | "/login"
  | "/register"
  | "/synthese"
  | "/analysis"
  | "/documents";

export type ProductTourAudience = "authenticated" | "anonymous";

export type TourTooltipPlacement = "top" | "bottom" | "left" | "right" | "center";

export type ProductTourStep = {
  id: string;
  title: string;
  description: string;
  route: ProductTourRoute;
  targetId: string;
  section?: SearchSection | "investissements";
  preferredPlacement?: TourTooltipPlacement;
  advanceOnTargetClick?: boolean;
};
