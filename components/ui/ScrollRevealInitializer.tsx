// File: components/ui/ScrollRevealInitializer.tsx
// Role: active un fondu progressif au scroll sur les cartes principales de toute l'application.
"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const TARGET_SELECTOR = ".precision-card, .quantis-panel, [data-reveal]";

export function ScrollRevealInitializer() {
  const pathname = usePathname();

  useEffect(() => {
    // Certaines pages de gestion doivent rester lisibles immediatement (pas d'animation de reveal).
    const disableRevealOnRoute = pathname === "/account" || pathname === "/test-kpi";

    // Fallback environnement: si l'API n'existe pas, on n'applique aucun masquage.
    const canUseIntersectionObserver =
      typeof window !== "undefined" && "IntersectionObserver" in window;

    // Respect accessibilite: en reduction d'animation, on affiche le contenu directement.
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || disableRevealOnRoute || !canUseIntersectionObserver) {
      document.querySelectorAll<HTMLElement>(TARGET_SELECTOR).forEach((element) => {
        if (shouldIgnoreElement(element)) {
          return;
        }

        element.classList.add("is-scroll-visible");
        element.removeAttribute("data-scroll-reveal");
      });
      return;
    }

    const observedElements = new Set<HTMLElement>();
    const safetyTimers = new Map<HTMLElement, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const target = entry.target as HTMLElement;
          if (!entry.isIntersecting) {
            return;
          }

          target.classList.add("is-scroll-visible");

          const timer = safetyTimers.get(target);
          if (typeof timer === "number") {
            window.clearTimeout(timer);
            safetyTimers.delete(target);
          }

          observer.unobserve(target);
        });
      },
      {
        threshold: 0.14,
        rootMargin: "0px 0px -8% 0px"
      }
    );

    function registerAllTargets(): void {
      const targets = document.querySelectorAll<HTMLElement>(TARGET_SELECTOR);
      let revealIndex = 0;

      targets.forEach((element) => {
        if (shouldIgnoreElement(element)) {
          return;
        }

        if (observedElements.has(element)) {
          return;
        }

        // Chaque element recoit un leger delai pour un effet de cascade discret.
        const delay = Math.min(revealIndex * 35, 210);
        element.style.setProperty("--scroll-reveal-delay", `${delay}ms`);
        element.setAttribute("data-scroll-reveal", "true");
        element.classList.remove("is-scroll-visible");

        observer.observe(element);

        // Filet de securite: si l'observer ne declenche pas, on affiche quand meme le bloc.
        const timer = window.setTimeout(() => {
          element.classList.add("is-scroll-visible");
        }, 800 + delay);
        safetyTimers.set(element, timer);

        observedElements.add(element);
        revealIndex += 1;
      });
    }

    // Scan initial sur la route courante.
    registerAllTargets();

    // Scan dynamique: couvre les composants ajoutes apres chargement (onglets, listes, etc.).
    const mutationObserver = new MutationObserver(() => {
      registerAllTargets();
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    return () => {
      mutationObserver.disconnect();
      observer.disconnect();
      safetyTimers.forEach((timer) => window.clearTimeout(timer));
      safetyTimers.clear();
      observedElements.clear();
    };
  }, [pathname]);

  return null;
}

function shouldIgnoreElement(element: HTMLElement): boolean {
  // Les elements deja animes autrement (fade-up) sont exclus pour eviter les conflits visuels.
  if (element.classList.contains("fade-up")) {
    return true;
  }

  // L'attribut de controle permet d'exclure un bloc specifique au besoin.
  if (element.hasAttribute("data-scroll-reveal-ignore")) {
    return true;
  }

  return false;
}
