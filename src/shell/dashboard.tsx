import { useEffect, useState } from "react";
import {
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  Flame,
  Gauge,
  ListChecks,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatedCounter } from "@/components/arc/animated-counter/animated-counter";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Progress } from "@/components/arc/progress/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs";
import {
  buildCourseListView,
  filterCourses,
  paginate,
  type CourseCard,
} from "@/lib/views/course-list-view";
import {
  buildDashboardView,
  sharedDeadlineDay,
  type DashboardView,
  type MonthCard,
  type MonthlySummaryRaw,
} from "@/lib/views/dashboard-view";
import { useApi, useStudy, type ApiGet, type StudySnapshot } from "./data";
import {
  loadMonthMaterials,
  loadRemainingSeconds,
  type MonthRef,
  type RemainingTotal,
} from "./plan-data";
import { computePace, type PaceResult } from "@/lib/pace";
import { computeStreak, lastNDays } from "@/lib/study-log";
import { Block, Notice } from "./ui";
import { SubjectIcon } from "./subject-icon";
import {
  buildTrail,
  dashboardPath,
  isDashboardTab,
  TAB_LABELS,
  type DashboardTab,
} from "@/lib/trail";
import { queryParam, replacePath, useRoute } from "./router";
import { useTrail } from "./trail";
import { shellLog } from "./log";
import styles from "./dashboard.module.css";

type ReportProgressesResponse = { monthly_summaries: MonthlySummaryRaw[] };

const COURSE_PAGE_SIZE = 12;
const COURSE_API_PAGE = 20;
const COURSE_API_MAX_PAGES = 10;

function shortDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// The site's own address for one month's report page.
export function monthPath(year: number, month: number): string {
  return `/study_plans/month/${year}/${month}?service=basic`;
}

// A KPI tile: the label, then the value and its unit on one line in the same size and weight.
function KpiTile({
  icon: Icon,
  label,
  value,
  suffix,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <article className={styles.kpi}>
      <span className={styles.kpiIcon} aria-hidden="true">
        <Icon size={18} />
      </span>
      <div className={styles.kpiBody}>
        <span className={styles.kpiLabel}>{label}</span>
        <span className={styles.kpiValue}>
          <AnimatedCounter value={value} />
          {suffix && <span>{suffix}</span>}
        </span>
      </div>
    </article>
  );
}

// A month tile is a button: pressing it opens that month's report page inside the shell. Each
// fact appears once: the percent, the bar, the status, and the counts. When every month shares
// one deadline day, the day is named once above the tiles and left off each tile.
function MonthTile({
  month,
  sharedDay,
  onOpen,
}: {
  month: MonthCard;
  sharedDay: number | undefined;
  onOpen: (path: string) => void;
}) {
  const daysText =
    month.status === "done"
      ? "完了"
      : month.status === "overdue"
        ? `${-month.daysLeft}日過ぎ`
        : `あと${month.daysLeft}日`;
  const deadlineText = sharedDay === undefined ? `${shortDate(month.deadline)}・` : "";
  return (
    <button
      type="button"
      className={styles.month}
      data-status={month.status}
      aria-label={`${month.month}月のレポートを開く`}
      onClick={() => onOpen(monthPath(month.year, month.month))}
    >
      <span className={styles.monthHead}>
        <span className={styles.monthTitle}>{month.month}月</span>
        <span className={styles.monthPercent}>{month.percent}%</span>
      </span>
      <Progress value={month.percent} />
      <span className={styles.monthStatus} data-status={month.status}>
        {deadlineText}
        {daysText}
      </span>
      <span className={styles.monthCounts}>
        章 {month.chapterPassed}/{month.chapterTotal}
      </span>
      <span className={styles.monthCounts}>
        テスト {month.testPassed}/{month.testTotal}
      </span>
    </button>
  );
}

