import { describe, expect, it } from "vitest";
import { buildGranularInsights } from "@/services/integrations/aggregations/granularInsightsBuilder";
import { fixturePartialPayments, fixtureRefunds } from "@/services/integrations/aggregations/__tests__/fixtures";

const PERIOD = {
  periodStart: new Date("2026-01-01"),
  periodEnd: new Date("2026-12-31"),
  asOf: new Date("2026-04-30"),
};

describe("granularInsightsBuilder", () => {
  it("calcule top clients + concentration sur factures partiellement payées", () => {
    const { invoices, contacts } = fixturePartialPayments();
    const insights = buildGranularInsights({ invoices, contacts, options: PERIOD });

    // 3 factures valides (la 4e a une date vide → skippée).
    expect(insights.customers.total).toBe(3);
    // Top 1 = Client C (8000€)
    expect(insights.customers.topByRevenue[0]?.name).toBe("Client C");
    expect(insights.customers.topByRevenue[0]?.revenue).toBe(8000);
    // Concentration top5 = 100% (3 clients)
    expect(insights.customers.concentration.top5Share).toBe(1);
  });

  it("respecte le statut paid/partially_paid/overdue dans les receivables", () => {
    const { invoices, contacts } = fixturePartialPayments();
    const insights = buildGranularInsights({ invoices, contacts, options: PERIOD });

    // Outstanding = factures non "paid" et non "cancelled"
    // Client B (3000 + TVA = 3600 partially_paid) + Client C (8000 + TVA = 9600 overdue)
    expect(insights.receivables.totalOutstanding).toBe(13200);
    // Overdue = factures avec dueDate < asOf et non payées : Client B (paidDate < asOf donc not overdue logically?)
    // En réalité notre filtre est `inv.dueDate && new Date(inv.dueDate) < asOf && status !== paid/cancelled`.
    // Client B : status partially_paid → outstanding ; dueDate 2026-03-12 < asOf 2026-04-30 → overdue
    // Client C : status overdue, dueDate 2026-04-04 < asOf 2026-04-30 → overdue
    expect(insights.receivables.overdueCount).toBe(2);
  });

  it("calcule un DSO sur les factures payées", () => {
    const { invoices, contacts } = fixturePartialPayments();
    const insights = buildGranularInsights({ invoices, contacts, options: PERIOD });
    // Client A : facturé 2026-01-15, payé 2026-02-10 → 26 jours
    // Client B : facturé 2026-02-10, payé 2026-03-20 → 38 jours
    // Moyenne = 32 jours
    expect(insights.receivables.averageDSO).toBe(32);
  });

  it("traite les avoirs comme du CA négatif sans crasher", () => {
    const { invoices } = fixtureRefunds();
    const insights = buildGranularInsights({ invoices, contacts: [], options: PERIOD });
    // 2 invoices : 1000 + (-300) = 700€ en revenue net
    expect(insights.customers.topByRevenue[0]?.revenue).toBe(700);
  });

  it("skippe les invoices avec date vide ou montants non finis", () => {
    const { invoices, contacts } = fixturePartialPayments();
    // L'invoice #4 a une date vide → doit être ignorée. La fixture renvoie 4 invoices au total.
    expect(invoices).toHaveLength(4);
    const insights = buildGranularInsights({ invoices, contacts, options: PERIOD });
    expect(insights.customers.total).toBe(3); // pas 4
  });

  it("regroupe par secteur (sectorBreakdown)", () => {
    const { invoices, contacts } = fixturePartialPayments();
    const insights = buildGranularInsights({ invoices, contacts, options: PERIOD });
    const sectors = insights.customers.sectorBreakdown.map((s) => s.sector);
    expect(sectors).toContain("industrie"); // Client A
    expect(sectors).toContain("services");  // Client C
    expect(sectors).toContain("Non renseigné"); // Client B (sector null)
  });

  it("revenue timeline contient les 12 mois même si certains sont à 0", () => {
    const { invoices, contacts } = fixturePartialPayments();
    const insights = buildGranularInsights({ invoices, contacts, options: PERIOD });
    expect(insights.revenueTimeline).toHaveLength(12);
    const nonZero = insights.revenueTimeline.filter((m) => m.totalRevenue > 0);
    // Client A en jan, Client B en feb, Client C en mar
    expect(nonZero.length).toBe(3);
    expect(nonZero.find((m) => m.month === "2026-01")?.totalRevenue).toBe(5000);
  });

  it("ne crashe pas avec invoices = []", () => {
    expect(() =>
      buildGranularInsights({ invoices: [], contacts: [], options: PERIOD })
    ).not.toThrow();
    const insights = buildGranularInsights({ invoices: [], contacts: [], options: PERIOD });
    expect(insights.customers.total).toBe(0);
    expect(insights.customers.concentration.hhi).toBe(0);
  });
});
