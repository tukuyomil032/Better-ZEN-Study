import { isSiteModalOpen, shouldStopFrame, type WindowFacts } from "@/lib/overlay-guard";
import type { Logger } from "@/lib/logger";

// Marks a frame the shell has stopped, so it is not stopped twice.
const STOPPED_ATTRIBUTE = "data-bzs-neutralized";
// Set on html while one of the site's own windows (a modal) is on screen.
const SITE_MODAL_ATTRIBUTE = "data-bzs-site-modal";
// The watch also looks once a second, so a change that a mutation did not report is caught too.
const RECHECK_MS = 1000;

function pathOf(src: string | null): string {
  if (!src) return "";
  try {
    return new URL(src, location.href).pathname;
  } catch {
    return "";
  }
}

// Stops the site's own copies of a player while the shell is on screen, and keeps stopping any that
// appear later (the site's router opens its window after a reload, and after a move). A stopped frame
// is pointed at about:blank, so it loads nothing and plays nothing. The site's markup is not removed,
// so the site's own screen comes back unchanged when the shell goes away.
//
// It also tracks whether a site window (the movie window, or the consent screen) is open. A window is
// found by its overlay, wherever the site drew it. While one is open, html gets data-bzs-site-modal,
// which the shell's stylesheet reads to give the window the site's text size. Returns the stop function.
export function startOverlayGuard(doc: Document, log: Pick<Logger, "info">): () => void {
  let modalOpen = false;

  // What the watch sees on the page right now: each window, and counts for the diagnostics.
  const facts = () => {
    const windows: WindowFacts[] = Array.from(doc.querySelectorAll(".ReactModal__Overlay")).map(
      (overlay) => ({
        hasStoppedFrame: overlay.querySelector(`iframe[${STOPPED_ATTRIBUTE}]`) !== null,
      }),
    );
    return {
      windows,
      counts: {
        windows: windows.length,
        stopped: windows.filter((item) => item.hasStoppedFrame).length,
      },
    };
  };

  const checkModal = () => {
    const { windows, counts } = facts();
    const open = isSiteModalOpen(windows);
    if (open === modalOpen) return;
    modalOpen = open;
    if (open) {
      doc.documentElement.setAttribute(SITE_MODAL_ATTRIBUTE, "");
      log.info("site's own window opened: the shell's text size gives way to the site's", counts);
    } else {
      doc.documentElement.removeAttribute(SITE_MODAL_ATTRIBUTE);
      log.info("site's own window closed: the shell's text size is back", counts);
    }
  };

  const sweep = () => {
    for (const frame of Array.from(doc.querySelectorAll("iframe"))) {
      const src = frame.getAttribute("src");
      const stop = shouldStopFrame({
        insideWindow: frame.closest(".ReactModal__Overlay") !== null,
        insideShell: frame.closest("#bzs-app") !== null,
        alreadyStopped: frame.hasAttribute(STOPPED_ATTRIBUTE),
        src,
        base: location.href,
      });
      if (!stop) continue;
      frame.setAttribute(STOPPED_ATTRIBUTE, "");
      frame.setAttribute("src", "about:blank");
      log.info("site's own player window stopped while the shell is shown", {
        path: pathOf(src),
      });
    }
    checkModal();
  };

  // Recorded once at the start, so a report shows whether this watch ran on the page at all.
  log.info("サイトの窓の見張りを始めました", {
    ...facts().counts,
    frames: doc.querySelectorAll("iframe").length,
  });

  sweep();
  // The shell's own screens change all the time inside #bzs-app, and none of those changes can open or
  // close a site window, so only changes outside the shell lead to another sweep.
  const observer = new MutationObserver((records) => {
    const outsideShell = records.some((record) => {
      const node = record.target instanceof Element ? record.target : record.target.parentElement;
      return !node?.closest("#bzs-app");
    });
    if (outsideShell) sweep();
  });
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"],
  });
  const timer = window.setInterval(sweep, RECHECK_MS);

  return () => {
    window.clearInterval(timer);
    observer.disconnect();
    doc.documentElement.removeAttribute(SITE_MODAL_ATTRIBUTE);
    modalOpen = false;
  };
}
