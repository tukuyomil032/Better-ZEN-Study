import { describe, expect, test } from "bun:test";
import {
  buildDashboardView,
  daysUntil,
  monthCard,
  monthKey,
  sharedDeadlineDay,
  type MonthlySummaryRaw,
} from "../src/lib/views/dashboard-view";

const now = new Date(2026, 10, 16, 22, 0, 0); // 2026-11-16 22:00 local

function raw(overrides: Partial<MonthlySummaryRaw>): MonthlySummaryRaw {
  return {
    year: 2026,
    month: 12,
    earliest_report_deadline: "2026-12-15T23:59:59+09:00",
    total_chapter_count: 11,
    passed_chapter_count: 5,
    total_assessment_test: 1,
    passed_assessment_test_count: 0,
    ...overrides,
  };
}

describe("daysUntil", () => {
  test("counts calendar days, ignoring the time of day", () => {
    expect(daysUntil(new Date(2026, 11, 15, 23, 59), now)).toBe(29);
  });

  test("is zero on the deadline day itself", () => {
    expect(daysUntil(new Date(2026, 10, 16, 1, 0), now)).toBe(0);
  });

  test("is negative after the deadline", () => {
    expect(daysUntil(new Date(2026, 10, 10), now)).toBe(-6);
  });

  test("handles a year boundary", () => {
    expect(daysUntil(new Date(2027, 0, 2), new Date(2026, 11, 31, 9))).toBe(2);
  });
});

describe("monthCard", () => {
  test("computes days left and percent from chapters and tests", () => {
    const card = monthCard(raw({}), now);
    expect(card.daysLeft).toBe(29);
    expect(card.status).toBe("active");
    expect(card.label).toBe("12月のレポート");
    // 5 of 11 chapters and 0 of 1 test: 5 / 12 = 41.67 -> 42
    expect(card.percent).toBe(42);
  });

  test("marks a fully passed month as done even after its deadline", () => {
    const card = monthCard(
      raw({
        month: 6,
        earliest_report_deadline: "2026-06-15T23:59:59+09:00",
        total_chapter_count: 8,
        passed_chapter_count: 8,
        total_assessment_test: 1,
        passed_assessment_test_count: 1,
      }),
      now,
    );
    expect(card.status).toBe("done");
    expect(card.percent).toBe(100);
  });

  test("marks an unfinished month past its deadline as overdue", () => {
    const card = monthCard(
      raw({ month: 10, earliest_report_deadline: "2026-10-15T23:59:59+09:00" }),
      now,
    );
    expect(card.status).toBe("overdue");
  });

  test("returns zero percent when a month has no chapters", () => {
    const card = monthCard(
      raw({
        total_chapter_count: 0,
        total_assessment_test: 0,
        passed_chapter_count: 0,
        passed_assessment_test_count: 0,
      }),
      now,
    );
    expect(card.percent).toBe(0);
  });
});

describe("buildDashboardView", () => {
  const summaries: MonthlySummaryRaw[] = [
    raw({
      month: 6,
      earliest_report_deadline: "2026-06-15T23:59:59+09:00",
      total_chapter_count: 8,
      passed_chapter_count: 8,
      total_assessment_test: 1,
      passed_assessment_test_count: 1,
    }),
    raw({ month: 12 }),
    raw({
      month: 11,
      earliest_report_deadline: "2026-11-30T23:59:59+09:00",
      total_chapter_count: 4,
      passed_chapter_count: 1,
      total_assessment_test: 0,
      passed_assessment_test_count: 0,
    }),
  ];

  test("picks the nearest open deadline, skipping finished months", () => {
    const view = buildDashboardView(summaries, now);
    expect(view.nextDeadline?.month).toBe(11);
    expect(view.doneMonths).toBe(1);
    expect(view.activeMonths).toBe(2);
  });

  test("sums chapters and tests across months", () => {
    const view = buildDashboardView(summaries, now);
    expect(view.chapterTotal).toBe(23);
    expect(view.chapterPassed).toBe(14);
    expect(view.testTotal).toBe(2);
    expect(view.testPassed).toBe(1);
    // (14 + 1) / (23 + 2) = 59.9% -> 60
    expect(view.percent).toBe(60);
  });

  test("has no next deadline when every month is done or overdue", () => {
    const view = buildDashboardView(
      [
        raw({
          month: 6,
          earliest_report_deadline: "2026-06-15T23:59:59+09:00",
          total_chapter_count: 8,
          passed_chapter_count: 8,
          total_assessment_test: 1,
          passed_assessment_test_count: 1,
        }),
      ],
      now,
    );
    expect(view.nextDeadline).toBeUndefined();
  });

  test("keeps the API order for the month list", () => {
    const view = buildDashboardView(summaries, now);
    expect(view.months.map((month) => month.month)).toEqual([6, 12, 11]);
  });
});

