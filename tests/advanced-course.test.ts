import { describe, expect, test } from "bun:test";
import { buildChapterView } from "../src/lib/views/chapter-view";
import { buildCourseView } from "../src/lib/views/course-view";
import { classifyPath } from "../src/lib/routes";

// An advanced course's chapter, in the shape the site returns for it.
const advancedChapter = {
  chapter: {
    id: 20212,
    title: "頻出表現集",
    class_headers: [
      {
        name: "section",
        label: "教材",
        sections: [
          {
            id: 1,
            title: "演習",
            resource_type: "exercise",
            content_url: "https://www.nnn.ed.nico/contents/links/325871?content_type=n-yobi",
            progress: {
              comprehension: { limit: 1, bad: 0, good: 1, perfect: 0 },
              checkpoint: { total: 8, clear: 8 },
            },
          },
          {
            id: 2,
            title: "解説動画",
            resource_type: "movie",
            content_url:
              "https://www.nnn.ed.nico:443/contents/courses/2036/chapters/20212/movies/2",
            length: 822,
            playback_position: 0,
            progress: { comprehension: { limit: 1, bad: 0, good: 0, perfect: 0 } },
          },
          {
            id: 3,
            title: "VR の体験",
            resource_type: "vr_experience",
            content_url: "",
            progress: {},
          },
        ],
      },
      {
        name: "lesson",
        label: "授業",
        sections: [{ id: 4, title: "高校英単語 第1講", resource_type: "lesson", progress: {} }],
      },
    ],
  },
};

describe("buildChapterView for an advanced chapter", () => {
  test("lists every material across the headers, in order", () => {
    const view = buildChapterView(advancedChapter, 2036, 20212, "all");
    expect(view?.items.map((item) => [item.kind, item.title])).toEqual([
      ["other", "演習"],
      ["movie", "解説動画"],
      ["other", "VR の体験"],
      ["lesson", "高校英単語 第1講"],
    ]);
  });

  test("opens a lesson on the site's lesson page, and a VR experience not at all", () => {
    const view = buildChapterView(advancedChapter, 2036, 20212, "all");
    expect(view?.items[3]).toMatchObject({
      kind: "lesson",
      openable: true,
      path: "/courses/2036/chapters/20212/lessons/4",
    });
    expect(view?.items[2]).toMatchObject({ openable: false, path: "" });
  });

  test("gives exercises and movies their shell paths, and counts an understood exercise as passed", () => {
    const view = buildChapterView(advancedChapter, 2036, 20212, "all");
    expect(view?.items[0]).toMatchObject({
      resourceType: "exercise",
      passed: true,
      hasProgress: true,
      questionClear: 8,
      questionTotal: 8,
      path: "/courses/2036/chapters/20212/exercise/1",
    });
    expect(view?.items[1]).toMatchObject({
      kind: "movie",
      passed: false,
      hasProgress: true,
      lengthSeconds: 822,
      path: "/courses/2036/chapters/20212/movie/2",
    });
    expect(view?.totals.movieCount).toBe(1);
  });

  test("counts materials understood out of the counted ones, leaving lessons and VR out, and questions cleared", () => {
    const view = buildChapterView(advancedChapter, 2036, 20212, "all");
    // The exercise is understood, the movie is not, the lesson and the VR experience have no progress.
    expect(view?.advanced).toBe(true);
    expect(view?.totals).toMatchObject({
      materialPassed: 1,
      materialTotal: 2,
      questionClear: 8,
      questionTotal: 8,
    });
  });
});

describe("buildCourseView for an advanced course", () => {
  const course = {
    course: {
      id: 1598,
      title: "英検対策",
      subject_category: { title: "英検対策" },
      // 3 of 4 counted materials are understood across the course: 75%.
      progress: { on_calculation: false, comprehension: { limit: 4, bad: 1, good: 3, perfect: 0 } },
      chapters: [
        {
          id: 1,
          title: "一つ目",
          resource_type: "chapter",
          progress: { comprehension: { limit: 2, bad: 0, good: 2, perfect: 0 } },
        },
        {
          id: 2,
          title: "二つ目",
          resource_type: "chapter",
          progress: { comprehension: { limit: 2, bad: 1, good: 1, perfect: 0 } },
        },
        {
          id: 3,
          title: "授業だけ",
          resource_type: "chapter",
          progress: { comprehension: { limit: 0, bad: 0, good: 0, perfect: 0 } },
        },
        {
          id: 4,
          title: "習熟度テスト 合格",
          resource_type: "short_test",
          content_url: "https://www.nnn.ed.nico/contents/courses/1598/short_tests/4",
          total_question: 16,
          time_limit: 1200,
          short_test_result: { passed: true, score: 14 },
        },
        {
          id: 5,
          title: "習熟度テスト 未受験",
          resource_type: "short_test",
          content_url: "https://www.nnn.ed.nico/contents/courses/1598/short_tests/5",
          total_question: 12,
          time_limit: 1800,
        },
      ],
    },
  };

  test("reads each chapter's comprehension, and counts the course from its counted materials", () => {
    const view = buildCourseView(course);
    expect(view?.chapters.map((row) => [row.kind, row.passed, row.total, row.status])).toEqual([
      ["chapter", 2, 2, "done"],
      ["chapter", 1, 2, "in_progress"],
      ["chapter", 0, 0, "no_progress"],
      ["short_test", 1, 1, "done"],
      ["short_test", 0, 1, "not_started"],
    ]);
    // Only chapters are counted: the lessons-only chapter is left out, and the short tests are not chapters.
    expect(view?.passedChapters).toBe(1);
    expect(view?.totalChapters).toBe(2);
    expect(view?.percent).toBe(75);
  });

  test("gives every row its shell path, and a short test its page and question facts", () => {
    const view = buildCourseView(course);
    expect(view?.chapters[1]?.path).toBe("/courses/1598/chapters/2");
    expect(view?.chapters[3]).toMatchObject({
      path: "/courses/1598/short_tests/4",
      test: {
        contentUrl: "https://www.nnn.ed.nico/contents/courses/1598/short_tests/4",
        questionCount: 16,
        timeLimitSeconds: 1200,
        score: 14,
      },
    });
    expect(view?.chapters[4]?.test).toMatchObject({ score: undefined, questionCount: 12 });
  });
});

describe("classifyPath for advanced materials", () => {
  test("routes an exercise and a guide to the material screen", () => {
    expect(classifyPath("/courses/2036/chapters/20212/exercise/1")).toEqual({
      kind: "material",
      resourceType: "exercise",
      courseId: 2036,
      chapterId: 20212,
      id: 1,
    });
    expect(classifyPath("/courses/2036/chapters/20212/guide/7")).toEqual({
      kind: "material",
      resourceType: "guide",
      courseId: 2036,
      chapterId: 20212,
      id: 7,
    });
  });

  test("leaves a lesson page to the site", () => {
    expect(classifyPath("/courses/2036/chapters/20212/lessons/4")).toEqual({ kind: "other" });
  });
});
