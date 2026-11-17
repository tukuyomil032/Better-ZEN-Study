import "@/components/arc/foundation.css";
import "@/shell/fonts.css";
import "./shell.css";
// The consent screen's look, in ArcUI's tokens. Only the shell's own pages get it (see the file).
import "./consent.css";
import { browser } from "wxt/browser";
import { createRoot, type Root } from "react-dom/client";
import { App } from "@/shell/app";
import { ApiContext, StudyContext, type ApiGet, type StudyReader } from "@/shell/data";
import type { StudyLog } from "@/lib/pace";
import { createLogger, type LogRecord } from "@/lib/logger";
import { classifyPath, type Route } from "@/lib/routes";
import type { Settings } from "@/lib/settings";
import { getSettings, watchSettings } from "@/lib/settings-storage";
import { startOverlayGuard } from "@/shell/overlay-guard";
import { sendToBackground } from "@/lib/context-safety";

// Replaces ZEN Study's own frame on the screens the shell draws (see screenEnabled) with the
// ArcUI shell. The site's markup is only hidden, never removed. When the shell goes away the
// page reloads, so the site's own router starts from the right address.
const SHELL_ID = "bzs-app";
const SHELL_ATTRIBUTE = "data-bzs-shell";

type ApiGetResponse =
  | { ok: true; body: unknown }
  | { ok: false; status?: number; error: string }
  | undefined;

// Reads through the background, which holds the user's cookies. The screens never fetch.
const apiViaBackground: ApiGet = async (path) => {
  const response = (await browser.runtime.sendMessage({
    type: "api-get",
    path,
  })) as ApiGetResponse;
  if (!response) throw new Error("No response from the background");
  if (!response.ok) throw new Error(response.error);
  return response.body;
};

// The study record is read through the background, like everything else the shell needs.
const studyViaBackground: StudyReader = async () => {
  const response = (await browser.runtime.sendMessage({ type: "get-study-log" })) as
    | { ok: true; log: StudyLog }
    | { ok: false }
    | undefined;
  const settings = await getSettings();
  return {
    log: response?.ok ? response.log : { days: {} },
    plan: settings.plan,
    includeSupplement: settings.autoplay.includeSupplement,
  };
};

// Which screens the shell draws, and which setting turns each one off.
export function screenEnabled(settings: Settings, route: Route): boolean {
  if (!settings.skin.enabled) return false;
  switch (route.kind) {
    case "my_course":
      return settings.skin.dashboard;
    case "month":
      return settings.skin.month;
    case "course":
    case "chapter":
      return settings.skin.chapter;
    case "movie":
    case "material":
    case "short_test":
      return settings.skin.media;
    default:
      return false;
  }
}

export default defineContentScript({
  matches: ["https://www.nnn.ed.nico/*"],
  runAt: "document_idle",
  main(ctx) {
    const log = createLogger({
      scope: "shell",
      source: "skin",
      sink: (record: LogRecord) => {
        void sendToBackground({ type: "debug-log", record });
      },
    });

    let reactRoot: Root | undefined;
    let host: HTMLElement | undefined;
    // Stops the site's own copies of a player while the shell is shown.
    let stopOverlayGuard: (() => void) | undefined;

    const isMounted = () => reactRoot !== undefined;

    const unmount = () => {
      stopOverlayGuard?.();
      stopOverlayGuard = undefined;
      if (reactRoot) reactRoot.unmount();
      reactRoot = undefined;
      host?.remove();
      host = undefined;
      document.documentElement.removeAttribute(SHELL_ATTRIBUTE);
    };

    const mount = () => {
      if (isMounted()) return;
      try {
        host = document.createElement("div");
        host.id = SHELL_ID;
        document.body.appendChild(host);
        reactRoot = createRoot(host);
        reactRoot.render(
          <ApiContext.Provider value={apiViaBackground}>
            <StudyContext.Provider value={studyViaBackground}>
              <App
                onOpenPage={(tab) => {
                  // The background opens the settings page; the shell only names the section.
                  void browser.runtime
                    .sendMessage({ type: "open-options", tab })
                    .catch(() => undefined);
                }}
              />
            </StudyContext.Provider>
          </ApiContext.Provider>,
        );
        document.documentElement.setAttribute(SHELL_ATTRIBUTE, "on");
        stopOverlayGuard = startOverlayGuard(document, log);
        log.info("shell shown", { pathname: location.pathname });
      } catch (error) {
        log.error("shell failed; keeping the site's screen", { error: String(error) });
        unmount();
      }
    };

    // Decides, for the current address and settings, whether the shell should be on screen.
    let shownBefore = false;
    let syncing = false;
    let pending = false;
    const sync = async () => {
      if (syncing) {
        pending = true;
        return;
      }
      syncing = true;
      try {
        const settings = await getSettings();
        const route = classifyPath(location.pathname);
        if (screenEnabled(settings, route)) {
          mount();
          shownBefore = true;
        } else if (isMounted()) {
          unmount();
          // The site's router did not see the moves made inside the shell, so its page would be
          // stale. A reload brings the site's own screen back for the new address.
          if (shownBefore) {
            shownBefore = false;
            log.info("leaving the shell; reloading the site's own screen");
            window.location.reload();
          }
        }
      } catch (error) {
        log.error("shell sync failed", { error: String(error) });
      } finally {
        syncing = false;
        if (pending) {
          pending = false;
          void sync();
        }
      }
    };

    // Moves inside the site's SPA, and moves made by the shell itself with pushState.
    ctx.addEventListener(window, "wxt:locationchange", () => {
      void sync();
    });

    // Turning a screen off in settings takes effect at once.
    ctx.onInvalidated(
      watchSettings(() => {
        void sync();
      }),
    );

    ctx.onInvalidated(unmount);

    void sync();
  },
});
