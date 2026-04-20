import { describe, expect, it } from "vitest";
import { buildKpiTrend, buildSignedTrend } from "@/lib/kpi/kpiTrend";

describe("buildKpiTrend", () => {
  it("returns up trend with percentage", () => {
    const trend = buildKpiTrend(120, 100);
    expect(trend.direction).toBe("up");
    expect(trend.label).toBe("+20.0%");
    expect(trend.tone).toBe("positive");
  });

  it("handles missing previous value", () => {
    const trend = buildKpiTrend(80, null);
    expect(trend.direction).toBe("na");
    expect(trend.label).toBe("N/D");
    expect(trend.tone).toBe("neutral");
  });

  it("builds a direct signed trend from a single variation value", () => {
    const trend = buildSignedTrend(-12.4);
    expect(trend.direction).toBe("down");
    expect(trend.label).toBe("-12.4%");
    expect(trend.tone).toBe("negative");
  });
});
