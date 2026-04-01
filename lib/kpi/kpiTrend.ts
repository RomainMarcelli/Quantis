export type KpiTrendDirection = "up" | "down" | "flat" | "na";

export type KpiTrend = {
  direction: KpiTrendDirection;
  changePercent: number | null;
  label: string;
  tone: "positive" | "negative" | "neutral";
};

export function buildKpiTrend(current: number | null, previous: number | null): KpiTrend {
  if (current === null || previous === null) {
    return {
      direction: "na",
      changePercent: null,
      label: "N/D",
      tone: "neutral"
    };
  }

  if (previous === 0) {
    if (current === 0) {
      return {
        direction: "flat",
        changePercent: 0,
        label: "Stable",
        tone: "neutral"
      };
    }

    return {
      direction: current > 0 ? "up" : "down",
      changePercent: null,
      label: "Base 0",
      tone: current > 0 ? "positive" : "negative"
    };
  }

  const changePercent = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(changePercent) < 0.1) {
    return {
      direction: "flat",
      changePercent: 0,
      label: "Stable",
      tone: "neutral"
    };
  }

  if (changePercent > 0) {
    return {
      direction: "up",
      changePercent,
      label: `+${Math.abs(changePercent).toFixed(1)}%`,
      tone: "positive"
    };
  }

  return {
    direction: "down",
    changePercent,
    label: `-${Math.abs(changePercent).toFixed(1)}%`,
    tone: "negative"
  };
}

export function buildSignedTrend(value: number | null): KpiTrend {
  if (value === null) {
    return {
      direction: "na",
      changePercent: null,
      label: "N/D",
      tone: "neutral"
    };
  }

  if (Math.abs(value) < 0.1) {
    return {
      direction: "flat",
      changePercent: 0,
      label: "Stable",
      tone: "neutral"
    };
  }

  if (value > 0) {
    return {
      direction: "up",
      changePercent: value,
      label: `+${Math.abs(value).toFixed(1)}%`,
      tone: "positive"
    };
  }

  return {
    direction: "down",
    changePercent: value,
    label: `-${Math.abs(value).toFixed(1)}%`,
    tone: "negative"
  };
}
