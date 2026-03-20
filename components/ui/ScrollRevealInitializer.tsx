// File: components/ui/ScrollRevealInitializer.tsx
// Role: active un fondu progressif au scroll sur les cartes principales de toute l'application.
"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const TARGET_SELECTOR = ".precision-card, .quantis-panel, [data-reveal]";

export function ScrollRevealInitializer() {
  const pathname = usePathname();

  useEffect(() => {
    // Respect de l'accessibilité: en réduction d'animation, on affiche directement le contenu.
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      document.querySelectorAll<HTMLElement>(TARGET_SELECTOR).forEach((element) => {
        if (shouldIgnoreElement(element)) {
          return;
        }
        element.classList.add("is-scroll-visible");
      });
      return;
    }

    const observedElements = new Set<HTMLElement>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const target = entry.target as HTMLElement;
          if (!entry.isIntersecting) {
            return;
          }

          target.classList.add("is-scroll-visible");
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

        // Chaque élément reçoit un léger délai pour un effet de cascade discret.
        const delay = Math.min(revealIndex * 35, 210);
        element.style.setProperty("--scroll-reveal-delay", `${delay}ms`);
        element.setAttribute("data-scroll-reveal", "true");
        element.classList.remove("is-scroll-visible");

        observer.observe(element);
        observedElements.add(element);
        revealIndex += 1;
      });
    }

    // Scan initial sur la route courante.
    registerAllTargets();

    // Scan dynamique: couvre les composants ajoutés après chargement (onglets, listes, etc.).
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
      observedElements.clear();
    };
  }, [pathname]);

  return null;
}

function shouldIgnoreElement(element: HTMLElement): boolean {
  // Les éléments déjà animés autrement (fade-up) sont exclus pour éviter les conflits visuels.
  if (element.classList.contains("fade-up")) {
    return true;
  }

  // L'attribut de contrôle permet d'exclure un bloc spécifique au besoin.
  if (element.hasAttribute("data-scroll-reveal-ignore")) {
    return true;
  }

  return false;
}

