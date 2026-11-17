// Which frames on the page are copies of a site player that the shell must stop, and whether one of the
// site's own windows is open. Pure, so it can be tested without a page.
//
// The site draws its windows (react-modal) in more than one place: the movie window sits in the
// standard .ReactModalPortal beside #root, while the consent screen sits in a portal with the site's own
// name. The one thing every window shares is its overlay, .ReactModal__Overlay, so the shell looks for
// that, wherever the window is.
//
// After a reload on a movie page, the movie window holds a second copy of the movie player. The shell
// hides that window and stops the copy from loading, so only the shell's player plays. The shell's own
// player sits inside #bzs-app and is never touched.

import { isSitePlayerSrc } from "./player-frame";

export type FrameFacts = {
  // The frame sits inside one of the site's windows (a .ReactModal__Overlay).
  insideWindow: boolean;
  // The frame is the shell's own (inside #bzs-app).
  insideShell: boolean;
  // The frame was already stopped by the shell.
  alreadyStopped: boolean;
  // The frame's src attribute.
  src: string | null;
  // The page's own address, which relative sources are read against.
  base: string;
};

export function shouldStopFrame(facts: FrameFacts): boolean {
  if (facts.alreadyStopped || facts.insideShell || !facts.insideWindow) return false;
  return isSitePlayerSrc(facts.src, facts.base);
}

// One of the site's windows on the page, as the shell sees it.
export type WindowFacts = {
  // The window holds a player copy the shell has stopped. Such a window is hidden by the shell, so it
  // does not count as a window the learner is looking at.
  hasStoppedFrame: boolean;
};

// Whether a window of the site's own is on screen. The shell lifts its 16px base size only then, so
// the site's rem-based windows come out at the site's size.
export function isSiteModalOpen(windows: readonly WindowFacts[]): boolean {
  return windows.some((item) => !item.hasStoppedFrame);
}
