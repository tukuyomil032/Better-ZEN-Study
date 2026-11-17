export type MaterialResourceType =
  | "evaluation_test"
  | "essay_test"
  | "evaluation_report"
  | "essay_report"
  | "exercise"
  | "guide";

export type Route =
  | { kind: "my_course" }
  | { kind: "course"; courseId: number }
  | { kind: "month"; year: number; month: number }
  | { kind: "chapter"; courseId: number; chapterId: number }
  | { kind: "movie"; courseId: number; chapterId: number; movieId: number }
  | {
      kind: "material";
      resourceType: MaterialResourceType;
      courseId: number;
      chapterId: number;
      id: number;
    }
  // A short test (習熟度テスト) of an advanced course. It sits beside the chapters, not inside one.
  | { kind: "short_test"; courseId: number; testId: number }
  | { kind: "other" };

const MATERIAL_SEGMENTS: Readonly<Record<string, MaterialResourceType>> = {
  evaluation_test: "evaluation_test",
  // Essay and report URL segments are assumed to match resource_type; this is unverified.
  essay_test: "essay_test",
  evaluation_report: "evaluation_report",
  essay_report: "essay_report",
  // Advanced courses: practice problems and guides open in the same frame as a test.
  exercise: "exercise",
  guide: "guide",
};

function parseNumericSegment(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function classifyPath(pathname: string): Route {
  if (pathname === "/my_course" || pathname === "/my_course/") {
    return { kind: "my_course" };
  }

  const monthMatch = /^\/study_plans\/month\/(\d+)\/(\d+)\/?$/.exec(pathname);
  if (monthMatch) {
    const year = parseNumericSegment(monthMatch[1]!);
    const month = parseNumericSegment(monthMatch[2]!);
    if (year !== undefined && month !== undefined && month >= 1 && month <= 12) {
      return { kind: "month", year, month };
    }
    return { kind: "other" };
  }

  // The course page lists every chapter of one subject: /courses/{c}
  const courseMatch = /^\/courses\/(\d+)\/?$/.exec(pathname);
  if (courseMatch) {
    const courseId = parseNumericSegment(courseMatch[1]!);
    return courseId === undefined ? { kind: "other" } : { kind: "course", courseId };
  }

  const shortTestMatch = /^\/courses\/(\d+)\/short_tests\/(\d+)\/?$/.exec(pathname);
  if (shortTestMatch) {
    const courseId = parseNumericSegment(shortTestMatch[1]!);
    const testId = parseNumericSegment(shortTestMatch[2]!);
    if (courseId === undefined || testId === undefined) return { kind: "other" };
    return { kind: "short_test", courseId, testId };
  }

  const chapterMatch =
    /^\/courses\/(\d+)\/chapters\/(\d+)(?:\/(movie|evaluation_test|essay_test|evaluation_report|essay_report|exercise|guide)\/(\d+))?\/?$/.exec(
      pathname,
    );
  if (!chapterMatch) return { kind: "other" };

  const courseId = parseNumericSegment(chapterMatch[1]!);
  const chapterId = parseNumericSegment(chapterMatch[2]!);
  if (courseId === undefined || chapterId === undefined) return { kind: "other" };

  const segment = chapterMatch[3];
  const idText = chapterMatch[4];
  if (!segment) return { kind: "chapter", courseId, chapterId };

  const id = parseNumericSegment(idText!);
  if (id === undefined) return { kind: "other" };
  if (segment === "movie") return { kind: "movie", courseId, chapterId, movieId: id };

  const resourceType = MATERIAL_SEGMENTS[segment];
  if (!resourceType) return { kind: "other" };
  return { kind: "material", resourceType, courseId, chapterId, id };
}
