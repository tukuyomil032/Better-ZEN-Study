import { describe, expect, test } from "bun:test";
import { buildCourseView } from "../src/lib/views/course-view";

describe("buildCourseView", () => {
  test("maps course and chapter progress to view rows", () => {
    const view = buildCourseView({
      course: {
        id: 4,
        title: "地理探究",
        outline: "Outline",
        subject_category: { title: "地理" },
        progress: {
          total_materials: 5,
          passed_materials: 3,
          total_count: 6,
          passed_count: 1,
          total_chapters: 3,
          passed_chapters: 1,
        },
        chapters: [
          {
            id: 10,
            title: "第1回",
            resource_type: "movie",
            progress: { total_count: 2, passed_count: 2 },
          },
          {
            id: 11,
            title: "第2回",
            resource_type: "evaluation_test",
            progress: { total_count: 0, passed_count: 0 },
          },
          { id: 12, progress: { total_count: 4, passed_count: 1 } },
        ],
      },
    });

    expect(view).toEqual({
      id: 4,
      title: "地理探究",
      subjectTitle: "地理",
      service: "basic",
      outline: "Outline",
      percent: 60,
      passedChapters: 1,
      totalChapters: 3,
      chapters: [
        {
          id: 10,
          kind: "chapter",
          title: "第1回",
          resourceType: "movie",
          passed: 2,
          total: 2,
          percent: 100,
          status: "done",
          subjectTitle: "地理",
          path: "/courses/4/chapters/10",
          test: undefined,
        },
        {
          id: 11,
          kind: "chapter",
          title: "第2回",
          resourceType: "evaluation_test",
          passed: 0,
          total: 0,
          percent: 0,
          status: "not_started",
          subjectTitle: "地理",
          path: "/courses/4/chapters/11",
          test: undefined,
        },
        {
          id: 12,
          kind: "chapter",
          title: "",
          resourceType: "",
          passed: 1,
          total: 4,
          percent: 25,
          status: "in_progress",
          subjectTitle: "地理",
          path: "/courses/4/chapters/12",
          test: undefined,
        },
      ],
    });
  });

  test("uses count progress when material totals are zero and clamps percent", () => {
    expect(
      buildCourseView({
        course: {
          progress: { total_materials: 0, passed_materials: 4, total_count: 2, passed_count: 3 },
          chapters: [],
        },
      })?.percent,
    ).toBe(100);
  });

  test("returns undefined when the course is missing or malformed", () => {
    expect(buildCourseView(null)).toBeUndefined();
    expect(buildCourseView([])).toBeUndefined();
    expect(buildCourseView({})).toBeUndefined();
    expect(buildCourseView({ course: [] })).toBeUndefined();
  });

  test("uses safe defaults for missing course fields", () => {
    expect(buildCourseView({ course: { chapters: [null] } })).toEqual({
      id: 0,
      title: "",
      subjectTitle: "",
      service: "basic",
      outline: "",
      percent: 0,
      passedChapters: 0,
      // The one listed chapter has no fields, but it is still a chapter of the course.
      totalChapters: 1,
      chapters: [
        {
          id: 0,
          kind: "chapter",
          title: "",
          resourceType: "",
          passed: 0,
          total: 0,
          percent: 0,
          status: "not_started",
          subjectTitle: "",
          path: "/courses/0/chapters/0",
          test: undefined,
        },
      ],
    });
  });
});
