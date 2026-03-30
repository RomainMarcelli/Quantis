"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/hooks/useTheme";
import {
  ONBOARDING_REGISTER_COMPANY_COMPLETED_EVENT,
  ONBOARDING_REGISTER_SWITCH_COMPLETED_EVENT,
  ONBOARDING_REGISTER_IDENTITY_COMPLETED_EVENT,
  ONBOARDING_UPLOAD_CONTEXT_COMPLETED_EVENT,
  ONBOARDING_UPLOAD_FILE_ADDED_EVENT
} from "@/lib/onboarding/events";
import { AUTHENTICATED_TOUR_STEPS, getProductTourSteps } from "@/lib/onboarding/productTour";
import {
  emitSearchNavigation,
  storeSearchTarget,
  type SearchRoute,
  type SearchSection
} from "@/lib/search/globalSearch";
import { firebaseAuthGateway } from "@/services/auth";
import {
  getUserProfile,
  saveUserOnboardingTourCompleted
} from "@/services/userProfileStore";
import type {
  ProductTourAudience,
  ProductTourRoute,
  ProductTourStep
} from "@/types/onboarding";
import { ProductTourOverlay } from "./ProductTourOverlay";

const TOUR_COMPLETED_BY_AUDIENCE_STORAGE_KEY = "quantis.onboarding.completedByAudience";
const LEGACY_TOUR_COMPLETED_STORAGE_KEY = "quantis.onboarding.completed";
const TOUR_PROGRESS_STORAGE_KEY = "quantis.onboarding.progress";
const DISABLE_REMOTE_ONBOARDING_SYNC =
  process.env.NEXT_PUBLIC_ONBOARDING_DISABLE_REMOTE_SYNC === "1";

const AUTO_ADVANCE_EVENTS_BY_STEP_ID: Record<string, string> = {
  "tour-upload-dropzone": ONBOARDING_UPLOAD_FILE_ADDED_EVENT,
  "tour-upload-context": ONBOARDING_UPLOAD_CONTEXT_COMPLETED_EVENT,
  "tour-register-switch": ONBOARDING_REGISTER_SWITCH_COMPLETED_EVENT,
  "tour-register-company": ONBOARDING_REGISTER_COMPANY_COMPLETED_EVENT,
  "tour-register-identity": ONBOARDING_REGISTER_IDENTITY_COMPLETED_EVENT
};

type ProductTourContextValue = {
  currentStep: ProductTourStep | null;
  stepIndex: number;
  stepsCount: number;
  isActive: boolean;
  startTour: (audience?: ProductTourAudience) => void;
  restartTour: () => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
};

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type PersistedTourProgress = {
  audience: ProductTourAudience;
  stepId: string;
  isMinimized: boolean;
};

type PersistedTourCompletionByAudience = {
  anonymous?: boolean;
  authenticated?: boolean;
};

const ProductTourContext = createContext<ProductTourContextValue | null>(null);

