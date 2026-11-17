import { normalizeContentUrl } from "../chapter-sections";

// chapter: a chapter of the course. short_test: a 習熟度テスト, opened in the shell. assessment_test:
// a 定期テスト of a required course, which the site opens on its own page.
export type CourseRowKind = "chapter" | "short_test" | "assessment_test";

// A test row's own facts. Chapter rows carry none.
export type TestInfo = {
  // The site's own page for a short test, when its address passes the check. Empty when there is none.
  contentUrl: string;
  questionCount: number;
  timeLimitSeconds: number;
  // The score of the last attempt (short test) or the scale score (periodic test), when there is one.
  score: number | undefined;
  // Questions answered so far in a periodic test. A short test has no such count, so it is 0.
  answeredCount: number;
  // The highest scale score a periodic test can reach.
  maxScore: number | undefined;
};

export type CourseChapterRow = {
  id: number;
  kind: CourseRowKind;
  title: string;
  resourceType: string;
  passed: number;
  total: number;
  percent: number;
  // "no_progress": the chapter has nothing to count, for example a chapter of lessons only.
  status: "done" | "in_progress" | "not_started" | "no_progress";
  subjectTitle: string;
  // Where the row opens in the shell (or, for a periodic test, on the site).
  path: string;
  test: TestInfo | undefined;
};

export type CourseView = {
  id: number;
  title: string;
  subjectTitle: string;
  // Which list the course belongs to: required (basic) or N-plus-style advanced courses.
  service: "basic" | "advanced";
  outline: string;
  percent: number;
  // Chapters only: tests are listed but not counted as chapters.
  passedChapters: number;
  totalChapters: number;
  chapters: CourseChapterRow[];
};

type UnknownRecord = Record<string, unknown>;
type Counts = { passed: number; total: number };

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function percentage(passed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((passed / total) * 100)));
}

// Whether a row opens on the site's own page rather than in the shell. A periodic test does: its
// question pages carry a face check and their own steps, which the site runs.
export function opensOnSite(kind: CourseRowKind): boolean {
  return kind === "assessment_test";
}

// The label of a test row's status: 合格, 受験中, or 未受験. A test that was tried but not passed is
// 受験中 when it is a periodic test (answers are in) and 未合格 when it is a short test (one attempt
// was graded). Returns undefined for a chapter row.
export function testStatusLabel(row: CourseChapterRow): string | undefined {
  if (row.kind === "chapter") return undefined;
  if (row.status === "done") return "合格";
  if (row.status === "in_progress") return row.kind === "assessment_test" ? "受験中" : "未合格";
  return "未受験";
}

// An advanced course's progress: one count per material that is counted (limit), and how many of
// them are understood (good or perfect). Lessons are not counted, so a chapter of lessons has a
// limit of 0. The site's checkpoint is not used: it reads 1 of 1 whatever has been studied.
function comprehensionCounts(comprehension: UnknownRecord): Counts {
  return {
    passed: numberOrZero(comprehension.good) + numberOrZero(comprehension.perfect),
    total: numberOrZero(comprehension.limit),
  };
}

// A basic chapter reports passed_count and total_count. An advanced chapter reports comprehension.
function chapterCounts(progress: UnknownRecord): Counts | undefined {
  if (typeof progress.total_count === "number") {
    return {
      passed: numberOrZero(progress.passed_count),
      total: numberOrZero(progress.total_count),
    };
  }
  const comprehension = asRecord(progress.comprehension);
  return comprehension ? comprehensionCounts(comprehension) : undefined;
}

function statusOf(counts: Counts): CourseChapterRow["status"] {
  if (counts.total > 0 && counts.passed >= counts.total) return "done";
  return counts.passed > 0 ? "in_progress" : "not_started";
}

function chapterRow(item: UnknownRecord, courseId: number, subjectTitle: string): CourseChapterRow {
  const id = numberOrZero(item.id);
  const progress = asRecord(item.progress) ?? {};
  const counts = chapterCounts(progress) ?? { passed: 0, total: 0 };
  const isComprehension =
    typeof progress.total_count !== "number" && asRecord(progress.comprehension) !== undefined;
  const status: CourseChapterRow["status"] =
    isComprehension && counts.total === 0 ? "no_progress" : statusOf(counts);

  return {
    id,
    kind: "chapter",
    title: stringOrEmpty(item.title),
    resourceType: stringOrEmpty(item.resource_type),
    passed: counts.passed,
    total: counts.total,
    percent: percentage(counts.passed, counts.total),
    status,
    subjectTitle,
    path: `/courses/${courseId}/chapters/${id}`,
    test: undefined,
  };
}

