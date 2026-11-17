import { createLogger, type LogRecord } from "@/lib/logger";
import { sendToBackground } from "@/lib/context-safety";

// Popup and options logs go to the background buffer, so the diagnostics tab can show them.
export function createUiLogger(scope: "popup" | "options") {
  return createLogger({
    scope,
    source: scope,
    sink: (record: LogRecord) => {
      void sendToBackground({ type: "debug-log", record });
    },
  });
}