function ReportsPanel({ view, onOpen }: { view: DashboardView; onOpen: (path: string) => void }) {
  const next = view.nextDeadline;
  const months: MonthRef[] = view.months.map((month) => ({ year: month.year, month: month.month }));
  const sharedDay = sharedDeadlineDay(view.months);
  return (
    <div className={styles.stack}>
      <section className={styles.kpis} aria-label="全体の状況">
        <KpiTile
          icon={CalendarClock}
          label="締切まであと"
          value={next ? Math.max(0, next.daysLeft) : 0}
          suffix="日"
        />
        <KpiTile icon={Gauge} label="全体の進み" value={view.percent} suffix="%" />
        <KpiTile
          icon={ListChecks}
          label="章"
          value={view.chapterPassed}
          suffix={`/${view.chapterTotal}`}
        />
        <KpiTile
          icon={ClipboardCheck}
          label="確認テスト"
          value={view.testPassed}
          suffix={`/${view.testTotal}`}
        />
        <KpiTile icon={CalendarRange} label="残りの月" value={view.activeMonths} suffix="か月" />
      </section>

      <section className={`${styles.block} ${styles.monthsBlock}`} aria-labelledby="months-title">
        <header className={styles.blockHead}>
          <h2 id="months-title" className={styles.blockTitle}>
            月ごとのレポート
          </h2>
          <span className={styles.blockNote}>
            {sharedDay !== undefined ? `毎月${sharedDay}日締切` : `${view.months.length}か月`}
          </span>
        </header>
        <div className={styles.months}>
          {view.months.map((month) => (
            <MonthTile
              key={`${month.year}-${month.month}`}
              month={month}
              sharedDay={sharedDay}
              onOpen={onOpen}
            />
          ))}
        </div>
      </section>

      <StudyPanel months={months} />
    </div>
  );
}