export function ProductTourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isDark } = useTheme();

  const [steps, setSteps] = useState<ProductTourStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [tourAudience, setTourAudience] = useState<ProductTourAudience | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isStepReady, setIsStepReady] = useState(false);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [authState, setAuthState] = useState<"loading" | "anonymous" | "authenticated">("loading");

  const currentUserIdRef = useRef<string | null>(null);
  const currentStepIndexRef = useRef(0);
  const stepsRef = useRef<ProductTourStep[]>([]);
  const isActiveRef = useRef(false);
  const remoteCompletionCheckedUserIdRef = useRef<string | null>(null);
  const pendingStepNavigationDirectionRef = useRef<"previous" | "next" | null>(null);

  const currentStep = steps[currentStepIndex] ?? null;
  const isTourOpen = isActive && !isMinimized;

  useEffect(() => {
    currentStepIndexRef.current = currentStepIndex;
  }, [currentStepIndex]);

  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const startTourInternal = useCallback(
    (audience: ProductTourAudience, startStepId?: string): boolean => {
      const nextSteps =
        audience === "authenticated" ? AUTHENTICATED_TOUR_STEPS : getProductTourSteps("anonymous");
      if (!nextSteps.length) {
        return false;
      }

      const targetIndex = startStepId ? nextSteps.findIndex((step) => step.id === startStepId) : 0;
      const safeIndex = targetIndex >= 0 ? targetIndex : 0;

      setSteps(nextSteps);
      setCurrentStepIndex(safeIndex);
      setTourAudience(audience);
      setIsActive(true);
      setIsMinimized(false);
      setIsStepReady(false);
      setTargetElement(null);
      setSpotlightRect(null);
      return true;
    },
    []
  );

  const persistCompletedState = useCallback((isCompleted: boolean) => {
    const audience: ProductTourAudience = currentUserIdRef.current ? "authenticated" : "anonymous";
    writeTourCompletedToStorage(audience, isCompleted);

    const userId = currentUserIdRef.current;
    if (!userId || audience !== "authenticated" || DISABLE_REMOTE_ONBOARDING_SYNC) {
      return;
    }

    void saveUserOnboardingTourCompleted(userId, isCompleted).catch(() => {
      // Non bloquant: le local reste source de vérité.
    });
  }, []);

  const finishTour = useCallback(() => {
    persistCompletedState(true);
    clearTourProgressFromStorage();
    setTourAudience(null);
    setIsActive(false);
    setIsMinimized(false);
    setIsStepReady(false);
    setTargetElement(null);
    setSpotlightRect(null);
  }, [persistCompletedState]);

  const next = useCallback(() => {
    pendingStepNavigationDirectionRef.current = "next";
    const nextIndex = currentStepIndexRef.current + 1;
    if (nextIndex >= stepsRef.current.length) {
      finishTour();
      return;
    }
    setCurrentStepIndex(nextIndex);
  }, [finishTour]);

  const prev = useCallback(() => {
    pendingStepNavigationDirectionRef.current = "previous";
    setCurrentStepIndex((currentIndex) => Math.max(0, currentIndex - 1));
  }, []);

  const skip = useCallback(() => {
    finishTour();
  }, [finishTour]);

  const startTour = useCallback(
    (audience?: ProductTourAudience) => {
      const resolvedAudience = audience ?? (currentUserIdRef.current ? "authenticated" : "anonymous");
      writeTourCompletedToStorage(resolvedAudience, false);
      if (resolvedAudience === "authenticated" && !DISABLE_REMOTE_ONBOARDING_SYNC) {
        const userId = currentUserIdRef.current;
        if (userId) {
          void saveUserOnboardingTourCompleted(userId, false).catch(() => {
            // Non bloquant
          });
        }
      }
      clearTourProgressFromStorage();
      startTourInternal(resolvedAudience);
    },
    [startTourInternal]
  );

  const restartTour = useCallback(() => {
    startTour(currentUserIdRef.current ? "authenticated" : "anonymous");
  }, [startTour]);

  const minimizeTour = useCallback(() => {
    if (!isActiveRef.current) {
      return;
    }
    setIsMinimized(true);
    setIsStepReady(false);
  }, []);

  const reopenTour = useCallback(() => {
    if (!isActiveRef.current) {
      return;
    }
    setIsMinimized(false);
  }, []);

  useEffect(() => {
    const unsubscribe = firebaseAuthGateway.subscribe((user) => {
      const nextUserId = user?.uid ?? null;
      if (currentUserIdRef.current !== nextUserId) {
        remoteCompletionCheckedUserIdRef.current = null;
      }

      currentUserIdRef.current = nextUserId;
      if (!user || !user.emailVerified) {
        setAuthState("anonymous");
        return;
      }
      setAuthState("authenticated");
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (authState === "loading") {
      return;
    }

    const audience: ProductTourAudience = authState === "authenticated" ? "authenticated" : "anonymous";
    let cancelled = false;

    const bootstrapTour = async () => {
      if (isActiveRef.current) {
        if (tourAudience && tourAudience !== audience) {
          if (audience === "authenticated") {
            writeTourCompletedToStorage("anonymous", true);
          }
          clearTourProgressFromStorage();
          startTourInternal(audience);
        }
        return;
      }

      if (audience === "authenticated" && !DISABLE_REMOTE_ONBOARDING_SYNC) {
        const userId = currentUserIdRef.current;
        if (userId && remoteCompletionCheckedUserIdRef.current !== userId) {
          remoteCompletionCheckedUserIdRef.current = userId;
          try {
            const profile = await getUserProfile(userId);
            if (cancelled) {
              return;
            }
            if (profile?.onboardingTourCompleted) {
              writeTourCompletedToStorage("authenticated", true);
            }
          } catch {
            // En cas d'erreur réseau, le local reste source de vérité.
          }
        }
      }

      if (readTourCompletedFromStorage(audience)) {
        clearTourProgressFromStorage();
        return;
      }

      const savedProgress = readTourProgressFromStorage();
      if (savedProgress?.audience === audience && startTourInternal(audience, savedProgress.stepId)) {
        setIsMinimized(Boolean(savedProgress.isMinimized));
        return;
      }

      if (audience === "anonymous" && pathname !== "/") {
        return;
      }

      startTourInternal(audience);
    };

    void bootstrapTour();
    return () => {
      cancelled = true;
    };
  }, [authState, pathname, startTourInternal, tourAudience]);

  useEffect(() => {
    if (!isActive || !tourAudience || authState === "loading") {
      return;
    }

    const expectedAudience: ProductTourAudience =
      authState === "authenticated" ? "authenticated" : "anonymous";

    if (tourAudience === expectedAudience) {
      return;
    }

    if (expectedAudience === "authenticated") {
      // Transition immédiate après connexion: on quitte le flow invité
      // et on démarre le flow authentifié.
      writeTourCompletedToStorage("anonymous", true);
      clearTourProgressFromStorage();
      window.setTimeout(() => {
        startTourInternal("authenticated");
      }, 0);
      return;
    }

    // En sortie de session, on ferme le flow authentifié en cours.
    window.setTimeout(() => {
      setTourAudience(null);
      setIsActive(false);
      setIsMinimized(false);
      setIsStepReady(false);
      setTargetElement(null);
      setSpotlightRect(null);
    }, 0);
  }, [authState, isActive, startTourInternal, tourAudience]);

  useEffect(() => {
    if (!isActive || !currentStep) {
      return;
    }

    const audience: ProductTourAudience = currentUserIdRef.current ? "authenticated" : "anonymous";
    writeTourProgressToStorage({
      audience,
      stepId: currentStep.id,
      isMinimized
    });
  }, [currentStep, isActive, isMinimized]);

  useEffect(() => {
    if (!isTourOpen || !currentStep) {
      return;
    }

    const eventName = AUTO_ADVANCE_EVENTS_BY_STEP_ID[currentStep.id];
    if (!eventName) {
      return;
    }

    const onStepCompleted = () => {
      window.setTimeout(() => {
        next();
      }, 0);
    };

    window.addEventListener(eventName, onStepCompleted);
    return () => {
      window.removeEventListener(eventName, onStepCompleted);
    };
  }, [currentStep, isTourOpen, next]);

  useEffect(() => {
    if (!isTourOpen || !currentStep) {
      return;
    }

    let cancelled = false;

    const ensureActiveStep = async () => {
      setIsStepReady(false);
      setTargetElement(null);
      setSpotlightRect(null);

      const stepNavigationDirection = pendingStepNavigationDirectionRef.current;
      pendingStepNavigationDirectionRef.current = null;
      const section = normalizeTourSection(currentStep.section);
      const sectionRoute = isSearchRoute(currentStep.route) ? currentStep.route : null;

      if (!routeMatches(pathname, currentStep.route)) {
        if (stepNavigationDirection === "previous" || stepNavigationDirection === "next") {
          if (sectionRoute && section) {
            storeSearchTarget({
              route: sectionRoute,
              section,
              refId: currentStep.targetId
            });
          }
          router.push(currentStep.route);
          return;
        }

        const matchingRouteStepIndex = steps.findIndex((step) => routeMatches(pathname, step.route));
        if (
          matchingRouteStepIndex >= 0 &&
          matchingRouteStepIndex !== currentStepIndexRef.current
        ) {
          setCurrentStepIndex(matchingRouteStepIndex);
          return;
        }

        setIsStepReady(false);
        setTargetElement(null);
        setSpotlightRect(null);
        return;
      }

      if (sectionRoute && section) {
        emitSearchNavigation({
          route: sectionRoute,
          section,
          refId: currentStep.targetId
        });
      }

      const resolvedTargetElement = await waitForStepElement(currentStep.targetId);
      if (cancelled) {
        return;
      }

      if (!resolvedTargetElement) {
        // Les étapes invalides sont ignorées pour ne jamais bloquer l'onboarding.
        console.warn(
          `[ProductTour] target introuvable pour l'étape "${currentStep.id}" (targetId="${currentStep.targetId}"). Étape ignorée.`
        );
        window.setTimeout(() => {
          next();
        }, 0);
        return;
      }

      scrollStepElementIntoView(resolvedTargetElement);
      await wait(120);
      if (cancelled) {
        return;
      }

      setTargetElement(resolvedTargetElement);
      setSpotlightRect(toSpotlightRect(resolvedTargetElement.getBoundingClientRect()));
      setIsStepReady(true);
    };

    void ensureActiveStep();
    return () => {
      cancelled = true;
    };
  }, [currentStep, isTourOpen, next, pathname, router, steps]);

  useEffect(() => {
    if (!isTourOpen || !currentStep) {
      return;
    }

    let rafId: number | null = null;

    const syncSpotlight = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }

      rafId = window.requestAnimationFrame(() => {
        const fallbackTarget = resolveStepElement(currentStep.targetId);
        const nextTarget =
          targetElement && targetElement.isConnected && isElementVisible(targetElement)
            ? targetElement
            : fallbackTarget;
        if (!nextTarget) {
          return;
        }

        setTargetElement(nextTarget);
        setSpotlightRect(toSpotlightRect(nextTarget.getBoundingClientRect()));
      });
    };

    syncSpotlight();
    window.addEventListener("resize", syncSpotlight);
    window.addEventListener("scroll", syncSpotlight, true);
    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("resize", syncSpotlight);
      window.removeEventListener("scroll", syncSpotlight, true);
    };
  }, [currentStep, isTourOpen, targetElement]);

  useEffect(() => {
    if (!isTourOpen || !targetElement) {
      return;
    }

    const syncSpotlightFromResize = () => {
      if (!targetElement.isConnected || !isElementVisible(targetElement)) {
        return;
      }
      setSpotlightRect(toSpotlightRect(targetElement.getBoundingClientRect()));
    };

    syncSpotlightFromResize();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      syncSpotlightFromResize();
    });
    observer.observe(targetElement);
    if (targetElement.parentElement) {
      observer.observe(targetElement.parentElement);
    }

    return () => {
      observer.disconnect();
    };
  }, [isTourOpen, targetElement]);

  useEffect(() => {
    if (!isTourOpen || !currentStep?.advanceOnTargetClick || !targetElement) {
      return;
    }

    const onTargetClick = () => {
      window.setTimeout(() => {
        next();
      }, 0);
    };

    targetElement.addEventListener("click", onTargetClick);
    return () => {
      targetElement.removeEventListener("click", onTargetClick);
    };
  }, [currentStep?.advanceOnTargetClick, isTourOpen, next, targetElement]);

  const contextValue = useMemo<ProductTourContextValue>(
    () => ({
      currentStep,
      stepIndex: currentStep ? currentStepIndex : 0,
      stepsCount: steps.length,
      isActive,
      startTour,
      restartTour,
      next,
      prev,
      skip
    }),
    [currentStep, currentStepIndex, isActive, next, prev, restartTour, skip, startTour, steps.length]
  );

  return (
    <ProductTourContext.Provider value={contextValue}>
      {children}

      {isTourOpen && currentStep ? (
        <ProductTourOverlay
          isOpen={isTourOpen}
          isDark={isDark}
          step={currentStep}
          stepIndex={currentStepIndex}
          totalSteps={steps.length}
          targetRect={spotlightRect}
          isStepReady={isStepReady}
          onNext={next}
          onPrev={prev}
          onSkip={skip}
          onMinimize={minimizeTour}
        />
      ) : null}

      {isActive && isMinimized ? (
        <button
          type="button"
          onClick={reopenTour}
          className={`fixed bottom-4 right-4 z-[141] inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium shadow-xl transition ${
            isDark
              ? "border-white/20 bg-[#0d1320]/95 text-white hover:bg-[#101827]"
              : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
          }`}
          aria-label="Reouvrir le guide"
          title="Reouvrir le guide"
        >
          Guide
        </button>
      ) : null}
    </ProductTourContext.Provider>
  );
}

