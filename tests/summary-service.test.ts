import { expect, test } from "bun:test";
import {
  buildChapterSummary,
  chaptersFromMonthly,
  monthSummary,
  summarizeChapters,
} from "../src/lib/summary-service";
import type { ChapterRef } from "../src/lib/summary-service";
import { chapterSections } from "./fixtures/chapter-31713";
import { completedMonthlyResponse } from "./fixtures/monthly-2026-6";
import { duplicateMonthlyResponse } from "./fixtures/monthly-2026-6-duplicate";
import { monthlyResponse } from "./fixtures/monthly-2026-12";

const chapterRef: ChapterRef = {
  courseId: 2472,
  chapterId: 31713,
  subjectTitle: "地理探究",
  courseTitle: "地理探究",
  chapterTitle: "第1回",
};

test("builds chapter summaries using the shared section summarizer", () => {
  expect(buildChapterSummary(chapterRef, chapterSections, false)).toEqual({
    ...chapterRef,
    movieCount: 17,
    movieSeconds: 7_542,
    supplementMovieCount: 1,
    supplementSeconds: 438,
    testCount: 4,
    reportCount: 2,
  });
  expect(buildChapterSummary(chapterRef, chapterSections, true)).toEqual({
    ...chapterRef,
    movieCount: 18,
    movieSeconds: 7_980,
    supplementMovieCount: 1,
    supplementSeconds: 438,
    testCount: 4,
    reportCount: 2,
  });
});

test("flattens monthly chapters in report order and summarizes month totals", () => {
  const refs = chaptersFromMonthly(monthlyResponse);
  expect(refs).toHaveLength(11);
  expect(refs[0]).toEqual({
    courseId: 2472,
    chapterId: 31713,
    subjectTitle: "地理探究",
    courseTitle: "地理探究",
    chapterTitle: "第1回",
  });
  expect(refs[10]?.chapterId).toBe(31723);

  const summaries = refs.map((ref, index) =>
    index === 1
      ? {
          ...ref,
          movieCount: 0,
          movieSeconds: 0,
          supplementMovieCount: 0,
          supplementSeconds: 0,
          testCount: 0,
          reportCount: 0,
          error: "Failed to fetch chapter sections.",
        }
      : {
          ...ref,
          movieCount: 2,
          movieSeconds: 100,
          supplementMovieCount: 1,
          supplementSeconds: 25,
          testCount: 1,
          reportCount: 0,
        },
  );

  expect(monthSummary(monthlyResponse, summaries)).toEqual({
    year: 2026,
    month: 12,
    totals: {
      movieCount: 20,
      movieSeconds: 1_000,
      testCount: 10,
      reportCount: 0,
      scheduledAssessmentTests: 1,
      chapterCount: 11,
      chapterFailures: 1,
    },
    chapters: summaries,
  });
});

test("includes completed-month chapters in report order", () => {
  expect(chaptersFromMonthly(completedMonthlyResponse)).toEqual([
    {
      courseId: 2472,
      chapterId: 31713,
      subjectTitle: "地理探究",
      courseTitle: "地理探究",
      chapterTitle: "第1回",
    },
    {
      courseId: 2472,
      chapterId: 31714,
      subjectTitle: "地理探究",
      courseTitle: "地理探究",
      chapterTitle: "第2回",
    },
  ]);
});

test("keeps the deadline-group chapter when a completed chapter is duplicated", () => {
  expect(chaptersFromMonthly(duplicateMonthlyResponse)).toEqual([
    {
      courseId: 2472,
      chapterId: 31713,
      subjectTitle: "地理探究",
      courseTitle: "地理探究",
      chapterTitle: "Deadline version",
    },
    {
      courseId: 2472,
      chapterId: 31714,
      subjectTitle: "地理探究",
      courseTitle: "地理探究",
      chapterTitle: "第2回",
    },
  ]);
});

test("preserves input order when chapter requests resolve out of order", async () => {
  const refs = [
    { ...chapterRef, chapterId: 101, chapterTitle: "First" },
    { ...chapterRef, chapterId: 102, chapterTitle: "Second" },
    { ...chapterRef, chapterId: 103, chapterTitle: "Third" },
  ];
  const resolvers = new Map<number, (sections: typeof chapterSections) => void>();
  const resultPromise = summarizeChapters(
    refs,
    (_courseId, chapterId) => new Promise((resolve) => resolvers.set(chapterId, resolve)),
    { includeSupplement: false },
  );

  resolvers.get(103)?.(chapterSections);
  resolvers.get(102)?.(chapterSections);
  resolvers.get(101)?.(chapterSections);

  const result = await resultPromise;
  expect(result.map((chapter) => chapter.chapterId)).toEqual([101, 102, 103]);
});

test("limits in-flight chapter requests to the default concurrency of three", async () => {
  const refs = Array.from({ length: 8 }, (_, index) => ({
    ...chapterRef,
    chapterId: 200 + index,
  }));
  let active = 0;
  let maximumActive = 0;
  const releases: Array<() => void> = [];

  const resultPromise = summarizeChapters(
    refs,
    () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      return new Promise<typeof chapterSections>((resolve) => {
        releases.push(() => {
          active -= 1;
          resolve(chapterSections);
        });
      });
    },
    { includeSupplement: false },
  );

  for (let completed = 0; completed < refs.length; completed += 1) {
    while (releases.length === 0) await Promise.resolve();
    const release = releases.shift();
    release?.();
    await Promise.resolve();
  }

  await resultPromise;
  expect(maximumActive).toBe(3);
  expect(maximumActive).toBeLessThanOrEqual(3);
});

test("keeps successful chapter summaries when another fetch fails safely", async () => {
  const secret = "response body with private detail\nError: stack frame";
  const failedRef = { ...chapterRef, chapterId: 31714, chapterTitle: "Failed" };
  const [successSummary, failedSummary] = await summarizeChapters(
    [chapterRef, failedRef],
    async (_courseId, chapterId) => {
      if (chapterId === failedRef.chapterId) throw new Error(secret);
      return chapterSections;
    },
    { includeSupplement: false },
  );

  expect(successSummary).toMatchObject({
    chapterId: chapterRef.chapterId,
    movieCount: 17,
    movieSeconds: 7_542,
    supplementMovieCount: 1,
    supplementSeconds: 438,
    testCount: 4,
    reportCount: 2,
  });
  expect(successSummary?.error).toBeUndefined();

  expect(failedSummary).toMatchObject({
    chapterId: failedRef.chapterId,
    movieCount: 0,
    movieSeconds: 0,
    supplementMovieCount: 0,
    supplementSeconds: 0,
    testCount: 0,
    reportCount: 0,
  });
  expect(failedSummary?.error).toBe("Failed to fetch chapter sections.");
  expect(failedSummary?.error).not.toContain("private detail");
  expect(failedSummary?.error).not.toContain("stack frame");
  expect(failedSummary?.error).not.toContain("Error:");
});
