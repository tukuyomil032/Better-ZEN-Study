import { describe, expect, test } from "bun:test";
import { buildTrail, dashboardPath, isDashboardTab, parseMonthOrigin } from "../src/lib/trail";

const HOME = { label: "マイコース", path: "/my_course" };

describe("buildTrail", () => {
  test("the dashboard names its current tab, and home goes back to the dashboard", () => {
    expect(buildTrail({ screen: "my_course", tab: "advanced" })).toEqual([
      HOME,
      { label: "課外授業" },
    ]);
  });

  test("a month goes back to the reports tab", () => {
    expect(buildTrail({ screen: "month", year: 2026, month: 12 })).toEqual([
      HOME,
      { label: "必修レポート", path: "/my_course?tab=reports" },
      { label: "12月のレポート" },
    ]);
  });

  test("a course goes back to its own list: required or advanced", () => {
    expect(
      buildTrail({ screen: "course", courseId: 2036, service: "advanced", courseTitle: "英文法" }),
    ).toEqual([HOME, { label: "課外授業", path: "/my_course?tab=advanced" }, { label: "英文法" }]);
  });

  test("a chapter opened from its course goes back to the course, and then to the list", () => {
    expect(
      buildTrail({
        screen: "chapter",
        courseId: 2036,
        service: "basic",
        courseTitle: "国語表現",
        chapterId: 20212,
        chapterTitle: "頻出表現集",
      }),
    ).toEqual([
      HOME,
      { label: "必修授業", path: "/my_course?tab=basic" },
      { label: "国語表現", path: "/courses/2036" },
      { label: "頻出表現集" },
    ]);
  });

  test("a chapter opened from a month goes back to that month, not to the course", () => {
    expect(
      buildTrail({
        screen: "chapter",
        courseId: 2036,
        service: "basic",
        courseTitle: "国語表現",
        chapterId: 20212,
        chapterTitle: "頻出表現集",
        origin: { year: 2026, month: 12 },
      }),
    ).toEqual([
      HOME,
      { label: "必修レポート", path: "/my_course?tab=reports" },
      { label: "12月のレポート", path: "/study_plans/month/2026/12?service=basic" },
      { label: "頻出表現集" },
    ]);
  });

  test("a material adds its own name last, and keeps the chapter as a link", () => {
    expect(
      buildTrail({
        screen: "material",
        courseId: 2036,
        service: "advanced",
        courseTitle: "英文法",
        chapterId: 20212,
        chapterTitle: "頻出表現集",
        materialTitle: "演習問題 1",
      }),
    ).toEqual([
      HOME,
      { label: "課外授業", path: "/my_course?tab=advanced" },
      { label: "英文法", path: "/courses/2036" },
      { label: "頻出表現集", path: "/courses/2036/chapters/20212" },
      { label: "演習問題 1" },
    ]);
  });

  test("a short test goes back to its course, not to a chapter", () => {
    expect(
      buildTrail({
        screen: "short_test",
        courseId: 302,
        service: "advanced",
        courseTitle: "標準",
        testTitle: "第1回習熟度テスト",
      }),
    ).toEqual([
      HOME,
      { label: "課外授業", path: "/my_course?tab=advanced" },
      { label: "標準", path: "/courses/302" },
      { label: "第1回習熟度テスト" },
    ]);
  });

  test("names fall back to a plain word while the screen's data is still loading", () => {
    const trail = buildTrail({
      screen: "material",
      courseId: 1,
      service: "basic",
      chapterId: 2,
    });
    expect(trail.map((crumb) => crumb.label)).toEqual([
      "マイコース",
      "必修授業",
      "コース",
      "章",
      "教材",
    ]);
    // Only the last crumb has no path, so pressing any other crumb goes somewhere.
    expect(trail.slice(0, -1).every((crumb) => crumb.path !== undefined)).toBe(true);
    expect(trail.at(-1)?.path).toBeUndefined();
  });
});

describe("dashboard tabs", () => {
  test("accepts only the three tab names", () => {
    expect(isDashboardTab("reports")).toBe(true);
    expect(isDashboardTab("basic")).toBe(true);
    expect(isDashboardTab("advanced")).toBe(true);
    expect(isDashboardTab("classes")).toBe(false);
    expect(isDashboardTab(null)).toBe(false);
  });

  test("builds the dashboard address for a tab", () => {
    expect(dashboardPath("basic")).toBe("/my_course?tab=basic");
  });
});

describe("parseMonthOrigin", () => {
  test("reads a valid month from a history state", () => {
    expect(parseMonthOrigin({ origin: { year: 2026, month: 6 } })).toEqual({
      year: 2026,
      month: 6,
    });
  });

  test("ignores a state without a valid month", () => {
    expect(parseMonthOrigin(null)).toBeUndefined();
    expect(parseMonthOrigin({})).toBeUndefined();
    expect(parseMonthOrigin({ origin: { year: 2026, month: 13 } })).toBeUndefined();
    expect(parseMonthOrigin({ origin: { year: "2026", month: 6 } })).toBeUndefined();
  });
});