export function useProductTourContext(): ProductTourContextValue {
  const context = useContext(ProductTourContext);
  if (!context) {
    throw new Error("useProductTour doit être utilisé dans <ProductTourProvider />.");
  }
  return context;
}

function routeMatches(pathname: string | null, targetRoute: ProductTourRoute): boolean {
  if (!pathname) {
    return false;
  }
  if (targetRoute === "/") {
    return pathname === "/";
  }
  return pathname === targetRoute || pathname.startsWith(`${targetRoute}/`);
}

function isSearchRoute(route: ProductTourRoute): route is SearchRoute {
  return route === "/analysis" || route === "/synthese" || route === "/documents";
}

function normalizeTourSection(section?: ProductTourStep["section"]): SearchSection | undefined {
  if (section === "investissements") {
    return "investissement-bfr";
  }
  return section;
}

function resolveStepElement(targetId: string): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  const escapedTargetId = cssEscape(targetId);
  const candidates = [
    ...Array.from(document.querySelectorAll<HTMLElement>(`[data-tour-id="${escapedTargetId}"]`)),
    ...Array.from(document.querySelectorAll<HTMLElement>(`[data-search-id="${escapedTargetId}"]`))
  ];
  const idCandidate = document.getElementById(targetId);
  if (idCandidate instanceof HTMLElement) {
    candidates.push(idCandidate);
  }

  const uniqueCandidates = candidates.filter(
    (candidate, index) => candidates.indexOf(candidate) === index
  );
  const visibleCandidate = uniqueCandidates.find((candidate) => isElementVisible(candidate));
  return visibleCandidate ?? uniqueCandidates[0] ?? null;
}

