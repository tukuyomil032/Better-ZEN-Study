// The breadcrumb trail of each shell screen. Pure functions only, so the rules can be tested.
//
// Every crumb before the last one leads to the screen the user would expect to go back to, so
// pressing a crumb is the same as going back one level. The last crumb is the current screen and
// has no path.

export type DashboardTab = "reports" | "basic" | "advanced";
export type Service = "basic" | "advanced";
export type Crumb = { label: string; path?: string };

// The month a chapter was opened from, so its trail goes back to that month rather than the course.
export type MonthOrigin = { year: number; month: number };

export const TAB_LABELS: Readonly<Record<DashboardTab, string>> = {
  reports: "必修レポート",
  basic: "必修授業",
  advanced: "課外授業",
};

const SERVICE_TAB: Readonly<Record<Service, DashboardTab>> = {
  basic: "basic",
  advanced: "advanced",
};

export function isDashboardTab(value: string | null): value is DashboardTab {
  return value === "reports" || value === "basic" || value === "advanced";
}

export function dashboardPath(tab: DashboardTab): string {
  return `/my_course?tab=${tab}`;
}

export function monthPathOf(year: number, month: number): string {
  return `/study_plans/month/${year}/${month}?service=basic`;
}

export type TrailInput =
  | { screen: "my_course"; tab: DashboardTab }
  | { screen: "month"; year: number; month: number }
  | { screen: "course"; courseId: number; service: Service; courseTitle?: string }
  | {
      screen: "short_test";
      courseId: number;
      service: Service;
      courseTitle?: string;
      testTitle?: string;
    }
  | {
      screen: "chapter";
      courseId: number;
      service: Service;
      courseTitle?: string;
      chapterId: number;
      chapterTitle?: string;
      origin?: MonthOrigin;
    }
  | {
      screen: "material";
      courseId: number;
      service: Service;
      courseTitle?: string;
      chapterId: number;
      chapterTitle?: string;
      materialTitle?: string;
      origin?: MonthOrigin;
    };

// The crumbs from the top of the shell down to the current screen.
export function buildTrail(input: TrailInput): Crumb[] {
  const home: Crumb = { label: "マイコース", path: "/my_course" };

  if (input.screen === "my_course") {
    return [home, { label: TAB_LABELS[input.tab] }];
  }

  if (input.screen === "month") {
    return [
      home,
      { label: TAB_LABELS.reports, path: dashboardPath("reports") },
      { label: `${input.month}月のレポート` },
    ];
  }

  if (input.screen === "course") {
    return [
      home,
      {
        label: TAB_LABELS[SERVICE_TAB[input.service]],
        path: dashboardPath(SERVICE_TAB[input.service]),
      },
      { label: input.courseTitle ?? "コース" },
    ];
  }

  // A short test sits in the course, not in a chapter, so it goes back to the course.
  if (input.screen === "short_test") {
    return [
      home,
      {
        label: TAB_LABELS[SERVICE_TAB[input.service]],
        path: dashboardPath(SERVICE_TAB[input.service]),
      },
      { label: input.courseTitle ?? "コース", path: `/courses/${input.courseId}` },
      { label: input.testTitle ?? "習熟度テスト" },
    ];
  }

  // Chapter and material screens: a chapter opened from a month goes back to that month.
  const chapterCrumb: Crumb = {
    label: input.chapterTitle ?? "章",
    path: `/courses/${input.courseId}/chapters/${input.chapterId}`,
  };
  const prefix: Crumb[] = input.origin
    ? [
        home,
        { label: TAB_LABELS.reports, path: dashboardPath("reports") },
        {
          label: `${input.origin.month}月のレポート`,
          path: monthPathOf(input.origin.year, input.origin.month),
        },
      ]
    : [
        home,
        {
          label: TAB_LABELS[SERVICE_TAB[input.service]],
          path: dashboardPath(SERVICE_TAB[input.service]),
        },
        {
          label: input.courseTitle ?? "コース",
          path: `/courses/${input.courseId}`,
        },
      ];

  if (input.screen === "chapter") return [...prefix, { label: chapterCrumb.label }];
  return [...prefix, chapterCrumb, { label: input.materialTitle ?? "教材" }];
}

// Reads the origin month of a chapter or material from the history state it was opened with.
export function parseMonthOrigin(value: unknown): MonthOrigin | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const origin = (value as { origin?: unknown }).origin;
  if (typeof origin !== "object" || origin === null) return undefined;
  const { year, month } = origin as { year?: unknown; month?: unknown };
  if (
    typeof year !== "number" ||
    !Number.isSafeInteger(year) ||
    typeof month !== "number" ||
    !Number.isSafeInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return undefined;
  }
  return { year, month };
}
