import { describe, expect, it } from "vitest";
import { getKpiDiagnostic, pickSuggestedQuestion } from "@/lib/kpi/kpiDiagnostic";

describe("getKpiDiagnostic", () => {
  it("returns 'neutral' when value is null or undefined", () => {
    expect(getKpiDiagnostic(null, { danger: 0, warning: 5, good: 10 })).toBe("neutral");
    expect(getKpiDiagnostic(undefined, { danger: 0, warning: 5, good: 10 })).toBe("neutral");
  });

  it("returns 'neutral' when no thresholds are provided", () => {
    expect(getKpiDiagnostic(42, undefined)).toBe("neutral");
    expect(getKpiDiagnostic(42, {})).toBe("neutral");
  });

  it("ascending thresholds (CA-style): higher = better", () => {
    const t = { danger: 0, warning: 3, good: 10 };
    expect(getKpiDiagnostic(15, t)).toBe("good");
    expect(getKpiDiagnostic(10, t)).toBe("good");
    expect(getKpiDiagnostic(5, t)).toBe("warning");
    expect(getKpiDiagnostic(2, t)).toBe("danger");
    expect(getKpiDiagnostic(-5, t)).toBe("danger");
  });

  it("descending thresholds (DSO-style): lower = better", () => {
    const t = { good: 45, warning: 75, danger: 120 };
    expect(getKpiDiagnostic(30, t)).toBe("good");
    expect(getKpiDiagnostic(45, t)).toBe("good");
    expect(getKpiDiagnostic(60, t)).toBe("warning");
    expect(getKpiDiagnostic(150, t)).toBe("danger");
  });

  it("partial thresholds (just danger): used as cutoff", () => {
    expect(getKpiDiagnostic(-50_000, { danger: 0 })).toBe("danger");
    expect(getKpiDiagnostic(50_000, { danger: 0 })).toBe("neutral");
  });
});

describe("pickSuggestedQuestion", () => {
  const sq = {
    suggestedQuestions: {
      whenGood: "Comment maintenir cette dynamique ?",
      whenBad: "Quels leviers pour redresser ?",
    },
  };

  it("returns whenGood for good diagnostic", () => {
    expect(pickSuggestedQuestion(sq, "good")).toBe("Comment maintenir cette dynamique ?");
  });

  it("returns whenBad for warning, danger and neutral", () => {
    expect(pickSuggestedQuestion(sq, "warning")).toBe("Quels leviers pour redresser ?");
    expect(pickSuggestedQuestion(sq, "danger")).toBe("Quels leviers pour redresser ?");
    expect(pickSuggestedQuestion(sq, "neutral")).toBe("Quels leviers pour redresser ?");
  });
});
