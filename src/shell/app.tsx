import { Fragment, useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  Bug,
  House,
  LayoutDashboard,
  MessageSquare,
  Radio,
  Settings as SettingsIcon,
} from "lucide-react";
import { Button } from "@/components/arc/button/button";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { applyAppearance } from "@/components/settings/appearance";
import type { Route } from "@/lib/routes";
import type { Settings } from "@/lib/settings";
import type { OptionsTab } from "@/lib/messages";
import { buildTrail, isDashboardTab, type Crumb, type DashboardTab } from "@/lib/trail";
import { ChapterPage } from "./chapter";
import { CoursePage } from "./course";
import { Dashboard } from "./dashboard";
import { MediaPage } from "./media";
import { MonthPage } from "./month";
import { ShortTestPage } from "./short-test";
import { navigate, queryParam, readOrigin, useRoute } from "./router";
import { SiteMark } from "./site-logo";
import { useCrumbs } from "./trail";
import { shellLog } from "./log";
import styles from "./app.module.css";
import "./shell.css";

const SITE_LINKS = [
  { label: "ホーム", icon: House, path: "/" },
  { label: "フォーラム", icon: MessageSquare, path: "/questions" },
  { label: "ライブ授業", icon: Radio, path: "/lessons" },
  { label: "通知", icon: Bell, path: "/notices" },
];

// The trail a screen shows before it has loaded its own names. Screens replace it with their full
// trail once their data is in (see useTrail in each screen).
function fallbackTrail(route: Route, path: string): Crumb[] {
  const tabValue = queryParam(path, "tab");
  const tab: DashboardTab = isDashboardTab(tabValue) ? tabValue : "reports";
  const origin = readOrigin();
  switch (route.kind) {
    case "my_course":
      return buildTrail({ screen: "my_course", tab });
    case "month":
      return buildTrail({ screen: "month", year: route.year, month: route.month });
    case "course":
      return buildTrail({ screen: "course", courseId: route.courseId, service: "basic" });
    case "chapter":
      return buildTrail({
        screen: "chapter",
        courseId: route.courseId,
        chapterId: route.chapterId,
        service: "basic",
        origin,
      });
    case "movie":
      return buildTrail({
        screen: "material",
        courseId: route.courseId,
        chapterId: route.chapterId,
        service: "basic",
        materialTitle: "動画",
        origin,
      });
    case "material":
      return buildTrail({
        screen: "material",
        courseId: route.courseId,
        chapterId: route.chapterId,
        service: "basic",
        origin,
      });
    case "short_test":
      return buildTrail({
        screen: "short_test",
        courseId: route.courseId,
        service: "advanced",
      });
    default:
      return [];
  }
}

// A short name for a screen, written into the diagnostics when the screen opens.
function screenName(route: Route): string {
  switch (route.kind) {
    case "my_course":
      return "マイコース";
    case "course":
      return `コース ${route.courseId}`;
    case "month":
      return `${route.year}年${route.month}月のレポート`;
    case "chapter":
      return `章 ${route.chapterId}（コース ${route.courseId}）`;
    case "movie":
      return `動画 ${route.movieId}`;
    case "material":
      return `${route.resourceType} ${route.id}`;
    case "short_test":
      return `習熟度テスト ${route.testId}（コース ${route.courseId}）`;
    default:
      return "その他";
  }
}

// Picks the screen for a route. Anything the shell does not draw returns nothing, so the
// caller can leave the site's own page in place.
export function screenFor(route: Route): ReactNode {
  switch (route.kind) {
    case "my_course":
      return <Dashboard onOpenPath={navigate} />;
    case "course":
      return <CoursePage courseId={route.courseId} />;
    case "month":
      return <MonthPage year={route.year} month={route.month} />;
    case "chapter":
      return <ChapterPage courseId={route.courseId} chapterId={route.chapterId} />;
    case "movie":
      return (
        <MediaPage
          courseId={route.courseId}
          chapterId={route.chapterId}
          kind="movie"
          resourceType="movie"
          id={route.movieId}
        />
      );
    case "material":
      return (
        <MediaPage
          courseId={route.courseId}
          chapterId={route.chapterId}
          kind="material"
          resourceType={route.resourceType}
          id={route.id}
        />
      );
    case "short_test":
      return <ShortTestPage courseId={route.courseId} testId={route.testId} />;
    default:
      return null;
  }
}

