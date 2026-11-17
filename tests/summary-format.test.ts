import { describe, expect, test } from "bun:test";
import { chapterKey, formatChapterTotal, formatSubjectLine } from "../src/lib/summary-format";

describe("formatChapterTotal", () => {
  test("shows the movie count and total time in h:mm:ss", () => {
    expect(formatChapterTotal(17, 7542, "hms")).toBe("動画17本 ・ 総再生時間 2:05:42");
  });

  test("uses the Japanese time style when selected", () => {
    expect(formatChapterTotal(17, 7542, "ja")).toBe("動画17本 ・ 総再生時間 2時間5分");
  });

  test("handles a chapter with no movies", () => {
    expect(formatChapterTotal(0, 0, "hms")).toBe("動画0本 ・ 総再生時間 0:00");
  });
});

describe("formatSubjectLine", () => {
  test("combines movies, time, tests and reports", () => {
    expect(
      formatSubjectLine({
        movieCount: 17,
        movieSeconds: 7542,
        testCount: 4,
        reportCount: 2,
        style: "hms",
      }),
    ).toBe("動画17本 ・ 2:05:42 ・ テスト4回 ・ レポート2件");
  });
});

describe("chapterKey", () => {
  test("joins course and chapter ids", () => {
    expect(chapterKey(2472, 31713)).toBe("2472:31713");
  });
});
