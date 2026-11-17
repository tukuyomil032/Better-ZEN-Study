import "@/shell/fonts.css";
import "./frame.css";
import { getSettings, watchSettings } from "@/lib/settings-storage";
import type { Settings } from "@/lib/settings";
import { watchRecolor } from "./recolor";

// Runs in the frames that hold the player and the question and report pages (/contents/...).
// It marks the frame while the shell's media screens are on, and gives it the shell's theme, so
// frame.css can match the colours to the shell. The site's own content is never changed for good:
// when the frame stops being skinned, the recolouring is taken back.
const DARK_QUERY = "(prefers-color-scheme: dark)";

function resolvedTheme(appearance: Settings["appearance"]): "dark" | "light" {
  if (appearance.theme === "dark") return "dark";
  if (appearance.theme === "light") return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

let stopRecolor: (() => void) | undefined;

function stop(): void {
  stopRecolor?.();
  stopRecolor = undefined;
}

function apply(settings: Settings): void {
  const root = document.documentElement;
  if (!(settings.skin.enabled && settings.skin.media)) {
    root.removeAttribute("data-bzs-frame");
    root.removeAttribute("data-bzs-theme");
    stop();
    return;
  }
  const theme = resolvedTheme(settings.appearance);
  root.setAttribute("data-bzs-frame", "on");
  root.setAttribute("data-bzs-theme", theme);
  // The dark theme also recolours surfaces found by value; the light theme keeps the site.
  if (theme === "dark") {
    if (!stopRecolor) stopRecolor = watchRecolor();
  } else {
    stop();
  }
}

export default defineContentScript({
  matches: ["https://www.nnn.ed.nico/contents/*"],
  allFrames: true,
  runAt: "document_start",
  async main() {
    try {
      const settings = await getSettings();
      apply(settings);
      // Follows the settings page and the operating system's theme switch.
      watchSettings((next) => apply(next));
      window.matchMedia(DARK_QUERY).addEventListener("change", () => {
        void getSettings()
          .then(apply)
          .catch(() => undefined);
      });
    } catch {
      // Leave the page as the site built it.
    }
  },
});
