export type CourseCard = {
  id: number;
  title: string;
  subjectLabel: string;
  reportPassed: number;
  reportTotal: number;
  testPassed: number;
  testTotal: number;
  percent: number;
  selected: boolean;
};

export type CourseListView = { totalCount: number; courses: CourseCard[] };

type UnknownRecord = Record<string, unknown>;

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

function subjectLabel(title: string): string {
  const separatorIndex = title.search(/[:：]/u);
  return (separatorIndex < 0 ? title : title.slice(0, separatorIndex)).trim();
}

export function buildCourseListView(
  raw: unknown,
  serviceName: "basic" | "advanced",
): CourseListView {
  const root = asRecord(raw);
  const services = root?.services;
  if (!Array.isArray(services)) return { totalCount: 0, courses: [] };

  const serviceRecords = services.map(asRecord);
  const service =
    serviceRecords.find((candidate) => candidate?.name === serviceName) ?? serviceRecords[0];
  if (!service) return { totalCount: 0, courses: [] };

  const courses = Array.isArray(service.courses) ? service.courses : [];
  return {
    totalCount: numberOrZero(service.total_course_count),
    courses: courses.map((value) => {
      const course = asRecord(value) ?? {};
      const progress = asRecord(course.progress) ?? {};
      const title = stringOrEmpty(course.title);
      const reportPassed = numberOrZero(progress.passed_count);
      const reportTotal = numberOrZero(progress.total_count);
      const testPassed = numberOrZero(progress.passed_assessment_test_count);
      const testTotal = numberOrZero(progress.total_assessment_test);

      return {
        id: numberOrZero(course.id),
        title,
        subjectLabel: subjectLabel(title),
        reportPassed,
        reportTotal,
        testPassed,
        testTotal,
        percent: percentage(reportPassed + testPassed, reportTotal + testTotal),
        selected: typeof course.selected === "boolean" ? course.selected : false,
      };
    }),
  };
}

export function filterCourses(courses: CourseCard[], query: string): CourseCard[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return courses;

  return courses.filter(
    (course) =>
      course.title.toLowerCase().includes(normalizedQuery) ||
      course.subjectLabel.toLowerCase().includes(normalizedQuery),
  );
}

export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): { page: number; pageCount: number; items: T[] } {
  const safePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 1;
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  const requestedPage = Number.isFinite(page) ? Math.floor(page) : 1;
  const currentPage = Math.min(pageCount, Math.max(1, requestedPage));
  const start = (currentPage - 1) * safePageSize;

  return {
    page: currentPage,
    pageCount,
    items: items.slice(start, start + safePageSize),
  };
}
