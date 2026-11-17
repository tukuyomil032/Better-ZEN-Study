import { expect, test } from "bun:test";
import { classifyPath } from "../src/lib/routes";

test("classifies supported paths and optional trailing slashes", () => {
  expect(classifyPath("/my_course")).toEqual({ kind: "my_course" });
  expect(classifyPath("/my_course/")).toEqual({ kind: "my_course" });
  expect(classifyPath("/study_plans/month/2026/12/")).toEqual({
    kind: "month",
    year: 2026,
    month: 12,
  });
  expect(classifyPath("/courses/2472/chapters/31713")).toEqual({
    kind: "chapter",
    courseId: 2472,
    chapterId: 31713,
  });
  expect(classifyPath("/courses/2472/chapters/31713/movie/46100")).toEqual({
    kind: "movie",
    courseId: 2472,
    chapterId: 31713,
    movieId: 46100,
  });
  expect(classifyPath("/courses/2472/chapters/31713/evaluation_test/7186")).toEqual({
    kind: "material",
    resourceType: "evaluation_test",
    courseId: 2472,
    chapterId: 31713,
    id: 7186,
  });
  expect(classifyPath("/courses/2472/chapters/31713/essay_test/3219").kind).toBe("material");
  expect(classifyPath("/courses/2472/chapters/31713/evaluation_report/1620").kind).toBe("material");
  expect(classifyPath("/courses/2472/chapters/31713/essay_report/1627").kind).toBe("material");
});

test("classifies a short test of a course, beside its chapters", () => {
  expect(classifyPath("/courses/302/short_tests/230")).toEqual({
    kind: "short_test",
    courseId: 302,
    testId: 230,
  });
  expect(classifyPath("/courses/302/short_tests/230/")).toEqual({
    kind: "short_test",
    courseId: 302,
    testId: 230,
  });
  expect(classifyPath("/courses/302/short_tests/x")).toEqual({ kind: "other" });
});

test("returns other for unknown, malformed, or non-numeric paths", () => {
  expect(classifyPath("/courses/nope/chapters/31713")).toEqual({ kind: "other" });
  expect(classifyPath("/courses/2472/chapters/31713/movie/x")).toEqual({ kind: "other" });
  expect(classifyPath("/somewhere/else")).toEqual({ kind: "other" });
  expect(classifyPath("/study_plans/month/2026/13")).toEqual({ kind: "other" });
  expect(classifyPath("/courses/2472/chapters/31713?service=basic")).toEqual({ kind: "other" });
});
