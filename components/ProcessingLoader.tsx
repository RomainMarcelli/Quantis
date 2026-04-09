type ProcessingLoaderProps = {
  isVisible: boolean;
  progress: number;
  currentStep: string;
  elapsedSeconds: number;
  remainingSeconds: number | null;
};

export function ProcessingLoader(props: ProcessingLoaderProps) {
  const { isVisible, progress, currentStep, elapsedSeconds, remainingSeconds } = props;

  if (!isVisible) {
    return null;
  }

  return (
    <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-white/70">
        <span>{currentStep}</span>
        <span>{Math.round(progress)}%</span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-quantis-gold transition-[width] duration-300 ease-out"
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-white/60">
        <span>
          Temps ecoule reel: {Math.floor(Math.max(0, elapsedSeconds))} s ({formatDuration(elapsedSeconds)})
        </span>
        <span>
          Temps estime restant:{" "}
          {remainingSeconds === null ? "calcul en cours..." : `${Math.floor(Math.max(0, remainingSeconds))} s`}
        </span>
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}
