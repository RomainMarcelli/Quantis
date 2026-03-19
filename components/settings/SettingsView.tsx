"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { applyTheme, getStoredTheme } from "@/components/ui/ThemeInitializer";

export function SettingsView() {
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">(getStoredTheme());

  function onToggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <section className="space-y-6">
      <header className="quantis-panel flex items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <QuantisLogo withText={false} size={24} />
          <div>
            <h1 className="text-2xl font-semibold text-quantis-carbon">Parametres</h1>
            <p className="text-sm text-quantis-slate">Personnalisation de votre espace</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/analysis")}
          className="rounded-xl border border-quantis-mist bg-white px-3 py-2 text-sm text-quantis-carbon hover:bg-quantis-paper"
        >
          Retour dashboard
        </button>
      </header>

      <section className="quantis-panel p-5">
        <h2 className="text-sm font-semibold text-quantis-carbon">Theme</h2>
        <p className="mt-1 text-sm text-quantis-slate">
          Activez le mode jour ou nuit selon vos preferences.
        </p>

        <button
          type="button"
          onClick={onToggleTheme}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-quantis-mist bg-white px-4 py-2 text-sm font-medium text-quantis-carbon hover:bg-quantis-paper"
        >
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          {theme === "light" ? "Passer en mode nuit" : "Passer en mode jour"}
        </button>
      </section>
    </section>
  );
}