// A short test is one question set: it counts as 1 of 1 once it is passed.
function shortTestRow(
  item: UnknownRecord,
  courseId: number,
  subjectTitle: string,
): CourseChapterRow {
  const id = numberOrZero(item.id);
  const result = asRecord(item.short_test_result);
  const passed = result?.passed === true;
  const status: CourseChapterRow["status"] = passed
    ? "done"
    : result !== undefined
      ? "in_progress"
      : "not_started";

  return {
    id,
    kind: "short_test",
    title: stringOrEmpty(item.title),
    resourceType: "short_test",
    passed: passed ? 1 : 0,
    total: 1,
    percent: passed ? 100 : 0,
    status,
    subjectTitle,
    path: `/courses/${courseId}/short_tests/${id}`,
    test: {
      contentUrl: normalizeContentUrl(item.content_url) ?? "",
      questionCount: numberOrZero(item.total_question),
      timeLimitSeconds: numberOrZero(item.time_limit),
      score: typeof result?.score === "number" ? result.score : undefined,
      answeredCount: 0,
      maxScore: undefined,
    },
  };
}

// A periodic test (定期テスト) of a required course. The row carries its own counts: questions,
// answers so far, scale scores. It is not a chapter, and it has no page the shell can show.
function assessmentTestRow(
  item: UnknownRecord,
  courseId: number,
  subjectTitle: string,
): CourseChapterRow {
  const id = numberOrZero(item.id);
  const passed = item.status === "passed";
  const answeredCount = numberOrZero(item.total_answered_question);
  const status: CourseChapterRow["status"] = passed
    ? "done"
    : answeredCount > 0
      ? "in_progress"
      : "not_started";

  return {
    id,
    kind: "assessment_test",
    title: stringOrEmpty(item.title),
    resourceType: "assessment_test",
    passed: passed ? 1 : 0,
    total: 1,
    percent: passed ? 100 : 0,
    status,
    subjectTitle,
    path: `/courses/${courseId}/assessment_tests/${id}`,
    test: {
      contentUrl: "",
      questionCount: numberOrZero(item.total_question),
      timeLimitSeconds: numberOrZero(item.time_limit),
      score: typeof item.scale_score === "number" ? item.scale_score : undefined,
      answeredCount,
      maxScore: typeof item.max_scale_score === "number" ? item.max_scale_score : undefined,
    },
  };
}

export function buildCourseView(raw: unknown): CourseView | undefined {
  const course = asRecord(asRecord(raw)?.course);
  if (!course) return undefined;

  const progress = asRecord(course.progress) ?? {};
  const courseId = numberOrZero(course.id);
  const totalMaterials = numberOrZero(progress.total_materials);
  const passedMaterials = numberOrZero(progress.passed_materials);
  const chapters = Array.isArray(course.chapters) ? course.chapters : [];
  const subjectTitle = stringOrEmpty(asRecord(course.subject_category)?.title);

  const rows: CourseChapterRow[] = chapters.map((value) => {
    const item = asRecord(value) ?? {};
    if (item.resource_type === "short_test") return shortTestRow(item, courseId, subjectTitle);
    if (item.resource_type === "assessment_test") {
      return assessmentTestRow(item, courseId, subjectTitle);
    }
    return chapterRow(item, courseId, subjectTitle);
  });
  // Only chapters are counted: tests are listed beside them, but they are not chapters.
  const chapterRows = rows.filter((row) => row.kind === "chapter");
  // A chapter with nothing to count is left out of the totals, so it cannot hold the course back.
  const countedRows = chapterRows.filter((row) => row.status !== "no_progress");

  // Basic courses report their own chapter totals. Advanced courses do not, so the counted chapters
  // are used.
  const hasChapterTotals = typeof progress.total_chapters === "number";
  const passedChapters = hasChapterTotals
    ? numberOrZero(progress.passed_chapters)
    : countedRows.filter((row) => row.status === "done").length;
  const totalChapters = hasChapterTotals
    ? numberOrZero(progress.total_chapters)
    : countedRows.length;

  const courseComprehension = asRecord(progress.comprehension);
  const courseCounts = courseComprehension ? comprehensionCounts(courseComprehension) : undefined;

  let percent: number;
  if (totalMaterials > 0) {
    percent = percentage(passedMaterials, totalMaterials);
  } else if (typeof progress.total_count === "number") {
    percent = percentage(numberOrZero(progress.passed_count), numberOrZero(progress.total_count));
  } else if (courseCounts && courseCounts.total > 0) {
    percent = percentage(courseCounts.passed, courseCounts.total);
  } else {
    percent = percentage(
      chapterRows.reduce((sum, row) => sum + row.passed, 0),
      chapterRows.reduce((sum, row) => sum + row.total, 0),
    );
  }

  return {
    id: courseId,
    title: stringOrEmpty(course.title),
    subjectTitle,
    service: course.type === "advanced" ? "advanced" : "basic",
    outline: stringOrEmpty(course.outline),
    percent,
    passedChapters,
    totalChapters,
    chapters: rows,
  };
}
