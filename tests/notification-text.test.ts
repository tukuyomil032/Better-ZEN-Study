import { expect, test } from "bun:test";
import { formatArrivalNotification, parseSubjectFromPageTitle } from "../src/lib/notification-text";

test("formats arrival notification with every title part", () => {
  expect(
    formatArrivalNotification({
      kind: "test",
      resourceType: "evaluation_test",
      subjectTitle: "地理探究",
      chapterTitle: "第9回",
      resourceTitle: "確認テスト",
    }),
  ).toEqual({
    title: "テストの画面に来ました",
    message: "地理探究 / 第9回\n確認テスト",
  });
});

test("names a practice problem arrival as an exercise, not a test or report", () => {
  expect(
    formatArrivalNotification({
      kind: "exercise",
      resourceType: "exercise",
      chapterTitle: "頻出表現集",
      resourceTitle: "演習 1",
      subjectTitle: "英文法",
    }),
  ).toEqual({ title: "演習の画面に来ました", message: "英文法 / 頻出表現集\n演習 1" });
});

test("omits missing chapter and resource titles without extra separators", () => {
  expect(
    formatArrivalNotification({
      kind: "report",
      resourceType: "essay_report",
      subjectTitle: "地理探究",
      chapterTitle: undefined,
      resourceTitle: "論述式レポート",
    }),
  ).toEqual({
    title: "レポートの画面に来ました",
    message: "地理探究\n論述式レポート",
  });

  expect(
    formatArrivalNotification({
      kind: "test",
      resourceType: "essay_test",
      subjectTitle: "地理探究",
      chapterTitle: "第9回",
      resourceTitle: undefined,
    }).message,
  ).toBe("地理探究 / 第9回");
});

test("uses a generic message when every title part is missing", () => {
  expect(
    formatArrivalNotification({
      kind: "test",
      resourceType: "evaluation_test",
      subjectTitle: undefined,
      chapterTitle: undefined,
      resourceTitle: undefined,
    }).message,
  ).toBe("ZEN Study");
});

test("parses a subject from page titles with or without the suffix", () => {
  expect(parseSubjectFromPageTitle("地理探究 地理探究-9 - ZEN Study")).toBe("地理探究");
  expect(parseSubjectFromPageTitle("地理探究 地理探究-9")).toBe("地理探究");
});

test("returns no subject for empty titles or titles without a separating space", () => {
  expect(parseSubjectFromPageTitle("")).toBeUndefined();
  expect(parseSubjectFromPageTitle("地理探究 - ZEN Study")).toBeUndefined();
});