async function waitForStepElement(targetId: string): Promise<HTMLElement | null> {
  const maxAttempts = 30;
  const delayMs = 90;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const target = resolveStepElement(targetId);
    if (target) {
      return target;
    }
    await wait(delayMs);
  }

  return null;
}

function toSpotlightRect(rect: DOMRect): SpotlightRect {
  const padding = 8;
  return {
    top: rect.top - padding,
    left: rect.left - padding,
    width: Math.max(42, rect.width + padding * 2),
    height: Math.max(38, rect.height + padding * 2)
  };
}

function scrollStepElementIntoView(targetElement: HTMLElement): void {
  targetElement.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest"
  });
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

function isElementVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  return true;
}

function readTourCompletedFromStorage(audience: ProductTourAudience): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const rawValue = window.localStorage.getItem(TOUR_COMPLETED_BY_AUDIENCE_STORAGE_KEY);
    if (rawValue) {
      const parsed = JSON.parse(rawValue) as PersistedTourCompletionByAudience;
      return Boolean(parsed[audience]);
    }

    if (audience === "anonymous") {
      return window.localStorage.getItem(LEGACY_TOUR_COMPLETED_STORAGE_KEY) === "true";
    }

    return false;
  } catch {
    return false;
  }
}

function writeTourCompletedToStorage(audience: ProductTourAudience, isCompleted: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const rawValue = window.localStorage.getItem(TOUR_COMPLETED_BY_AUDIENCE_STORAGE_KEY);
    const parsed = rawValue
      ? (JSON.parse(rawValue) as PersistedTourCompletionByAudience)
      : ({} as PersistedTourCompletionByAudience);

    parsed[audience] = isCompleted;
    window.localStorage.setItem(TOUR_COMPLETED_BY_AUDIENCE_STORAGE_KEY, JSON.stringify(parsed));
    window.localStorage.removeItem(LEGACY_TOUR_COMPLETED_STORAGE_KEY);
  } catch {
    // Non bloquant.
  }
}

function readTourProgressFromStorage(): PersistedTourProgress | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(TOUR_PROGRESS_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }
    const parsed = JSON.parse(rawValue) as Partial<PersistedTourProgress>;
    if (
      (parsed.audience !== "anonymous" && parsed.audience !== "authenticated") ||
      typeof parsed.stepId !== "string" ||
      !parsed.stepId.trim()
    ) {
      return null;
    }

    return {
      audience: parsed.audience,
      stepId: parsed.stepId,
      isMinimized: Boolean(parsed.isMinimized)
    };
  } catch {
    return null;
  }
}

function writeTourProgressToStorage(progress: PersistedTourProgress): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(TOUR_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Non bloquant.
  }
}

function clearTourProgressFromStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(TOUR_PROGRESS_STORAGE_KEY);
  } catch {
    // Non bloquant.
  }
}
