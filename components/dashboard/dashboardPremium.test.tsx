// File: components/dashboard/dashboardPremium.test.tsx
// Role: tests unitaires de rendu statique des composants dashboard premium (fallbacks + composition).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { KPIBlock } from "@/components/dashboard/KPIBlock";
import { KPIWide } from "@/components/dashboard/KPIWide";

describe("premium dashboard components", () => {
  it("renders KPIBlock fallback when value is null", () => {
    const html = renderToStaticMarkup(
      <KPIBlock
        title="Ce qui rentre"
        tag="Chiffre d'Affaires"
        value={null}
        format="currency"
        icon={<span>Icon</span>}
      />
    );

    expect(html).toContain("N/D");
  });

  it("renders KPIWide target label and value zone", () => {
    const html = renderToStaticMarkup(
      <KPIWide
        title="Ce qu'il reste vraiment"
        tag="Excedent Brut d'Exploitation"
        value={32000}
      />
    );

    expect(html).toContain("Objectif");
    expect(html).toContain("Excedent Brut d&#x27;Exploitation");
  });

  it("keeps child sections rendered inside DashboardLayout", () => {
    const html = renderToStaticMarkup(
      <DashboardLayout
        companyName="Quantis"
        greetingName="Romain"
        kpis={{
          ca: 100000,
          tresorerie: 23000,
          ebe: 20000,
          healthScore: 85,
          croissance: 0.12,
          runway: 5.5
        }}
      >
        <div data-testid="secondary-block">Secondary Block</div>
      </DashboardLayout>
    );

    expect(html).toContain("Cockpit financier");
    expect(html).toContain("Secondary Block");
  });
});
