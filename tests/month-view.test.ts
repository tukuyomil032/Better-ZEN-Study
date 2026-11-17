import { describe, expect, test } from "bun:test";
import { buildMonthView } from "../src/lib/views/month-view";

describe("buildMonthView", () => {
  test("maps ordered groups, labels deadlines, and counts the deadline day as today", () => {
    const now = new Date(2026, 11, 15, 21, 30);
    const view = buildMonthView(
      {
        year: 2026,
        month: 12,
        total_chapter_count: 3,
        passed_chapter_count: 1,
        total_assessment_test: 1,
        passed_assessment_test_count: 0,
        deadline_groups: [
          { deadline: "2026-12-15T23:59:00+09:00", chapters: [], assessment_tests: [] },
          {
            deadline: "2027-01-02T23:59:00+09:00",
            chapters: [
              {
                course_id: 7,
                chapter_id: 2,
                subject_category_title: "地理",
                course_title: "地理探究",
                chapter_title: "第2回",
                total_count: 4,
                passed_count: 2,
                exempted: false,
              },
            ],
            assessment_tests: [],
          },
        ],
      },
      now,
    );
    expect(view?.groups.map((group) => group.daysLeft)).toEqual([0, 18]);
    expect(view?.groups.map((group) => group.deadlineLabel)).toEqual([
      "12月15日 期限",
      "1月2日 期限",
    ]);
    expect(view?.groups[1].items[0]).toMatchObject({ percent: 50, completed: false });
    expect(view?.percent).toBe(25);
    expect(view?.isCompletedMonth).toBe(false);
  });

  test("uses the material count for the month's percent when the response carries it", () => {
    const view = buildMonthView(
      {
        year: 2026,
        month: 12,
        total_chapter_count: 11,
        passed_chapter_count: 0,
        total_material_count: 255,
        passed_material_count: 122,
        total_assessment_test: 1,
        passed_assessment_test_count: 0,
        deadline_groups: [],
      },
      new Date(2026, 11, 1),
    );
    expect(view?.percent).toBe(48);
    // The chapter count itself is unchanged: the percent is the only figure that moves.
    expect(view?.passedChapters).toBe(0);
    expect(view?.totalChapters).toBe(11);
  });

  test("supports year and month boundaries and reports passed deadlines", () => {
    const view = buildMonthView(
      {
        year: 2027,
        month: 1,
        deadline_groups: [
          { deadline: "2026-12-31T23:59:59+09:00", chapters: [], assessment_tests: [] },
        ],
      },
      new Date(2027, 0, 1, 9),
    );
    expect(view?.groups[0].daysLeft).toBe(-1);
    expect(view?.groups[0].deadlineLabel).toBe("12月31日 期限");
  });

  test("marks a completed month with no deadline groups and maps completed chapters", () => {
    const view = buildMonthView(
      {
        year: 2026,
        month: 6,
        total_chapter_count: 1,
        passed_chapter_count: 1,
        total_assessment_test: 0,
        passed_assessment_test_count: 0,
        deadline_groups: [],
        completed_chapters: [
          {
            course_id: 7,
            chapter_id: 3,
            subject_category_title: "国語",
            course_title: "国語表現",
            chapter_title: "第1回",
            total_count: 2,
            passed_count: 2,
            exempted: true,
          },
        ],
      },
      new Date(2026, 5, 30),
    );
    expect(view?.isCompletedMonth).toBe(true);
    expect(view?.completedItems[0]).toMatchObject({
      courseId: 7,
      chapterId: 3,
      percent: 100,
      completed: true,
      exempted: true,
    });
  });

  test("keeps deadline-group copies and de-duplicates completed chapters by course and chapter", () => {
    const view = buildMonthView(
      {
        year: 2026,
        month: 6,
        deadline_groups: [
          {
            deadline: "2026-06-30",
            chapters: [
              {
                course_id: 7,
                chapter_id: 3,
                chapter_title: "Deadline version",
                total_count: 4,
                passed_count: 1,
              },
            ],
            assessment_tests: [],
          },
        ],
        completed_chapters: [
          { course_id: 7, chapter_id: 3, chapter_title: "Completed duplicate" },
          { course_id: 7, chapter_id: 4, chapter_title: "Unique completed" },
          { course_id: 7, chapter_id: 4, chapter_title: "Repeated completed" },
        ],
      },
      new Date(2026, 5, 1),
    );
    expect(view?.groups[0].items[0].chapterTitle).toBe("Deadline version");
    expect(view?.completedItems.map((item) => item.chapterTitle)).toEqual(["Unique completed"]);
  });

  test("returns undefined for malformed roots and uses empty defaults for missing fields", () => {
    expect(buildMonthView(null, new Date())).toBeUndefined();
    expect(buildMonthView([], new Date())).toBeUndefined();
    expect(buildMonthView({ year: 2026 }, new Date())).toBeUndefined();
    expect(buildMonthView({ year: "2026", month: 6 }, new Date())).toBeUndefined();
    expect(buildMonthView({ year: 2026, month: 6 }, new Date())).toMatchObject({
      percent: 0,
      groups: [],
      completedItems: [],
      isCompletedMonth: true,
    });
    expect(
      buildMonthView(
        {
          year: 2026,
          month: 6,
          deadline_groups: [null, [], {}],
          completed_chapters: [null, []],
        },
        new Date(2026, 5, 1),
      )?.completedItems,
    ).toEqual([
      expect.objectContaining({
        courseId: 0,
        chapterId: 0,
        subjectTitle: "",
        total: 0,
        completed: false,
      }),
    ]);
  });
});
