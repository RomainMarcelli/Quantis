// File: app/layout.tsx
// Role: layout racine Next.js qui applique font, metadata et initialisation du theme global.
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { ThemeInitializer } from "@/components/ui/ThemeInitializer";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-quantis"
});

export const metadata: Metadata = {
  title: "Quantis",
  description: "Quantis - Plateforme d'intelligence financiere",
  icons: {
    icon: "/images/logo.png",
    apple: "/images/logo.png",
    shortcut: "/images/logo.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${manrope.variable} premium-app-shell`}>
        <ThemeInitializer />
        {children}
      </body>
    </html>
  );
}
