import { describe, expect, it } from "vitest";
import { buildPeriodFromDate, buildRolling12MonthsFromDate } from "@/lib/temporality/temporalityContext";

describe("buildRolling12MonthsFromDate", () => {
  it("returns a 12-month window ending on the given date with label '12 derniers mois'", () => {
    const date = new Date("2026-04-29T12:00:00.000Z");
    const state = buildRolling12MonthsFromDate(date);

    expect(state.granularity).toBe("year"); // compat picker
    expect(state.periodLabel).toBe("12 derniers mois");
    // Fenêtre = (J-12 mois +1) à J inclus.
    expect(state.periodStart).toBe("2025-04-30");
    expect(state.periodEnd).toBe("2026-04-29");
  });

  it("handles year boundaries cleanly", () => {
    const state = buildRolling12MonthsFromDate(new Date("2026-01-15T00:00:00.000Z"));
    expect(state.periodStart).toBe("2025-01-16");
    expect(state.periodEnd).toBe("2026-01-15");
  });
});

describe("buildPeriodFromDate (year)", () => {
  it("returns full calendar year regardless of the input month", () => {
    const state = buildPeriodFromDate(new Date("2026-04-29T00:00:00.000Z"), "year");
    expect(state.periodStart).toBe("2026-01-01");
    expect(state.periodEnd).toBe("2026-12-31");
    expect(state.periodLabel).toBe("Année 2026");
  });
});
