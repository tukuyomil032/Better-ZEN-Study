import { expect, test } from "bun:test";
import { isMessage } from "../src/lib/messages";

test("accepts valid message variants", () => {
  expect(isMessage({ type: "fetch-chapter", courseId: 7, chapterId: 31713 })).toBe(true);
  expect(isMessage({ type: "fetch-chapter", courseId: 7, chapterId: 31713, fresh: true })).toBe(
    true,
  );
  expect(isMessage({ type: "fetch-monthly", year: 2026, month: 12 })).toBe(true);
  expect(isMessage({ type: "chapter-summary", courseId: 7, chapterId: 31713 })).toBe(true);
  expect(isMessage({ type: "month-summary", year: 2026, month: 12 })).toBe(true);
  expect(isMessage({ type: "month-summary", year: 2026, month: 12, includeSupplement: true })).toBe(
    true,
  );
  expect(
    isMessage({
      type: "test-arrival",
      kind: "report",
      resourceType: "essay_report",
      courseId: 2472,
      chapterId: 31713,
      resourceId: 1627,
      pageTitle: "地理探究 地理探究-9 - ZEN Study",
      tabId: 4,
    }),
  ).toBe(true);
  // A practice problem where autoplay paused: announced as an exercise, and only as one.
  expect(
    isMessage({
      type: "test-arrival",
      kind: "exercise",
      resourceType: "exercise",
      courseId: 2036,
      chapterId: 20212,
      resourceId: 9850,
      pageTitle: "英文法 - ZEN Study",
    }),
  ).toBe(true);
  expect(
    isMessage({
      type: "test-arrival",
      kind: "test",
      resourceType: "exercise",
      courseId: 2036,
      chapterId: 20212,
      resourceId: 9850,
      pageTitle: "",
    }),
  ).toBe(false);
  expect(isMessage({ type: "test-notification" })).toBe(true);
  expect(isMessage({ type: "autoplay-status", state: "stopped-at-test" })).toBe(true);
  expect(isMessage({ type: "settings-changed" })).toBe(true);
});

test("rejects invalid discriminants and required fields", () => {
  expect(isMessage(null)).toBe(false);
  expect(isMessage({ type: "unknown" })).toBe(false);
  expect(
    isMessage({
      type: "test-arrival",
      kind: "test",
      subject: "地理探究",
      chapter: "第9回",
      title: "テスト",
    }),
  ).toBe(false);
  expect(
    isMessage({
      type: "test-arrival",
      kind: "test",
      resourceType: "evaluation_report",
      courseId: 2472,
      chapterId: 31713,
      resourceId: 1620,
      pageTitle: "",
    }),
  ).toBe(false);
  expect(
    isMessage({
      type: "test-arrival",
      kind: "test",
      resourceType: "evaluation_test",
      courseId: 2472,
      chapterId: 31713,
      resourceId: 7186,
      pageTitle: "",
      tabId: "2",
    }),
  ).toBe(false);
  expect(isMessage({ type: "autoplay-status", state: "paused" })).toBe(false);
  expect(isMessage({ type: "fetch-chapter", courseId: "7", chapterId: 31713 })).toBe(false);
  expect(isMessage({ type: "fetch-chapter", courseId: 7, chapterId: 31713, fresh: "yes" })).toBe(
    false,
  );
  expect(isMessage({ type: "fetch-monthly", year: 2026, month: 13 })).toBe(false);
  expect(
    isMessage({
      type: "chapter-summary",
      courseId: Number.MAX_SAFE_INTEGER + 1,
      chapterId: 1,
    }),
  ).toBe(false);
  expect(isMessage({ type: "chapter-summary", courseId: 1.5, chapterId: 1 })).toBe(false);
  expect(
    isMessage({ type: "chapter-summary", courseId: 1, chapterId: Number.MAX_SAFE_INTEGER + 1 }),
  ).toBe(false);
  expect(isMessage({ type: "month-summary", year: Number.MAX_SAFE_INTEGER + 1, month: 1 })).toBe(
    false,
  );
  expect(isMessage({ type: "month-summary", year: 2026, month: 1.5 })).toBe(false);
  expect(isMessage({ type: "month-summary", year: 2026, month: Number.MAX_SAFE_INTEGER + 1 })).toBe(
    false,
  );
  expect(isMessage({ type: "month-summary", year: 2026, month: 13 })).toBe(false);
  expect(isMessage({ type: "month-summary", year: 2026, month: 1, includeSupplement: "yes" })).toBe(
    false,
  );
});
