// Calls that must never throw into the page. When the extension is reloaded, a tab that was open
// before keeps its old content script, and that script's extension calls then fail: a runtime message
// throws "Extension context invalidated.", sometimes right away rather than as a rejected promise. The
// page does not need to know. Logging and cleanup simply stop, and a reload of the tab brings the new
// script.

import { browser } from "wxt/browser";

// Sends a message, and never throws. A failed send is reported as an undefined reply.
export function sendSafely(
  send: (message: unknown) => Promise<unknown>,
  message: unknown,
): Promise<unknown> {
  try {
    return send(message).catch(() => undefined);
  } catch {
    return Promise.resolve(undefined);
  }
}

// The message sender for the background, which the content scripts and the shell use for logs.
export function sendToBackground(message: unknown): Promise<unknown> {
  return sendSafely((value) => browser.runtime.sendMessage(value), message);
}

// Wraps a cleanup, so a context that was reloaded underneath it does not raise an error on the way out.
export function quietly(cleanup: () => void): () => void {
  return () => {
    try {
      cleanup();
    } catch {
      // The storage is gone with the old context; there is nothing left to clean up.
    }
  };
}
