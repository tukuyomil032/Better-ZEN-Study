import { describe, expect, test } from "bun:test";
import { buildCourseView, opensOnSite, testStatusLabel } from "../src/lib/views/course-view";

// A required (basic) course in the shape the site returns: chapters with their counts, and periodic
// tests (定期テスト) listed beside them. The numbers are those of a real course; the titles are not.
const requiredCourse = {
  course: {
    id: 2538,
    title: "普通科ベーシック",
    type: "n_school",
    subject_category: { title: "論理・表現" },
    progress: {
      total_count: 6,
      passed_count: 5,
      total_chapters: 6,
      passed_chapters: 5,
      total_assessment_test: 3,
      passed_assessment_test_count: 2,
      total_materials: 183,
      passed_materials: 179,
    },
    chapters: [
      {
        id: 32849,
        resource_type: "chapter",
        title: "第1回",
        progress: { total_count: 45, passed_count: 45 },
      },
      {
        id: 18,
        resource_type: "assessment_test",
        title: "2026年度 第1回 定期テスト",
        total_question: 43,
        total_answered_question: 43,
        time_limit: 3000,
        status: "passed",
        scale_score: 1353,
        max_scale_score: 2000,
      },
      {
        id: 32850,
        resource_type: "chapter",
        title: "第2回",
        progress: { total_count: 34, passed_count: 34 },
      },
      {
        id: 20,
        resource_type: "assessment_test",
        title: "2026年度 第3回 定期テスト",
        total_question: 44,
        total_answered_question: 0,
        time_limit: 3000,
        status: "ready",
        scale_score: null,
        max_scale_score: null,
      },
    ],
  },
};

describe("buildCourseView for periodic tests", () => {
  test("lists a periodic test as its own row, with its path on the site and its scores", () => {
    const view = buildCourseView(requiredCourse);
    const passed = view?.chapters.find((row) => row.id === 18);
    expect(passed).toMatchObject({
      kind: "assessment_test",
      path: "/courses/2538/assessment_tests/18",
      status: "done",
      passed: 1,
      total: 1,
      percent: 100,
      test: { questionCount: 43, answeredCount: 43, score: 1353, maxScore: 2000 },
    });
  });

  test("an untried periodic test is not started, with no score", () => {
    const view = buildCourseView(requiredCourse);
    const untried = view?.chapters.find((row) => row.id === 20);
    expect(untried).toMatchObject({
      kind: "assessment_test",
      status: "not_started",
      passed: 0,
      percent: 0,
      test: { questionCount: 44, answeredCount: 0, score: undefined, maxScore: undefined },
    });
  });

  test("a periodic test is not counted as a chapter; the required course keeps its own chapter totals", () => {
    const view = buildCourseView(requiredCourse);
    expect(view?.passedChapters).toBe(5);
    expect(view?.totalChapters).toBe(6);
    expect(view?.chapters.filter((row) => row.kind === "chapter")).toHaveLength(2);
  });

  test("the course percent still comes from its materials", () => {
    expect(buildCourseView(requiredCourse)?.percent).toBe(98);
  });

  test("an advanced course counts only its chapters, even with a periodic test in the list", () => {
    const advanced = {
      course: {
        id: 9,
        type: "advanced",
        progress: { comprehension: { limit: 2, bad: 0, good: 1, perfect: 0 } },
        chapters: [
          {
            id: 1,
            resource_type: "chapter",
            progress: { comprehension: { limit: 2, bad: 0, good: 2, perfect: 0 } },
          },
          {
            id: 2,
            resource_type: "chapter",
            progress: { comprehension: { limit: 0, bad: 0, good: 0, perfect: 0 } },
          },
          {
            id: 3,
            resource_type: "assessment_test",
            title: "定期テスト",
            total_question: 10,
            total_answered_question: 10,
            time_limit: 600,
            status: "passed",
            scale_score: 900,
            max_scale_score: 1000,
          },
        ],
      },
    };
    const view = buildCourseView(advanced);
    expect(view?.passedChapters).toBe(1);
    expect(view?.totalChapters).toBe(1);
  });
});

describe("testStatusLabel", () => {
  const row = (
    kind: "short_test" | "assessment_test",
    status: "done" | "in_progress" | "not_started",
  ) => ({ kind, status }) as Parameters<typeof testStatusLabel>[0];

  test("a passed test is 合格, and an untried one is 未受験", () => {
    expect(testStatusLabel(row("assessment_test", "done"))).toBe("合格");
    expect(testStatusLabel(row("short_test", "done"))).toBe("合格");
    expect(testStatusLabel(row("assessment_test", "not_started"))).toBe("未受験");
    expect(testStatusLabel(row("short_test", "not_started"))).toBe("未受験");
  });

  test("a periodic test that has answers but no pass is 受験中, while a short test graded below pass is 未合格", () => {
    expect(testStatusLabel(row("assessment_test", "in_progress"))).toBe("受験中");
    expect(testStatusLabel(row("short_test", "in_progress"))).toBe("未合格");
  });

  test("a chapter has no test label", () => {
    expect(
      testStatusLabel({ kind: "chapter", status: "done" } as Parameters<typeof testStatusLabel>[0]),
    ).toBeUndefined();
  });
});

describe("opensOnSite", () => {
  test("a periodic test opens on the site; a chapter and a short test open in the shell", () => {
    expect(opensOnSite("assessment_test")).toBe(true);
    expect(opensOnSite("chapter")).toBe(false);
    expect(opensOnSite("short_test")).toBe(false);
  });
});
