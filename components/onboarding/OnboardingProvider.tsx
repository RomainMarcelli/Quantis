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
import { CheckCircle2, ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import {
  ONBOARDING_REGISTER_COMPANY_COMPLETED_EVENT,
  ONBOARDING_REGISTER_IDENTITY_COMPLETED_EVENT,
  ONBOARDING_UPLOAD_CONTEXT_COMPLETED_EVENT,
  ONBOARDING_UPLOAD_FILE_ADDED_EVENT
} from "@/lib/onboarding/events";
import { getProductTourSteps } from "@/lib/onboarding/productTour";
import {
  emitSearchNavigation,
  type SearchRoute,
  storeSearchTarget
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

const TOUR_COMPLETED_BY_AUDIENCE_STORAGE_KEY = "quantis.onboarding.completedByAudience";
const LEGACY_TOUR_COMPLETED_STORAGE_KEY = "quantis.onboarding.completed";
const TOUR_PROGRESS_STORAGE_KEY = "quantis.onboarding.progress";
const DISABLE_REMOTE_ONBOARDING_SYNC =
  process.env.NEXT_PUBLIC_ONBOARDING_DISABLE_REMOTE_SYNC === "1";

type OnboardingContextValue = {
  isOpen: boolean;
  currentStep: ProductTourStep | null;
  stepIndex: number;
  stepsCount: number;
  startTour: (audience?: ProductTourAudience) => void;
  restartTour: () => void;
  nextStep: () => void;
  previousStep: () => void;
  skipTour: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

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

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isDark } = useTheme();

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showCompletionScreen, setShowCompletionScreen] = useState(false);
  const [steps, setSteps] = useState<ProductTourStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [isStepReady, setIsStepReady] = useState(false);
  const [authState, setAuthState] = useState<"loading" | "anonymous" | "authenticated">("loading");
  const [resolvedStepElement, setResolvedStepElement] = useState<HTMLElement | null>(null);

  const autoStartedRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);
  const currentStepIndexRef = useRef(0);
  const pendingStepNavigationDirectionRef = useRef<"previous" | "next" | null>(null);

  const currentStep = steps[currentStepIndex] ?? null;

  useEffect(() => {
    currentStepIndexRef.current = currentStepIndex;
  }, [currentStepIndex]);

  const startTourInternal = useCallback((audience: ProductTourAudience) => {
    const nextSteps = getProductTourSteps(audience);
    if (!nextSteps.length) {
      return;
    }

    setSteps(nextSteps);
    setCurrentStepIndex(0);
    setIsOpen(true);
    setIsMinimized(false);
    setShowCompletionScreen(false);
    setIsStepReady(false);
    setSpotlightRect(null);
    setResolvedStepElement(null);
  }, []);

  const restoreInProgressTour = useCallback(
    (audience: ProductTourAudience, stepId?: string, isMinimizedState = false): boolean => {
      const nextSteps = getProductTourSteps(audience);
      if (!nextSteps.length) {
        return false;
      }

      const targetIndex = stepId ? nextSteps.findIndex((step) => step.id === stepId) : 0;
      const safeIndex = targetIndex >= 0 ? targetIndex : 0;

      setSteps(nextSteps);
      setCurrentStepIndex(safeIndex);
      setIsOpen(!isMinimizedState);
      setIsMinimized(isMinimizedState);
      setShowCompletionScreen(false);
      setIsStepReady(false);
      setSpotlightRect(null);
      setResolvedStepElement(null);
      return true;
    },
    []
  );

  const persistCompletedState = useCallback(() => {
    const audience: ProductTourAudience = currentUserIdRef.current ? "authenticated" : "anonymous";
    writeTourCompletedToStorage(audience, true);
    const userId = currentUserIdRef.current;
    if (!userId || audience !== "authenticated" || DISABLE_REMOTE_ONBOARDING_SYNC) {
      return;
    }

    void saveUserOnboardingTourCompleted(userId, true);
  }, []);

  const completeTour = useCallback(() => {
    persistCompletedState();
    clearTourProgressFromStorage();
    setIsOpen(false);
    setIsMinimized(false);
    setShowCompletionScreen(true);
  }, [persistCompletedState]);

  const closeCompletionScreen = useCallback(() => {
    setShowCompletionScreen(false);
  }, []);

  const startTour = useCallback(
    (audience?: ProductTourAudience) => {
      if (audience) {
        startTourInternal(audience);
        return;
      }

      const defaultAudience = currentUserIdRef.current ? "authenticated" : "anonymous";
      startTourInternal(defaultAudience);
    },
    [startTourInternal]
  );

  const restartTour = useCallback(() => {
    const audience: ProductTourAudience = currentUserIdRef.current ? "authenticated" : "anonymous";
    writeTourCompletedToStorage(audience, false);
    clearTourProgressFromStorage();
    startTourInternal(audience);
  }, [startTourInternal]);

  const skipTour = useCallback(() => {
    persistCompletedState();
    clearTourProgressFromStorage();
    setIsOpen(false);
    setIsMinimized(false);
    setShowCompletionScreen(false);
  }, [persistCompletedState]);

  const closeTourWidget = useCallback(() => {
    setIsOpen(false);
    setShowCompletionScreen(false);
    setIsMinimized(true);
  }, []);

  const reopenTourWidget = useCallback(() => {
    if (!steps.length) {
      return;
    }
    setShowCompletionScreen(false);
    setIsOpen(true);
    setIsMinimized(false);
  }, [steps.length]);

  const previousStep = useCallback(() => {
    pendingStepNavigationDirectionRef.current = "previous";
    setCurrentStepIndex((currentIndex) => Math.max(currentIndex - 1, 0));
  }, []);

  const nextStep = useCallback(() => {
    pendingStepNavigationDirectionRef.current = "next";
    const nextIndex = currentStepIndexRef.current + 1;
    if (nextIndex >= steps.length) {
      completeTour();
      return;
    }
    setCurrentStepIndex(nextIndex);
  }, [completeTour, steps.length]);

  const syncAutoStart = useCallback(
    async (userId: string): Promise<void> => {
      let remoteCompleted = false;
      const localCompleted = readTourCompletedFromStorage("authenticated");
      const savedProgress = readTourProgressFromStorage();

      if (!DISABLE_REMOTE_ONBOARDING_SYNC) {
        try {
          const profile = await getUserProfile(userId);
          remoteCompleted = Boolean(profile?.onboardingTourCompleted);
        } catch {
          // En cas d'erreur reseau, on se base sur le stockage local.
        }
      }

      if (remoteCompleted && !localCompleted) {
        writeTourCompletedToStorage("authenticated", true);
        clearTourProgressFromStorage();
        return;
      }

      if (!remoteCompleted && localCompleted) {
        clearTourProgressFromStorage();
        if (!DISABLE_REMOTE_ONBOARDING_SYNC) {
          await saveUserOnboardingTourCompleted(userId, true).catch(() => {
            // Non bloquant: le local reste source de verite temporaire.
          });
        }
        return;
      }

      if (
        !remoteCompleted &&
        !localCompleted &&
        savedProgress?.audience === "authenticated" &&
        !autoStartedRef.current
      ) {
        autoStartedRef.current = true;
        restoreInProgressTour("authenticated", savedProgress.stepId, savedProgress.isMinimized);
        return;
      }

      if (!remoteCompleted && !localCompleted && !autoStartedRef.current) {
        autoStartedRef.current = true;
        startTourInternal("authenticated");
      }
    },
    [restoreInProgressTour, startTourInternal]
  );

  useEffect(() => {
    const unsubscribe = firebaseAuthGateway.subscribe((user) => {
      const nextUserId = user?.uid ?? null;
      if (currentUserIdRef.current !== nextUserId) {
        autoStartedRef.current = false;
      }
      currentUserIdRef.current = nextUserId;

      if (!user || !user.emailVerified) {
        setAuthState("anonymous");
        return;
      }

      setAuthState("authenticated");
      void syncAutoStart(user.uid);
    });

    return unsubscribe;
  }, [syncAutoStart]);

  useEffect(() => {
    if (authState !== "anonymous") {
      return;
    }
    if (readTourCompletedFromStorage("anonymous")) {
      clearTourProgressFromStorage();
      return;
    }

    const savedProgress = readTourProgressFromStorage();
    if (savedProgress?.audience === "anonymous" && !autoStartedRef.current) {
      autoStartedRef.current = true;
      window.setTimeout(() => {
        restoreInProgressTour("anonymous", savedProgress.stepId, savedProgress.isMinimized);
      }, 0);
      return;
    }

    if (pathname !== "/") {
      return;
    }
    if (autoStartedRef.current) {
      return;
    }
    autoStartedRef.current = true;
    window.setTimeout(() => {
      startTourInternal("anonymous");
    }, 0);
  }, [authState, pathname, restoreInProgressTour, startTourInternal]);

  useEffect(() => {
    if (!steps.length) {
      return;
    }

    const activeStep = steps[currentStepIndex] ?? steps[0];
    if (!activeStep) {
      return;
    }

    const audience: ProductTourAudience = currentUserIdRef.current ? "authenticated" : "anonymous";
    if (readTourCompletedFromStorage(audience)) {
      clearTourProgressFromStorage();
      return;
    }

    writeTourProgressToStorage({
      audience: currentUserIdRef.current ? "authenticated" : "anonymous",
      stepId: activeStep.id,
      isMinimized: !isOpen && isMinimized
    });
  }, [currentStepIndex, isMinimized, isOpen, steps]);

  useEffect(() => {
    if (!isOpen || !currentStep || currentStep.id !== "tour-upload-dropzone") {
      return;
    }

    const onUploadFileAdded = () => {
      window.setTimeout(() => {
        nextStep();
      }, 0);
    };

    window.addEventListener(ONBOARDING_UPLOAD_FILE_ADDED_EVENT, onUploadFileAdded);
    return () => {
      window.removeEventListener(ONBOARDING_UPLOAD_FILE_ADDED_EVENT, onUploadFileAdded);
    };
  }, [currentStep, isOpen, nextStep]);

  useEffect(() => {
    if (!isOpen || !currentStep || currentStep.id !== "tour-upload-context") {
      return;
    }

    const onUploadContextCompleted = () => {
      window.setTimeout(() => {
        nextStep();
      }, 0);
    };

    window.addEventListener(
      ONBOARDING_UPLOAD_CONTEXT_COMPLETED_EVENT,
      onUploadContextCompleted
    );
    return () => {
      window.removeEventListener(
        ONBOARDING_UPLOAD_CONTEXT_COMPLETED_EVENT,
        onUploadContextCompleted
      );
    };
  }, [currentStep, isOpen, nextStep]);

  useEffect(() => {
    if (!isOpen || !currentStep || currentStep.id !== "tour-register-company") {
      return;
    }

    const onRegisterCompanyCompleted = () => {
      window.setTimeout(() => {
        nextStep();
      }, 0);
    };

    window.addEventListener(
      ONBOARDING_REGISTER_COMPANY_COMPLETED_EVENT,
      onRegisterCompanyCompleted
    );
    return () => {
      window.removeEventListener(
        ONBOARDING_REGISTER_COMPANY_COMPLETED_EVENT,
        onRegisterCompanyCompleted
      );
    };
  }, [currentStep, isOpen, nextStep]);

  useEffect(() => {
    if (!isOpen || !currentStep || currentStep.id !== "tour-register-identity") {
      return;
    }

    const onRegisterIdentityCompleted = () => {
      window.setTimeout(() => {
        nextStep();
      }, 0);
    };

    window.addEventListener(
      ONBOARDING_REGISTER_IDENTITY_COMPLETED_EVENT,
      onRegisterIdentityCompleted
    );
    return () => {
      window.removeEventListener(
        ONBOARDING_REGISTER_IDENTITY_COMPLETED_EVENT,
        onRegisterIdentityCompleted
      );
    };
  }, [currentStep, isOpen, nextStep]);

  useEffect(() => {
    if (!isOpen || !currentStep) {
      return;
    }

    let cancelled = false;

    const ensureStepVisibility = async () => {
      setIsStepReady(false);
      const stepNavigationDirection = pendingStepNavigationDirectionRef.current;
      pendingStepNavigationDirectionRef.current = null;

      if (!routeMatches(pathname, currentStep.route)) {
        const activeIndex = currentStepIndexRef.current;
        const matchingRouteStepIndex = steps.findIndex((step) => routeMatches(pathname, step.route));

        // Si le changement de page vient d'un clic "Suivant/Precedent" du widget,
        // c'est le guide qui pilote la navigation et on force la route de l'etape.
        if (stepNavigationDirection === "previous" || stepNavigationDirection === "next") {
          if (isSearchRoute(currentStep.route)) {
            storeSearchTarget({
              route: currentStep.route,
              section: currentStep.section,
              refId: currentStep.targetId
            });
          }
          router.push(currentStep.route);
          return;
        }

        // Si l'utilisateur navigue librement dans l'app et qu'il tombe sur une route
        // couverte par une autre etape, on aligne simplement l'index du guide.
        if (matchingRouteStepIndex >= 0) {
          setCurrentStepIndex(matchingRouteStepIndex);
          return;
        }

        // Cas particulier: premiere connexion authentifiee, on veut guider vers /synthese.
        if (authState === "authenticated" && activeIndex === 0 && currentStep.route === "/synthese") {
          router.push(currentStep.route);
          return;
        }

        // Hors parcours: on minimise le guide pour ne jamais bloquer la navigation utilisateur.
        setIsOpen(false);
        setIsMinimized(true);
        setShowCompletionScreen(false);
        setResolvedStepElement(null);
        setSpotlightRect(null);
        setIsStepReady(false);
        return;
      }

      if (isSearchRoute(currentStep.route)) {
        emitSearchNavigation({
          route: currentStep.route,
          section: currentStep.section,
          refId: currentStep.targetId
        });
      }

      const targetElement = await waitForStepElement(currentStep.targetId);
      if (cancelled) {
        return;
      }

      if (!targetElement) {
        setResolvedStepElement(null);
        setSpotlightRect(null);
        setIsStepReady(false);
        return;
      }

      scrollStepElementIntoView(targetElement);
      await wait(120);

      setResolvedStepElement(targetElement);
      setSpotlightRect(toSpotlightRect(targetElement.getBoundingClientRect()));
      setIsStepReady(true);
    };

    void ensureStepVisibility();

    return () => {
      cancelled = true;
    };
  }, [authState, currentStep?.id, currentStep, isOpen, pathname, router, steps]);

  useEffect(() => {
    if (!isOpen || !currentStep) {
      return;
    }

    const syncPosition = () => {
      const nextTarget = resolveStepElement(currentStep.targetId);
      if (!nextTarget) {
        setResolvedStepElement(null);
        setSpotlightRect(null);
        return;
      }

      setResolvedStepElement(nextTarget);
      setSpotlightRect(toSpotlightRect(nextTarget.getBoundingClientRect()));
    };

    syncPosition();

    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);
    return () => {
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  }, [currentStep?.id, currentStep, isOpen]);

  useEffect(() => {
    if (!isOpen || !resolvedStepElement) {
      return;
    }

    resolvedStepElement.classList.add("quantis-tour-target-active");
    return () => {
      resolvedStepElement.classList.remove("quantis-tour-target-active");
    };
  }, [isOpen, resolvedStepElement]);

  useEffect(() => {
    if (!isOpen || !currentStep || !resolvedStepElement || !currentStep.advanceOnTargetClick) {
      return;
    }

    const onTargetClick = () => {
      window.setTimeout(() => {
        nextStep();
      }, 0);
    };

    resolvedStepElement.addEventListener("click", onTargetClick);
    return () => {
      resolvedStepElement.removeEventListener("click", onTargetClick);
    };
  }, [currentStep, isOpen, nextStep, resolvedStepElement]);

  const contextValue = useMemo<OnboardingContextValue>(
    () => ({
      isOpen,
      currentStep,
      stepIndex: currentStep ? currentStepIndex : 0,
      stepsCount: steps.length,
      startTour,
      restartTour,
      nextStep,
      previousStep,
      skipTour
    }),
    [
      currentStep,
      currentStepIndex,
      isOpen,
      nextStep,
      previousStep,
      restartTour,
      skipTour,
      startTour,
      steps.length
    ]
  );

  return (
    <OnboardingContext.Provider value={contextValue}>
      {children}

      {isOpen && currentStep ? (
        <div className="pointer-events-none fixed inset-0 z-[120]">
          {spotlightRect ? (
            <div
              className="pointer-events-none fixed rounded-xl border"
              style={{
                top: spotlightRect.top,
                left: spotlightRect.left,
                width: spotlightRect.width,
                height: spotlightRect.height,
                borderColor: isDark ? "rgba(245, 204, 97, 0.55)" : "rgba(180, 132, 24, 0.6)",
                boxShadow: isDark
                  ? "0 0 0 1px rgba(250,214,125,0.2), 0 0 18px rgba(214,166,52,0.28)"
                  : "0 0 0 1px rgba(185,139,29,0.22), 0 0 16px rgba(210,159,37,0.2)"
              }}
            />
          ) : null}

          <div
            className={`pointer-events-auto fixed bottom-4 left-3 right-3 z-[121] w-auto rounded-2xl border p-4 shadow-2xl md:left-auto md:right-4 md:w-[min(92vw,380px)] ${
              isDark ? "border-white/15 bg-[#0c1018] text-white" : "border-slate-300 bg-white text-slate-900"
            }`}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className={`text-[11px] uppercase tracking-[0.16em] ${isDark ? "text-quantis-gold" : "text-amber-700"}`}>
                Étape {currentStepIndex + 1} / {steps.length}
              </p>
              <button
                type="button"
                onClick={closeTourWidget}
                className={`rounded-md p-1 transition ${isDark ? "text-white/65 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"}`}
                aria-label="Reduire le guide"
                title="Reduire le guide"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <h3 className="text-base font-semibold">{currentStep.title}</h3>
            <p className={`mt-2 text-sm leading-relaxed ${isDark ? "text-white/75" : "text-slate-600"}`}>
              {currentStep.description}
            </p>

            {!isStepReady ? (
              <p className={`mt-2 text-xs ${isDark ? "text-white/50" : "text-slate-500"}`}>
                Chargement de la section ciblée...
              </p>
            ) : null}

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={skipTour}
                className={`rounded-lg border px-3 py-1.5 text-xs ${
                  isDark
                    ? "border-rose-400/35 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15"
                    : "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                }`}
              >
                Stop
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={previousStep}
                  disabled={currentStepIndex === 0}
                  className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-45 ${
                    isDark
                      ? "border-white/20 bg-white/5 text-white/85 hover:bg-white/10"
                      : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Précédent
                </button>

                <button
                  type="button"
                  onClick={nextStep}
                  className="btn-gold-premium inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
                >
                  {currentStepIndex + 1 >= steps.length ? "Terminer" : "Suivant"}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showCompletionScreen ? (
        <div className="pointer-events-none fixed inset-0 z-[120]">
          <div
            className={`pointer-events-auto fixed bottom-4 left-3 right-3 w-auto rounded-2xl border p-6 text-center shadow-2xl md:left-auto md:right-4 md:w-full md:max-w-md ${
              isDark ? "border-white/15 bg-[#0c1018] text-white" : "border-slate-300 bg-white text-slate-900"
            }`}
          >
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/20 text-emerald-200">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold">Vous êtes prêt à utiliser Quantis</h3>
            <p className={`mt-2 text-sm ${isDark ? "text-white/75" : "text-slate-600"}`}>
              Le guide est terminé. Vous pouvez le relancer à tout moment depuis les paramètres.
            </p>
            <button
              type="button"
              onClick={closeCompletionScreen}
              className="btn-gold-premium mt-5 rounded-xl px-4 py-2 text-sm font-semibold"
            >
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      {isMinimized && !isOpen && !showCompletionScreen ? (
        <button
          type="button"
          onClick={reopenTourWidget}
          className={`fixed bottom-4 right-4 z-[121] inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium shadow-xl transition ${
            isDark
              ? "border-white/20 bg-[#0c1018]/95 text-white hover:bg-[#101827]"
              : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
          }`}
          aria-label="Reouvrir le guide"
          title="Reouvrir le guide"
        >
          <Sparkles className={`h-3.5 w-3.5 ${isDark ? "text-quantis-gold" : "text-amber-600"}`} />
          Guide
        </button>
      ) : null}
    </OnboardingContext.Provider>
  );

}

export function useOnboardingContext(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding doit être utilisé dans <OnboardingProvider />.");
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

function resolveStepElement(targetId: string): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  const escaped = cssEscape(targetId);
  return (
    document.querySelector<HTMLElement>(`[data-tour-id="${escaped}"]`) ??
    document.querySelector<HTMLElement>(`[data-search-id="${escaped}"]`) ??
    document.getElementById(targetId)
  );
}

async function waitForStepElement(targetId: string): Promise<HTMLElement | null> {
  const maxAttempts = 28;
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

function toSpotlightRect(rect: DOMRect): SpotlightRect {
  const padding = 6;
  return {
    top: Math.max(8, rect.top - padding),
    left: Math.max(8, rect.left - padding),
    width: Math.max(42, rect.width + padding * 2),
    height: Math.max(38, rect.height + padding * 2)
  };
}

function scrollStepElementIntoView(targetElement: HTMLElement): void {
  if (typeof window === "undefined") {
    return;
  }

  const rect = targetElement.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const topBuffer = 88;
  const bottomBuffer = 80;
  const isAboveViewport = rect.top < topBuffer;
  const isBelowViewport = rect.bottom > viewportHeight - bottomBuffer;

  if (!isAboveViewport && !isBelowViewport) {
    return;
  }

  targetElement.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest"
  });
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

    // Fallback legacy key: on le traite comme completion du parcours anonyme.
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
    window.localStorage.setItem(
      TOUR_COMPLETED_BY_AUDIENCE_STORAGE_KEY,
      JSON.stringify(parsed)
    );
    window.localStorage.removeItem(LEGACY_TOUR_COMPLETED_STORAGE_KEY);
  } catch {
    // non bloquant
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
    // non bloquant
  }
}

function clearTourProgressFromStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(TOUR_PROGRESS_STORAGE_KEY);
  } catch {
    // non bloquant
  }
}


