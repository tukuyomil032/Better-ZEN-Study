import { describe, expect, test } from "bun:test";
import {
  buildCourseListView,
  filterCourses,
  paginate,
  type CourseCard,
} from "../src/lib/views/course-list-view";

const response = {
  services: [
    {
      name: "basic",
      total_course_count: 5,
      courses: [
        {
          id: 1,
          title: " 国語表現：普通科ベーシック ",
          selected: true,
          progress: {
            total_count: 8,
            passed_count: 3,
            total_assessment_test: 2,
            passed_assessment_test_count: 1,
          },
        },
        {
          id: 2,
          title: "数学I",
          selected: false,
          progress: { total_count: 0, passed_count: 2 },
        },
      ],
    },
    { name: "advanced", total_course_count: 1, courses: [{ id: 9, title: "英語" }] },
  ],
};

describe("buildCourseListView", () => {
  test("selects the requested service and derives card fields", () => {
    const view = buildCourseListView(response, "basic");
    expect(view.totalCount).toBe(5);
    expect(view.courses[0]).toEqual({
      id: 1,
      title: " 国語表現：普通科ベーシック ",
      subjectLabel: "国語表現",
      reportPassed: 3,
      reportTotal: 8,
      testPassed: 1,
      testTotal: 2,
      percent: 40,
      selected: true,
    });
    expect(buildCourseListView(response, "advanced").courses[0]?.id).toBe(9);
  });

  test("uses the first service when no service name matches", () => {
    expect(
      buildCourseListView(
        { services: [{ name: "other", total_course_count: 2, courses: [{ id: 7 }] }] },
        "basic",
      ),
    ).toEqual({
      totalCount: 2,
      courses: [
        {
          id: 7,
          title: "",
          subjectLabel: "",
          reportPassed: 0,
          reportTotal: 0,
          testPassed: 0,
          testTotal: 0,
          percent: 0,
          selected: false,
        },
      ],
    });
  });

  test("returns an empty view for malformed input and applies field fallbacks", () => {
    expect(buildCourseListView(null, "basic")).toEqual({ totalCount: 0, courses: [] });
    expect(buildCourseListView([], "basic")).toEqual({ totalCount: 0, courses: [] });
    expect(buildCourseListView({}, "basic")).toEqual({ totalCount: 0, courses: [] });
    expect(
      buildCourseListView(
        { services: [{ courses: [null, { id: "bad", title: 3, progress: [] }] }] },
        "basic",
      ),
    ).toEqual({
      totalCount: 0,
      courses: [
        {
          id: 0,
          title: "",
          subjectLabel: "",
          reportPassed: 0,
          reportTotal: 0,
          testPassed: 0,
          testTotal: 0,
          percent: 0,
          selected: false,
        },
        {
          id: 0,
          title: "",
          subjectLabel: "",
          reportPassed: 0,
          reportTotal: 0,
          testPassed: 0,
          testTotal: 0,
          percent: 0,
          selected: false,
        },
      ],
    });
  });

  test("uses the full trimmed title when there is no colon and clamps percent", () => {
    const view = buildCourseListView(
      {
        services: [
          {
            name: "basic",
            courses: [
              {
                title: "  Biology  ",
                selected: true,
                progress: { total_count: 1, passed_count: 3 },
              },
            ],
          },
        ],
      },
      "basic",
    );
    expect(view.courses[0]?.subjectLabel).toBe("Biology");
    expect(view.courses[0]?.percent).toBe(100);
  });
});

describe("filterCourses", () => {
  const courses = buildCourseListView(response, "basic").courses;

  test("matches title or subject label without case sensitivity", () => {
    expect(filterCourses(courses, "  国語表現 ")).toHaveLength(1);
    expect(filterCourses(courses, "MATHEMATICS")).toHaveLength(0);
    expect(filterCourses([{ ...courses[1]!, title: "Mathematics I" }], "math")).toHaveLength(1);
  });

  test("returns every course for an empty or whitespace query", () => {
    expect(filterCourses(courses, "")).toBe(courses);
    expect(filterCourses(courses, "  ")).toBe(courses);
  });
});

describe("paginate", () => {
  test("clamps pages and enforces a page size of at least one", () => {
    expect(paginate([1, 2, 3], 0, 2)).toEqual({ page: 1, pageCount: 2, items: [1, 2] });
    expect(paginate([1, 2, 3], 99, 2)).toEqual({ page: 2, pageCount: 2, items: [3] });
    expect(paginate([1, 2], 2, 0)).toEqual({ page: 2, pageCount: 2, items: [2] });
  });

  test("returns one empty page for an empty list", () => {
    expect(paginate<CourseCard>([], 12, 10)).toEqual({ page: 1, pageCount: 1, items: [] });
  });
});
