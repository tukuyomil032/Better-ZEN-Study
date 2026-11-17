import { expect, test } from "bun:test";
import { summarizeMonth, summarizeSections } from "../src/lib/summary";
import { chapterSections } from "./fixtures/chapter-31713";
import { monthlyResponse } from "./fixtures/monthly-2026-12";

test("summarizes main and supplement materials with the required totals", () => {
  const sections = chapterSections.map(({ resource_type, material_type, length, passed }) => ({
    resource_type,
    material_type,
    length,
    passed,
  }));

  expect(sections).toHaveLength(24);
  expect(summarizeSections(sections, { includeSupplement: false })).toEqual({
    movieCount: 17,
    movieSeconds: 7_542,
    supplementMovieCount: 1,
    supplementSeconds: 438,
    testCount: 4,
    reportCount: 2,
  });
  expect(summarizeSections(sections, { includeSupplement: true })).toEqual({
    movieCount: 18,
    movieSeconds: 7_980,
    supplementMovieCount: 1,
    supplementSeconds: 438,
    testCount: 4,
    reportCount: 2,
  });
});

test("sums chapter summaries and preserves the scheduled assessment count", () => {
  expect(monthlyResponse.total_chapter_count).toBe(11);
  expect(monthlyResponse.total_material_count).toBe(255);
  expect(monthlyResponse.total_assessment_test).toBe(1);
  expect(monthlyResponse.deadline_groups[0]?.chapters).toHaveLength(11);
  expect(monthlyResponse.deadline_groups[0]?.assessment_tests[0]?.assessment_test_id).toBe(20);
  expect(monthlyResponse.deadline_groups[0]?.assessment_tests[0]?.title).toBe(
    "2026年度 第3回 定期テスト",
  );
  expect(
    summarizeMonth(
      [
        { movieCount: 2, movieSeconds: 100, testCount: 1, reportCount: 0 },
        { movieCount: 3, movieSeconds: 250, testCount: 0, reportCount: 2 },
      ],
      monthlyResponse.total_assessment_test,
    ),
  ).toEqual({
    movieCount: 5,
    movieSeconds: 350,
    testCount: 1,
    reportCount: 2,
    scheduledAssessmentTests: 1,
  });
});
