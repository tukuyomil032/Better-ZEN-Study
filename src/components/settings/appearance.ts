import type { Settings } from "@/lib/settings";

// Sets data-theme and data-accent on <html>. For "system" the OS setting is resolved here
// and kept in step with later changes, so the tokens always match the chosen theme.
// Returns a cleanup function that stops listening to the OS setting.
export function applyAppearance(
  appearance: Settings["appearance"],
  root: HTMLElement = document.documentElement,
): () => void {
  root.setAttribute("data-accent", appearance.accent);
  if (appearance.theme !== "system") {
    root.setAttribute("data-theme", appearance.theme);
    return () => undefined;
  }

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => root.setAttribute("data-theme", media.matches ? "dark" : "light");
  apply();
  media.addEventListener("change", apply);
  return () => media.removeEventListener("change", apply);
}

// Rounds a speed to the nearest step, so a slider drag never stores 1.2000000000000002.
export function snapSpeed(value: number, step: number): number {
  const snapped = Math.round((value - 0.5) / step) * step + 0.5;
  return Math.round(snapped * 100) / 100;
}