describe("sharedDeadlineDay", () => {
  test("returns the day when every month has the same deadline day", () => {
    const months = [
      monthCard(raw({ month: 6, earliest_report_deadline: "2026-06-15T23:59:59+09:00" }), now),
      monthCard(raw({ month: 12 }), now),
    ];
    expect(sharedDeadlineDay(months)).toBe(15);
  });

  test("returns undefined when the days differ", () => {
    const months = [
      monthCard(raw({ month: 6, earliest_report_deadline: "2026-06-15T23:59:59+09:00" }), now),
      monthCard(raw({ month: 7, earliest_report_deadline: "2026-07-20T23:59:59+09:00" }), now),
    ];
    expect(sharedDeadlineDay(months)).toBeUndefined();
  });

  test("returns undefined for no months", () => {
    expect(sharedDeadlineDay([])).toBeUndefined();
  });
});

describe("progress from material counts", () => {
  test("uses the month's material count, rounded as the site shows it", () => {
    // 122 of 255 materials is 47.84%; the site shows 48%.
    const card = monthCard(raw({}), now, { passed: 122, total: 255 });
    expect(card.percent).toBe(48);
  });

  test("falls back to chapters and tests when the material count is empty", () => {
    const card = monthCard(raw({}), now, { passed: 0, total: 0 });
    // 5 of 11 chapters and 0 of 1 test: 5 / 12 = 41.67 -> 42
    expect(card.percent).toBe(42);
  });

  test("sums the material counts for the overall figure when every month has one", () => {
    const summaries = [
      raw({
        month: 6,
        earliest_report_deadline: "2026-06-15T23:59:59+09:00",
        total_chapter_count: 8,
        passed_chapter_count: 8,
        total_assessment_test: 1,
        passed_assessment_test_count: 1,
      }),
      raw({ month: 12 }),
    ];
    const materials = new Map([
      [monthKey(2026, 6), { passed: 231, total: 231 }],
      [monthKey(2026, 12), { passed: 122, total: 255 }],
    ]);
    const view = buildDashboardView(summaries, now, materials);
    expect(view.months.map((month) => month.percent)).toEqual([100, 48]);
    // (231 + 122) / (231 + 255) = 72.6% -> 73
    expect(view.percent).toBe(73);
  });

  test("uses chapters and tests for the overall figure when a month has no material count", () => {
    const summaries = [
      raw({
        month: 6,
        earliest_report_deadline: "2026-06-15T23:59:59+09:00",
        total_chapter_count: 8,
        passed_chapter_count: 8,
        total_assessment_test: 1,
        passed_assessment_test_count: 1,
      }),
      raw({ month: 12 }),
    ];
    const materials = new Map([[monthKey(2026, 6), { passed: 231, total: 231 }]]);
    const view = buildDashboardView(summaries, now, materials);
    // Chapters 13 of 19 and tests 1 of 2: (13 + 1) / (19 + 2) = 66.7% -> 67
    expect(view.percent).toBe(67);
  });
});
