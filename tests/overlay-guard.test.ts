import { describe, expect, test } from "bun:test";
import { isSiteModalOpen, shouldStopFrame, type FrameFacts } from "../src/lib/overlay-guard";

const base = "https://www.nnn.ed.nico/courses/302/chapters/4147/movie/41600";
const siteWindow: FrameFacts = {
  insideWindow: true,
  insideShell: false,
  alreadyStopped: false,
  src: "https://www.nnn.ed.nico/contents/courses/302/chapters/4147/movies/41600?content_type=n-yobi",
  base,
};

describe("shouldStopFrame", () => {
  test("stops the site's own movie window that the router opens beside the shell", () => {
    expect(shouldStopFrame(siteWindow)).toBe(true);
  });

  test("leaves the shell's own player alone, wherever it sits", () => {
    expect(shouldStopFrame({ ...siteWindow, insideShell: true })).toBe(false);
  });

  test("leaves a frame outside any site window alone", () => {
    expect(shouldStopFrame({ ...siteWindow, insideWindow: false })).toBe(false);
  });

  test("does not stop a frame twice", () => {
    expect(shouldStopFrame({ ...siteWindow, alreadyStopped: true })).toBe(false);
  });

  test("leaves a frame that is not a site content page alone, including one already blanked", () => {
    expect(shouldStopFrame({ ...siteWindow, src: "about:blank" })).toBe(false);
    expect(shouldStopFrame({ ...siteWindow, src: "https://example.com/contents/x" })).toBe(false);
    expect(shouldStopFrame({ ...siteWindow, src: null })).toBe(false);
  });
});

describe("isSiteModalOpen", () => {
  test("is false when the page holds no window", () => {
    expect(isSiteModalOpen([])).toBe(false);
  });

  test("is true when a site window is drawn", () => {
    expect(isSiteModalOpen([{ hasStoppedFrame: false }])).toBe(true);
  });

  test("ignores the movie window the shell hides, which has a stopped player in it", () => {
    expect(isSiteModalOpen([{ hasStoppedFrame: true }])).toBe(false);
  });

  test("is true when a stopped movie window and a consent screen are both present", () => {
    expect(isSiteModalOpen([{ hasStoppedFrame: true }, { hasStoppedFrame: false }])).toBe(true);
  });
});
