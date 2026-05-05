// File: components/legal/LegalPageShell.tsx
// Role: shell partagé pour les pages légales (mentions légales, CGU,
// politique de confidentialité). Header sobre avec logo + lien retour,
// titre, date de mise à jour, contenu en typographie longue.
//
// Volontairement isolé du reste de l'app : ces pages doivent rester
// accessibles même si l'utilisateur n'est pas connecté ou si le layout
// principal change — d'où la duplication minimale du chrome.
"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { LegalFooter } from "@/components/layout/LegalFooter";

type LegalPageShellProps = {
  title: string;
  /** Date au format "DD/MM/YYYY" — affichée sous le titre. */
  lastUpdated?: string;
  children: React.ReactNode;
};

export function LegalPageShell({ title, lastUpdated, children }: LegalPageShellProps) {
  return (
    <main className="min-h-screen w-full" style={{ backgroundColor: "#09090b" }}>
      {/* Header : logo cliquable (retour à l'accueil) + lien arrière. */}
      <header
        className="sticky top-0 z-10 border-b"
        style={{
          backgroundColor: "rgba(9, 9, 11, 0.85)",
          borderColor: "rgba(255, 255, 255, 0.06)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" aria-label="Retour à l'accueil">
            <QuantisLogo withText size={28} />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 hover:underline"
            style={{ color: "#C5A059", fontSize: 13 }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour
          </Link>
        </div>
      </header>

      {/* Contenu : largeur lecture confortable. */}
      <article className="mx-auto max-w-3xl px-6 py-12">
        <h1
          className="text-white"
          style={{
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          {title}
        </h1>
        {lastUpdated ? (
          <p
            className="mt-2"
            style={{ color: "#6B7280", fontSize: 13 }}
          >
            Dernière mise à jour : {lastUpdated}
          </p>
        ) : null}

        {/* Wrapper de prose pour le contenu : tailles, espacements,
            couleurs cohérentes pour h2/h3/p/ul. */}
        <div
          className="legal-prose mt-10"
          style={{ color: "#C8CACE", fontSize: 15, lineHeight: 1.75 }}
        >
          {children}
        </div>
      </article>

      <footer
        className="border-t"
        style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-center px-6 py-6">
          <LegalFooter />
        </div>
      </footer>

      {/* Styles spécifiques au contenu prose : on évite Tailwind Typography
          pour rester cohérent avec la palette du site (or sur titres). */}
      <style jsx global>{`
        .legal-prose h2 {
          color: #ffffff;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.01em;
          margin-top: 36px;
          margin-bottom: 12px;
        }
        .legal-prose h3 {
          color: #ffffff;
          font-size: 17px;
          font-weight: 600;
          margin-top: 24px;
          margin-bottom: 8px;
        }
        .legal-prose p {
          margin-bottom: 14px;
        }
        .legal-prose ul {
          list-style: disc;
          padding-left: 1.25rem;
          margin-bottom: 14px;
        }
        .legal-prose ul li {
          margin-bottom: 6px;
        }
        .legal-prose a {
          color: #c5a059;
          text-decoration: underline;
          text-decoration-color: rgba(197, 160, 89, 0.4);
        }
        .legal-prose a:hover {
          text-decoration-color: #c5a059;
        }
        .legal-prose strong {
          color: #ffffff;
          font-weight: 600;
        }
      `}</style>
    </main>
  );
}
