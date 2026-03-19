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
      <body className={manrope.variable}>
        <ThemeInitializer />
        {children}
      </body>
    </html>
  );
}
