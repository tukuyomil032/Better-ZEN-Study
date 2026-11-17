export function formatDuration(seconds: number, style: "hms" | "ja"): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError("seconds must be a finite non-negative number");
  }

  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3_600);
  const minutes = Math.floor((wholeSeconds % 3_600) / 60);
  const remainderSeconds = wholeSeconds % 60;

  if (style === "ja") {
    return hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;
  }

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainderSeconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remainderSeconds).padStart(2, "0")}`;
}

export function sumSeconds(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}
