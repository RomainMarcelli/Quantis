// File: app/layout.tsx
// Role: layout racine Next.js qui applique font, metadata et initialisation du theme global.
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ScrollRevealInitializer } from "@/components/ui/ScrollRevealInitializer";
import { ThemeInitializer } from "@/components/ui/ThemeInitializer";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-quantis"
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-quantis-mono"
});

export const metadata: Metadata = {
  title: "Quantis",
  description: "Quantis - Plateforme d'intelligence financière",
  icons: {
    icon: "/images/LogoV3.png",
    apple: "/images/LogoV3.png",
    shortcut: "/images/LogoV3.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${inter.variable} ${jetBrainsMono.variable} premium-app-shell`}>
        <ThemeInitializer />
        <ScrollRevealInitializer />
        {children}
      </body>
    </html>
  );
}