// This browser's study record and plan: today, this week, the last fourteen days, the pace
// against the plan, and the streak.
function formatMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}分`;
  return `${Math.floor(minutes / 60)}時間${minutes % 60}分`;
}

const PACE_TEXT: Record<PaceResult["state"], string> = {
  ahead: "予定より進んでいます",
  on_track: "予定どおりです",
  behind: "予定より遅れています",
  no_plan: "学習計画を設定すると、ペースを表示します",
};

function StudyPanel({ months }: { months: MonthRef[] }) {
  const api = useApi();
  const readStudy = useStudy();
  const [snapshot, setSnapshot] = useState<StudySnapshot | undefined>(undefined);
  const [remaining, setRemaining] = useState<RemainingTotal | undefined>(undefined);
  const monthsKey = months.map((month) => `${month.year}-${month.month}`).join(",");

  useEffect(() => {
    let active = true;
    readStudy()
      .then((value) => {
        if (active) setSnapshot(value);
      })
      .catch(() => {
        if (active) setSnapshot(undefined);
      });
    return () => {
      active = false;
    };
  }, [readStudy]);

  const includeSupplement = snapshot?.includeSupplement ?? false;
  useEffect(() => {
    if (months.length === 0) return;
    let active = true;
    setRemaining(undefined);
    loadRemainingSeconds(api, months, includeSupplement)
      .then((value) => {
        if (active) setRemaining(value);
      })
      .catch(() => {
        if (active) setRemaining({ remainingSeconds: 0, chapterCount: 0, failures: 1 });
      });
    return () => {
      active = false;
    };
    // The months are identified by monthsKey; the list itself is rebuilt on every render.
  }, [api, monthsKey, includeSupplement]);

  if (!snapshot) return <Notice>学習の記録を読んでいます…</Notice>;

  const today = new Date();
  const days = lastNDays(snapshot.log, today, 14);
  const todaySeconds = days[days.length - 1]?.seconds ?? 0;
  const weekSeconds = days.slice(-7).reduce((total, day) => total + day.seconds, 0);
  const peak = Math.max(1, ...days.map((day) => day.seconds));
  const streak = computeStreak(snapshot.log, today, snapshot.plan.streakMinMinutes * 60);
  const pace = remaining
    ? computePace({
        remainingSeconds: remaining.remainingSeconds,
        log: snapshot.log,
        plan: snapshot.plan,
        today,
      })
    : undefined;
  const goalPercent =
    pace && pace.dailyGoalSeconds > 0
      ? Math.min(100, Math.round((todaySeconds / pace.dailyGoalSeconds) * 100))
      : 0;

  return (
    <section className={styles.study} aria-label="学習の記録">
      <div className={styles.block}>
        <div className={styles.placeholderHead}>
          <span className={styles.kpiIcon} aria-hidden="true">
            <Gauge size={18} />
          </span>
          <h2 className={styles.blockTitle}>学習の記録</h2>
          <span className={styles.blockNote}>
            今日 {formatMinutes(todaySeconds)}・今週 {formatMinutes(weekSeconds)}
          </span>
        </div>
        <div className={styles.bars} role="img" aria-label="直近14日の学習時間">
          {days.map((day) => (
            <span
              key={day.key}
              className={styles.bar}
              data-empty={day.seconds > 0 ? undefined : ""}
              style={{ height: `${Math.max(4, Math.round((day.seconds / peak) * 100))}%` }}
              title={`${day.key}: ${formatMinutes(day.seconds)}`}
            />
          ))}
        </div>
      </div>

      <div className={styles.block}>
        <div className={styles.placeholderHead}>
          <span className={styles.kpiIcon} aria-hidden="true">
            <CalendarRange size={18} />
          </span>
          <h2 className={styles.blockTitle}>学習のペース</h2>
        </div>
        {!pace && <p className={styles.note}>残りの動画を数えています…</p>}
        {pace && pace.state === "no_plan" && <p className={styles.note}>{PACE_TEXT.no_plan}</p>}
        {pace && pace.state !== "no_plan" && (
          <>
            <Progress value={goalPercent} label="今日の目標" showValue />
            <p className={styles.note}>
              {PACE_TEXT[pace.state]}・今日 {formatMinutes(todaySeconds)} / 目標{" "}
              {formatMinutes(pace.dailyGoalSeconds)}
            </p>
            <p className={styles.note}>
              見込み {pace.etaDate ?? "—"}
              {pace.finishDeadlineDelta !== null &&
                `・期限まで ${pace.finishDeadlineDelta >= 0 ? `${pace.finishDeadlineDelta}日の余裕` : `${-pace.finishDeadlineDelta}日遅れ`}`}
            </p>
          </>
        )}
      </div>

      <div className={styles.block}>
        <div className={styles.placeholderHead}>
          <span className={styles.kpiIcon} aria-hidden="true">
            <Flame size={18} />
          </span>
          <h2 className={styles.blockTitle}>連続記録</h2>
        </div>
        <div className={styles.streakStats}>
          <div className={styles.streakMetric}>
            <span className={styles.streakLabel}>現在</span>
            <span className={styles.streakNumber}>
              <AnimatedCounter value={streak.current} suffix="日" />
            </span>
          </div>
          <div className={styles.streakMetric}>
            <span className={styles.streakLabel}>最長</span>
            <span className={styles.streakNumber}>
              <AnimatedCounter value={streak.longest} suffix="日" />
            </span>
          </div>
        </div>
        <p className={styles.streakNote}>
          {streak.todayCounted
            ? "今日の分は達成しています。"
            : `${snapshot.plan.streakMinMinutes}分以上見た日が続くと、連続日数が増えます。`}
        </p>
      </div>
    </section>
  );
}

// Loads every course of one service. The API pages with offset, so the pages are merged into
// one response that the view builder reads the same way as a single page.
async function fetchAllCourses(api: ApiGet, service: "basic" | "advanced"): Promise<unknown> {
  const courses: unknown[] = [];
  let totalCount = 0;
  let name: unknown = service;
  for (let page = 0; page < COURSE_API_MAX_PAGES; page += 1) {
    const offset = page * COURSE_API_PAGE;
    const raw = (await api(
      `/v3/dashboard/my_courses?service=${service}&limit=${COURSE_API_PAGE}&offset=${offset}`,
    )) as { services?: { name?: unknown; total_course_count?: unknown; courses?: unknown[] }[] };
    const entry = raw.services?.find((item) => item.name === service) ?? raw.services?.[0];
    const pageCourses = Array.isArray(entry?.courses) ? entry.courses : [];
    if (entry) {
      name = entry.name ?? name;
      totalCount =
        typeof entry.total_course_count === "number" ? entry.total_course_count : totalCount;
    }
    courses.push(...pageCourses);
    if (pageCourses.length === 0 || courses.length >= totalCount) break;
  }
  return { services: [{ name, total_course_count: totalCount, courses }] };
}

function CourseTile({ course, onOpen }: { course: CourseCard; onOpen: (path: string) => void }) {
  return (
    <button type="button" className={styles.course} onClick={() => onOpen(`/courses/${course.id}`)}>
      <span className={styles.courseHead}>
        <SubjectIcon subject={course.subjectLabel} />
        <span className={styles.courseSubject}>{course.subjectLabel}</span>
      </span>
      <span className={styles.courseTitle}>{course.title}</span>
      {/* Advanced courses report no report or test counts, so their zero figures are left out. */}
      {course.reportTotal + course.testTotal > 0 && (
        <>
          <Progress value={course.percent} showValue />
          <span className={styles.courseCounts}>
            レポート {course.reportPassed}/{course.reportTotal}・確認テスト {course.testPassed}/
            {course.testTotal}
          </span>
        </>
      )}
    </button>
  );
}

// Lists one service's courses with a search box and pages of twelve.
function CourseListPanel({
  service,
  onOpen,
}: {
  service: "basic" | "advanced";
  onOpen: (path: string) => void;
}) {
  const api = useApi();
  const [courses, setCourses] = useState<CourseCard[] | undefined>(undefined);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    setCourses(undefined);
    setError(undefined);
    fetchAllCourses(api, service)
      .then((raw) => {
        if (!active) return;
        const view = buildCourseListView(raw, service);
        setCourses(view.courses);
        setTotalCount(view.totalCount);
      })
      .catch((caught: unknown) => {
        if (active) setError(String(caught));
      });
    return () => {
      active = false;
    };
  }, [api, service]);

  if (error) return <Notice tone="error">読み込めませんでした: {error}</Notice>;
  if (!courses) return <Notice>読み込んでいます…</Notice>;

  const matches = filterCourses(courses, query);
  const pageView = paginate(matches, page, COURSE_PAGE_SIZE);

  return (
    <Block
      title={service === "basic" ? "必修授業" : "課外授業"}
      note={`${totalCount}コース`}
      id={`courses-${service}`}
      actions={
        <div className={styles.search}>
          <Input
            label="コースを検索"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>
      }
    >
      {matches.length === 0 ? (
        <Notice>一致するコースはありません</Notice>
      ) : (
        <div className={styles.courseGrid}>
          {pageView.items.map((course) => (
            <CourseTile key={course.id} course={course} onOpen={onOpen} />
          ))}
        </div>
      )}
      {pageView.pageCount > 1 && (
        <div className={styles.pager}>
          <Button
            variant="secondary"
            size="sm"
            disabled={pageView.page <= 1}
            onClick={() => setPage(pageView.page - 1)}
          >
            前へ
          </Button>
          <span className={styles.pagerText}>
            {pageView.page} / {pageView.pageCount}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={pageView.page >= pageView.pageCount}
            onClick={() => setPage(pageView.page + 1)}
          >
            次へ
          </Button>
        </div>
      )}
    </Block>
  );
}

export function Dashboard({ onOpenPath }: { onOpenPath?: (path: string) => void }) {
  const api = useApi();
  const [view, setView] = useState<DashboardView | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const open = (path: string) => onOpenPath?.(path);
  // The tab follows the address (?tab=), so the trail can go back to it and a link can open it.
  const { path: address } = useRoute();
  const tabValue = queryParam(address, "tab");
  const tab: DashboardTab = isDashboardTab(tabValue) ? tabValue : "reports";
  useTrail(buildTrail({ screen: "my_course", tab }));

  useEffect(() => {
    let active = true;
    api("/v2/dashboard/report_progresses?service=basic")
      .then(async (raw) => {
        const response = raw as ReportProgressesResponse;
        // Each month's material count is read first, so the percent matches the site's own figure.
        const materials = await loadMonthMaterials(
          api,
          response.monthly_summaries.map((month) => ({ year: month.year, month: month.month })),
          (month, failure) =>
            shellLog.warn("月の教材の数を読めませんでした。章とテストの数で代用します", {
              year: month.year,
              month: month.month,
              error: String(failure),
            }),
        );
        if (!active) return;
        setView(buildDashboardView(response.monthly_summaries, new Date(), materials));
      })
      .catch((caught: unknown) => {
        if (active) setError(String(caught));
      });
    return () => {
      active = false;
    };
  }, [api]);

  return (
    <Tabs
      value={tab}
      onValueChange={(next) => {
        if (isDashboardTab(next)) replacePath(dashboardPath(next));
      }}
      className={styles.tabs}
    >
      <TabsList aria-label="マイコースの区分">
        <TabsTrigger value="reports">{TAB_LABELS.reports}</TabsTrigger>
        <TabsTrigger value="basic">{TAB_LABELS.basic}</TabsTrigger>
        <TabsTrigger value="advanced">{TAB_LABELS.advanced}</TabsTrigger>
      </TabsList>

      <TabsContent value="reports">
        {error && <p className={styles.error}>読み込めませんでした: {error}</p>}
        {!error && !view && <p className={styles.muted}>読み込んでいます…</p>}
        {view && <ReportsPanel view={view} onOpen={open} />}
      </TabsContent>

      <TabsContent value="basic">
        <CourseListPanel service="basic" onOpen={open} />
      </TabsContent>

      <TabsContent value="advanced">
        <CourseListPanel service="advanced" onOpen={open} />
      </TabsContent>
    </Tabs>
  );
}
