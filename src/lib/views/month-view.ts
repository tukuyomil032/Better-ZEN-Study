import { daysUntil } from "./dashboard-view";

export type MonthItem = {
  courseId: number;
  chapterId: number;
  subjectTitle: string;
  courseTitle: string;
  chapterTitle: string;
  passed: number;
  total: number;
  percent: number;
  completed: boolean;
  exempted: boolean;
};

export type MonthTestItem = {
  assessmentTestId: number;
  courseId: number;
  title: string;
  subjectTitle: string;
  courseTitle: string;
  exempted: boolean;
  drafted: boolean;
  answered: number;
  totalQuestions: number;
};

export type MonthGroup = {
  deadline: Date;
  deadlineLabel: string;
  daysLeft: number;
  items: MonthItem[];
  tests: MonthTestItem[];
};

export type MonthView = {
  year: number;
  month: number;
  percent: number;
  passedChapters: number;
  totalChapters: number;
  passedTests: number;
  totalTests: number;
  groups: MonthGroup[];
  completedItems: MonthItem[];
  isCompletedMonth: boolean;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function percentOf(passed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((passed / total) * 100)));
}

function monthItem(value: unknown): MonthItem {
  const item = asRecord(value) ?? {};
  const passed = finiteNumber(item.passed_count);
  const total = finiteNumber(item.total_count);
  return {
    courseId: finiteNumber(item.course_id),
    chapterId: finiteNumber(item.chapter_id),
    subjectTitle: stringValue(item.subject_category_title),
    courseTitle: stringValue(item.course_title),
    chapterTitle: stringValue(item.chapter_title),
    passed,
    total,
    percent: percentOf(passed, total),
    completed: total > 0 && passed >= total,
    exempted: item.exempted === true,
  };
}

function monthTest(value: unknown): MonthTestItem {
  const item = asRecord(value) ?? {};
  return {
    assessmentTestId: finiteNumber(item.assessment_test_id),
    courseId: finiteNumber(item.course_id),
    title: stringValue(item.title),
    subjectTitle: stringValue(item.subject_category_title),
    courseTitle: stringValue(item.course_title),
    exempted: item.exempted === true,
    drafted: item.drafted === true,
    answered: finiteNumber(item.total_answered_question),
    totalQuestions: finiteNumber(item.total_question),
  };
}

function arrayValues(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function validDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function dateForGroup(value: unknown, year: number, month: number): Date {
  return validDate(value) ?? new Date(year, month - 1, 1);
}

function chapterKey(item: MonthItem): string {
  return `${item.courseId}:${item.chapterId}`;
}

export function buildMonthView(raw: unknown, now: Date): MonthView | undefined {
  const data = asRecord(raw);
  if (!data) return undefined;
  if (
    typeof data.year !== "number" ||
    !Number.isFinite(data.year) ||
    typeof data.month !== "number" ||
    !Number.isFinite(data.month) ||
    data.month < 1 ||
    data.month > 12
  ) {
    return undefined;
  }

  const year = data.year;
  const month = data.month;
  const groups = arrayValues(data.deadline_groups).map((value): MonthGroup => {
    const group = asRecord(value) ?? {};
    const deadline = dateForGroup(group.deadline, year, month);
    const items = arrayValues(group.chapters).map(monthItem);
    const tests = arrayValues(group.assessment_tests).map(monthTest);
    return {
      deadline,
      deadlineLabel: `${deadline.getMonth() + 1}月${deadline.getDate()}日 期限`,
      daysLeft: daysUntil(deadline, now),
      items,
      tests,
    };
  });

  const deadlineChapterKeys = new Set(groups.flatMap((group) => group.items.map(chapterKey)));
  const completedItems: MonthItem[] = [];
  const completedKeys = new Set<string>();
  for (const value of arrayValues(data.completed_chapters)) {
    const item = monthItem(value);
    const key = chapterKey(item);
    if (deadlineChapterKeys.has(key) || completedKeys.has(key)) continue;
    completedKeys.add(key);
    completedItems.push(item);
  }

  const passedChapters = finiteNumber(data.passed_chapter_count);
  const totalChapters = finiteNumber(data.total_chapter_count);
  const passedTests = finiteNumber(data.passed_assessment_test_count);
  const totalTests = finiteNumber(data.total_assessment_test);
  // The site's progress figure counts every material; the chapter and test figure is the fallback
  // for a response that carries no material count.
  const passedMaterials = finiteNumber(data.passed_material_count);
  const totalMaterials = finiteNumber(data.total_material_count);
  const percent =
    totalMaterials > 0
      ? percentOf(passedMaterials, totalMaterials)
      : percentOf(passedChapters + passedTests, totalChapters + totalTests);
  return {
    year,
    month,
    percent,
    passedChapters,
    totalChapters,
    passedTests,
    totalTests,
    groups,
    completedItems,
    isCompletedMonth: !groups.some((group) => group.items.length > 0),
  };
}
