import { describe, expect, test } from "bun:test";
import {
  frameBySource,
  isSitePlayerSrc,
  parsePlayerEnded,
  parsePlayerPath,
} from "../src/lib/player-frame";

describe("parsePlayerPath", () => {
  test("reads the address of a movie player, with or without a trailing slash", () => {
    expect(parsePlayerPath("/contents/courses/302/chapters/4147/movies/41600")).toEqual({
      courseId: 302,
      chapterId: 4147,
      movieId: 41600,
    });
    expect(parsePlayerPath("/contents/courses/302/chapters/4147/movies/41600/")).toEqual({
      courseId: 302,
      chapterId: 4147,
      movieId: 41600,
    });
  });

  test("a side frame under a movie (reference slides) is not a player", () => {
    expect(
      parsePlayerPath("/contents/courses/302/chapters/4147/movies/41602/references/7527"),
    ).toBeUndefined();
  });

  test("a practice problem, a guide, or the shell's own address is not a movie player", () => {
    expect(parsePlayerPath("/contents/courses/302/chapters/4147/exercise/9021")).toBeUndefined();
    expect(parsePlayerPath("/courses/302/chapters/4147/movie/41600")).toBeUndefined();
    expect(parsePlayerPath("/contents/courses/302/chapters/x/movies/41600")).toBeUndefined();
  });
});

describe("isSitePlayerSrc", () => {
  const base = "https://www.nnn.ed.nico/courses/302/chapters/4147/movie/41600";

  test("accepts the site's own content addresses, absolute or relative", () => {
    expect(
      isSitePlayerSrc(
        "https://www.nnn.ed.nico/contents/courses/302/chapters/4147/movies/41600?content_type=n-yobi",
        base,
      ),
    ).toBe(true);
    expect(isSitePlayerSrc("/contents/courses/302/chapters/4147/movies/41600", base)).toBe(true);
  });

  test("refuses an empty source, a blank frame, another site, and a page that is not content", () => {
    expect(isSitePlayerSrc(null, base)).toBe(false);
    expect(isSitePlayerSrc("about:blank", base)).toBe(false);
    expect(isSitePlayerSrc("https://example.com/contents/courses/1", base)).toBe(false);
    expect(isSitePlayerSrc("https://www.nnn.ed.nico/courses/302", base)).toBe(false);
  });
});

describe("frameBySource", () => {
  test("picks the frame whose window sent the message, even when it is not the first frame", () => {
    const siteCopy = { name: "site copy", contentWindow: { id: "copy" } };
    const shellPlayer = { name: "shell player", contentWindow: { id: "shell" } };
    const frames = [siteCopy, shellPlayer];
    expect(frameBySource(frames, shellPlayer.contentWindow)?.name).toBe("shell player");
  });

  test("returns nothing for a message from a window that is not on the page", () => {
    const frames = [{ contentWindow: { id: "a" } }];
    expect(frameBySource(frames, { id: "stranger" })).toBeUndefined();
    expect(frameBySource(frames, null)).toBeUndefined();
    expect(frameBySource(frames, undefined)).toBeUndefined();
  });
});

describe("parsePlayerEnded", () => {
  test("reads the end of a movie with the learner's answer", () => {
    expect(
      parsePlayerEnded({ source: "better-report", type: "ended", movieId: 41600, answer: "good" }),
    ).toEqual({ movieId: 41600, answer: "good" });
  });

  test("an end without an answer is kept, with no answer, as an older player sends it", () => {
    expect(parsePlayerEnded({ source: "better-report", type: "ended", movieId: 7 })).toEqual({
      movieId: 7,
      answer: undefined,
    });
  });

  test("refuses messages that are not a movie's end, or that have the wrong shape", () => {
    expect(parsePlayerEnded({ source: "other", type: "ended", movieId: 1 })).toBeUndefined();
    expect(parsePlayerEnded({ source: "better-report", type: "hotkey", key: "]" })).toBeUndefined();
    expect(
      parsePlayerEnded({ source: "better-report", type: "ended", movieId: "1" }),
    ).toBeUndefined();
    expect(parsePlayerEnded(null)).toBeUndefined();
    expect(parsePlayerEnded("ended")).toBeUndefined();
  });

  test("an answer that is not one of the four is dropped, and the end still counts", () => {
    expect(
      parsePlayerEnded({ source: "better-report", type: "ended", movieId: 3, answer: "yes" }),
    ).toEqual({ movieId: 3, answer: undefined });
  });
});
