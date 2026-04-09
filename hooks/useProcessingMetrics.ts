import { useCallback, useEffect, useMemo, useState } from "react";

const DURATION_HISTORY_KEY = "quantis.pdfParser.durationHistory";
const MAX_HISTORY_LENGTH = 12;

export function useProcessingMetrics() {
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [durationHistory, setDurationHistory] = useState<number[]>([]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setDurationHistory(readDurationHistory());
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

  useEffect(() => {
    if (startedAtMs === null) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setElapsedSeconds((Date.now() - startedAtMs) / 1000);
    }, 200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [startedAtMs]);

  const estimatedDurationSeconds = useMemo(() => {
    if (durationHistory.length < 2) {
      return null;
    }
    const total = durationHistory.reduce((sum, duration) => sum + duration, 0);
    return total / durationHistory.length;
  }, [durationHistory]);

  const remainingSeconds = useMemo(() => {
    if (startedAtMs === null || estimatedDurationSeconds === null) {
      return null;
    }
    return Math.max(0, Math.ceil(estimatedDurationSeconds - elapsedSeconds));
  }, [elapsedSeconds, estimatedDurationSeconds, startedAtMs]);

  const startRun = useCallback(() => {
    const now = Date.now();
    setStartedAtMs(now);
    setElapsedSeconds(0);
    return now;
  }, []);

  const stopRun = useCallback((startedAt: number) => {
    const durationSeconds = (Date.now() - startedAt) / 1000;
    const nextHistory = [...durationHistory, durationSeconds]
      .slice(-MAX_HISTORY_LENGTH)
      .map((duration) => clampDuration(duration));

    setStartedAtMs(null);
    setElapsedSeconds(durationSeconds);
    setDurationHistory(nextHistory);
    writeDurationHistory(nextHistory);
  }, [durationHistory]);

  const reset = useCallback(() => {
    setStartedAtMs(null);
    setElapsedSeconds(0);
  }, []);

  return {
    elapsedSeconds,
    estimatedDurationSeconds,
    remainingSeconds,
    startRun,
    stopRun,
    reset
  };
}

function clampDuration(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  if (value < 1) {
    return 1;
  }
  if (value > 180) {
    return 180;
  }
  return value;
}

function readDurationHistory(): number[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(DURATION_HISTORY_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is number => typeof item === "number" && Number.isFinite(item))
      .map((duration) => clampDuration(duration))
      .slice(-MAX_HISTORY_LENGTH);
  } catch {
    return [];
  }
}

function writeDurationHistory(history: number[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(DURATION_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Non bloquant.
  }
}