type AppProps = {
  appearance?: Settings["appearance"];
  // Leaves the shell for a site page (home, forum, and so on): a full page load, as the
  // site's own menu does. The default uses the same mechanism.
  onLeave?: (path: string) => void;
  // Opens a section of the extension's settings page in a new tab.
  onOpenPage?: (tab: OptionsTab) => void;
};

// The shell replaces ZEN Study's frame: a sidebar, a top bar, and one content panel.
export function App({ appearance, onLeave, onOpenPage }: AppProps) {
  const [theme, setTheme] = useState<Settings["appearance"]["theme"]>(
    appearance?.theme ?? "system",
  );
  const accent = appearance?.accent ?? "blue";
  const { path, route } = useRoute();
  const reported = useCrumbs();
  const crumbs = reported ?? fallbackTrail(route, path);

  useEffect(() => applyAppearance({ theme, accent }), [theme, accent]);

  // Every screen change is recorded, so a report shows the sequence of screens that led to a problem.
  useEffect(() => {
    shellLog.info("画面を開きました", { screen: screenName(route), address: path });
  }, [path]);

  const leave = (path: string) => {
    if (onLeave) onLeave(path);
    else window.location.assign(path);
  };

  const onMyCourse = route.kind === "my_course";
  // Movie and test/report screens fill the window, so the frame gets the height left over.
  const isMedia =
    route.kind === "movie" || route.kind === "material" || route.kind === "short_test";

  return (
    <div className={styles.shell} data-screen={isMedia ? "media" : undefined}>
      <aside className={styles.sidebar} aria-label="メニュー">
        <div className={styles.brand}>
          <SiteMark fallback={<span className={styles.logo} aria-hidden="true" />} />
          <span className={styles.brandName}>ZEN Study</span>
        </div>

        <nav className={styles.nav} aria-label="マイコース">
          <Button
            variant={onMyCourse ? "secondary" : "ghost"}
            size="md"
            className={onMyCourse ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
            aria-current={onMyCourse ? "page" : undefined}
            onClick={() => navigate("/my_course")}
          >
            <LayoutDashboard className={styles.navIcon} aria-hidden="true" size={18} />
            マイコース
          </Button>
        </nav>

        <div className={styles.divider} aria-hidden="true" />

        <nav className={styles.nav} aria-label="ZEN Study の他の画面">
          {SITE_LINKS.map((item) => (
            <Button
              key={item.path}
              variant="ghost"
              size="md"
              className={styles.navItem}
              onClick={() => leave(item.path)}
            >
              <item.icon className={styles.navIcon} aria-hidden="true" size={18} />
              {item.label}
            </Button>
          ))}
        </nav>

        <div className={styles.divider} aria-hidden="true" />

        {/* The extension's own pages open in a new tab, so the shell stays where it is. */}
        <nav className={styles.nav} aria-label="拡張機能">
          <Button
            variant="ghost"
            size="md"
            className={styles.navItem}
            onClick={() => onOpenPage?.("autoplay")}
          >
            <SettingsIcon className={styles.navIcon} aria-hidden="true" size={18} />
            拡張機能の設定
          </Button>
          <Button
            variant="ghost"
            size="md"
            className={styles.navItem}
            onClick={() => onOpenPage?.("report")}
          >
            <Bug className={styles.navIcon} aria-hidden="true" size={18} />
            不具合を報告
          </Button>
        </nav>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <nav className={styles.crumbs} aria-label="現在の場所">
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1;
              return (
                <Fragment key={`${index}-${crumb.label}`}>
                  {index > 0 && (
                    <span className={styles.crumbSeparator} aria-hidden="true">
                      /
                    </span>
                  )}
                  {crumb.path && !isLast ? (
                    <button
                      type="button"
                      className={styles.crumbLink}
                      title={crumb.label}
                      onClick={() => navigate(crumb.path!)}
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span
                      className={styles.crumbCurrent}
                      title={crumb.label}
                      aria-current={isLast ? "page" : undefined}
                    >
                      {crumb.label}
                    </span>
                  )}
                </Fragment>
              );
            })}
          </nav>
          <div className={styles.tools}>
            <SegmentedControl
              label="テーマ"
              value={theme}
              onValueChange={(value) =>
                setTheme(value === "light" || value === "dark" ? value : "system")
              }
              options={[
                { value: "system", label: "自動" },
                { value: "light", label: "ライト" },
                { value: "dark", label: "ダーク" },
              ]}
            />
          </div>
        </header>

        <div className={styles.panel}>{screenFor(route)}</div>
      </div>
    </div>
  );
}
