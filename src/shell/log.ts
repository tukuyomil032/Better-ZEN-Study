import { browser } from "wxt/browser";
import { createLogger, type LogRecord } from "@/lib/logger";
import { sendToBackground } from "@/lib/context-safety";

// The shell's own log. Records go to the background like the content scripts' records do, and
// carry the page address they were written on, so the diagnostics can say which screen it was.
export const shellLog = createLogger({
  scope: "shell",
  source: "skin",
  path: () => location.pathname,
  sink: (record: LogRecord) => {
    // Written in dev and in tests, where there is no extension to send to: nothing is kept there.
    if (typeof browser === "undefined" || !browser.runtime) return;
    void sendToBackground({ type: "debug-log", record });
  },
});
