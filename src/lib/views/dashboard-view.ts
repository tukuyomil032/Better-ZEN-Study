// Turns the dashboard API responses into the numbers the management screen shows.
// Pure functions only: no DOM, no browser APIs, so the screen stays thin and testable.

export type MonthlySummaryRaw = {
  year: number;
  month: number;
  earliest_report_deadline: string;
  total_chapter_count: number;
  passed_chapter_count: number;
  total_assessment_test: number;
  passed_assessment_test_count: number;
};

export type MonthCard = {
  year: number;
  month: number;
  label: string;
  deadline: Date;
  daysLeft: number;
  status: "done" | "active" | "overdue";
  chapterPassed: number;
  chapterTotal: number;
  testPassed: number;
  testTotal: number;
  percent: number;
};

export type DashboardView = {
  months: MonthCard[];
  nextDeadline: MonthCard | undefined;
  chapterPassed: number;
  chapterTotal: number;
  testPassed: number;
  testTotal: number;
  percent: number;
  activeMonths: number;
  doneMonths: number;
};

// The material count of one month, from that month's own response. The site's progress figure
// counts every material (movies, tests, reports and so on), so a month shows this figure when it
// is known.
export type MonthMaterial = { passed: number; total: number };

// Material counts keyed by monthKey. A month missing from the map falls back to chapters and tests.
export type MaterialCounts = ReadonlyMap<string, MonthMaterial>;

export function monthKey(year: number, month: number): string {
  return `${year}-${month}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Days from today to the deadline day, counting today. Negative when the deadline has passed.
export function daysUntil(deadline: Date, now: Date): number {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

// Rounds to the nearest whole percent, the way the site shows its own progress figure.
function percentOf(passed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((passed / total) * 100));
}

export function monthCard(raw: MonthlySummaryRaw, now: Date, material?: MonthMaterial): MonthCard {
  const deadline = new Date(raw.earliest_report_deadline);
  const chapterTotal = raw.total_chapter_count;
  const chapterPassed = raw.passed_chapter_count;
  const testTotal = raw.total_assessment_test;
  const testPassed = raw.passed_assessment_test_count;
  const done = chapterTotal > 0 && chapterPassed >= chapterTotal && testPassed >= testTotal;
  const daysLeft = daysUntil(deadline, now);
  const status: MonthCard["status"] = done ? "done" : daysLeft < 0 ? "overdue" : "active";
  const percent =
    material && material.total > 0
      ? percentOf(material.passed, material.total)
      : percentOf(chapterPassed + testPassed, chapterTotal + testTotal);
  return {
    year: raw.year,
    month: raw.month,
    label: `${raw.month}月のレポート`,
    deadline,
    daysLeft,
    status,
    chapterPassed,
    chapterTotal,
    testPassed,
    testTotal,
    percent,
  };
}

// The whole view's figure: the months' material counts added together when every month has one,
// otherwise the chapters and tests of every month.
function overallPercent(
  summaries: readonly MonthlySummaryRaw[],
  materials: MaterialCounts | undefined,
  fallbackPassed: number,
  fallbackTotal: number,
): number {
  const known = summaries.map((raw) => materials?.get(monthKey(raw.year, raw.month)));
  const complete =
    summaries.length > 0 &&
    known.every(
      (material): material is MonthMaterial => material !== undefined && material.total > 0,
    );
  if (!complete) return percentOf(fallbackPassed, fallbackTotal);
  const passed = known.reduce((sum, material) => sum + (material?.passed ?? 0), 0);
  const total = known.reduce((sum, material) => sum + (material?.total ?? 0), 0);
  return percentOf(passed, total);
}

// Builds the whole dashboard view. Months keep the API order (the site's own order).
export function buildDashboardView(
  summaries: readonly MonthlySummaryRaw[],
  now: Date,
  materials?: MaterialCounts,
): DashboardView {
  const months = summaries.map((raw) =>
    monthCard(raw, now, materials?.get(monthKey(raw.year, raw.month))),
  );
  const open = months.filter((month) => month.status !== "done");
  const nextDeadline = open
    .filter((month) => month.daysLeft >= 0)
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())[0];

  const chapterPassed = months.reduce((sum, month) => sum + month.chapterPassed, 0);
  const chapterTotal = months.reduce((sum, month) => sum + month.chapterTotal, 0);
  const testPassed = months.reduce((sum, month) => sum + month.testPassed, 0);
  const testTotal = months.reduce((sum, month) => sum + month.testTotal, 0);

  return {
    months,
    nextDeadline,
    chapterPassed,
    chapterTotal,
    testPassed,
    testTotal,
    percent: overallPercent(
      summaries,
      materials,
      chapterPassed + testPassed,
      chapterTotal + testTotal,
    ),
    activeMonths: open.length,
    doneMonths: months.length - open.length,
  };
}

// The day of the month every deadline falls on, when they all fall on the same day (the site
// sets the report deadline to the 15th each month). Undefined when the days differ or there are
// no months.
export function sharedDeadlineDay(months: readonly MonthCard[]): number | undefined {
  if (months.length === 0) return undefined;
  const day = months[0]?.deadline.getDate();
  if (day === undefined) return undefined;
  return months.every((month) => month.deadline.getDate() === day) ? day : undefined;
}
