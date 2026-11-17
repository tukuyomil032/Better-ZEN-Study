import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Film,
  Menu,
  Radio,
} from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/arc/drawer/drawer";
import { chapterShape, findContentUrl } from "@/lib/chapter-sections";
import { shellLog } from "./log";
import { formatDuration } from "@/lib/duration";
import { buildChapterView, type ChapterItem } from "@/lib/views/chapter-view";
import { buildCourseView, type CourseView } from "@/lib/views/course-view";
import { buildTrail } from "@/lib/trail";
import { useApi } from "./data";
import { openItem } from "./open-item";
import { readOrigin } from "./router";
import { useTrail } from "./trail";
import { Notice } from "./ui";
import { itemStatusText, materialLabel } from "./chapter";
import styles from "./media.module.css";

// Movie and test/report pages. The site's own player or question page runs inside an iframe,
// so playback, the answer form, and grading stay as ZEN Study built them. The shell adds a one-line
// header and the frame, which fills the rest of the window. The chapter's materials open from a
// drawer on the left, so the frame keeps the room.

type MediaKind = "movie" | "material";

// The icon for a material's kind.
function kindIcon(item: ChapterItem) {
  if (item.kind === "movie") return <Film size={16} aria-hidden="true" />;
  if (item.kind === "test") return <ClipboardCheck size={16} aria-hidden="true" />;
  if (item.kind === "lesson") return <Radio size={16} aria-hidden="true" />;
  return <FileText size={16} aria-hidden="true" />;
}

export function MediaPage({
  courseId,
  chapterId,
  kind,
  resourceType,
  id,
}: {
  courseId: number;
  chapterId: number;
  kind: MediaKind;
  resourceType: string;
  id: number;
}) {
  const api = useApi();
  const [chapterRaw, setChapterRaw] = useState<unknown>(undefined);
  const [course, setCourse] = useState<CourseView | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  // The drawer stays inside this screen, so it needs the screen element as its container.
  const [screen, setScreen] = useState<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const currentRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    let active = true;
    setChapterRaw(undefined);
    setError(undefined);
    api(`/v2/material/courses/${courseId}/chapters/${chapterId}?revision=1`)
      .then((raw) => {
        if (active) setChapterRaw(raw);
      })
      .catch((caught: unknown) => {
        if (active) setError(String(caught));
      });
    api(`/v2/material/courses/${courseId}?revision=1`)
      .then((raw) => {
        if (active) setCourse(buildCourseView(raw));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, courseId, chapterId]);

  // The list follows the whole chapter, so the drawer shows every material in the site's order.
  const list = useMemo(
    () => (chapterRaw ? buildChapterView(chapterRaw, courseId, chapterId, "all") : undefined),
    [chapterRaw, courseId, chapterId],
  );
  const contentUrl = useMemo(
    () => (chapterRaw ? findContentUrl(chapterRaw, id, resourceType) : undefined),
    [chapterRaw, id, resourceType],
  );

  // A material is identified by its path segment as well as its id, so a movie and a test
  // with the same number are never confused.
  const pathSuffix = `/${kind === "movie" ? "movie" : resourceType}/${id}`;
  const current: ChapterItem | undefined = list?.items.find((item) =>
    item.path.endsWith(pathSuffix),
  );
  // Previous and next skip the materials that cannot be opened.
  const openable = list ? list.items.filter((item) => item.openable) : [];
  const openIndex = openable.findIndex((item) => item.path.endsWith(pathSuffix));
  const previous = openIndex > 0 ? openable[openIndex - 1] : undefined;
  const next =
    openIndex >= 0 && openIndex < openable.length - 1 ? openable[openIndex + 1] : undefined;

  // When the drawer opens, the material on screen is brought into view.
  useEffect(() => {
    if (menuOpen) currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [menuOpen]);

  // The browser tab name is what the notification reads the subject and chapter from.
  useEffect(() => {
    if (!course || !list) return;
    const chapterTitle = list.title;
    document.title = `${course.subjectTitle} ${course.title}-${chapterTitle} - ZEN Study`;
  }, [course, list]);

  // The trail names the material; a material opened from a month keeps that month in its trail.
  const origin = readOrigin();
  useTrail(
    list && current
      ? buildTrail({
          screen: "material",
          courseId,
          service: course?.service ?? "basic",
          courseTitle: course?.title,
          chapterId,
          chapterTitle: list.title,
          materialTitle: current.title,
          origin,
        })
      : undefined,
  );

  // A material with no address to show is recorded with the shape of its chapter (names and counts
  // only), since that is the one thing that makes the frame come up empty.
  useEffect(() => {
    if (!chapterRaw || !current || contentUrl) return;
    shellLog.warn("教材の表示先が見つかりませんでした", {
      courseId,
      chapterId,
      resourceType,
      id,
      shape: chapterShape(chapterRaw),
    });
  }, [chapterRaw, current, contentUrl, courseId, chapterId, resourceType, id]);

  if (error) return <Notice tone="error">読み込めませんでした: {error}</Notice>;
  if (!list) return <Notice>読み込んでいます…</Notice>;
  if (!current) return <Notice tone="error">この教材は、この章には見つかりませんでした</Notice>;
  if (!contentUrl) return <Notice tone="error">教材の表示先が見つかりませんでした</Notice>;

  const isMovie = kind === "movie";
  const kindLabel = materialLabel(current);
  const subtitle = course ? `${course.title}・${list.title}` : list.title;

  return (
    <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
      <div className={styles.screen} ref={setScreen}>
        <header className={styles.bar}>
          <DrawerTrigger asChild>
            <button type="button" className={styles.menuButton} aria-label="この章の教材を開く">
              <Menu size={18} aria-hidden="true" />
            </button>
          </DrawerTrigger>

          <div className={styles.titles}>
            <span className={styles.title}>{current.title}</span>
            <span className={styles.subtitle}>{subtitle}</span>
          </div>

          <div className={styles.controls}>
            <div className={styles.badges}>
              <Badge size="sm" tone="info">
                {kindLabel}
              </Badge>
              <Badge size="sm" tone={current.passed ? "success" : "neutral"}>
                {itemStatusText(current)}
              </Badge>
              {isMovie && current.lengthSeconds > 0 && (
                <span className={styles.metaText}>
                  {formatDuration(current.lengthSeconds, "hms")}
                </span>
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              className={styles.navButton}
              disabled={!previous}
              aria-label={previous ? `前へ: ${previous.title}` : "前へ"}
              title={previous ? `前へ: ${previous.title}` : "前の教材はありません"}
              onClick={() => previous && openItem(previous, { origin })}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className={styles.navButton}
              disabled={!next}
              aria-label={next ? `次へ: ${next.title}` : "次へ"}
              title={next ? `次へ: ${next.title}` : "次の教材はありません"}
              onClick={() => next && openItem(next, { origin })}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </header>

        <div className={styles.frame}>
          <iframe
            ref={frameRef}
            className={styles.iframe}
            src={contentUrl}
            title={current.title}
            allow="autoplay; fullscreen"
          />
        </div>

        <DrawerContent
          title="この章の教材"
          description={`${subtitle}・${list.items.length}件`}
          side="left"
          container={screen}
          onCloseAutoFocus={(event) => {
            // Closing the drawer gives the keyboard back to the frame, so the player's shortcuts
            // keep working.
            event.preventDefault();
            frameRef.current?.focus();
          }}
        >
          <div className={styles.drawerList}>
            <ul className={styles.list}>
              {list.items.map((item) => {
                const isCurrent = item.path !== "" && item.path.endsWith(pathSuffix);
                return (
                  <li key={`${item.kind}-${item.id}`} ref={isCurrent ? currentRef : undefined}>
                    <button
                      type="button"
                      className={isCurrent ? styles.itemCurrent : styles.item}
                      aria-current={isCurrent ? "page" : undefined}
                      disabled={!item.openable}
                      onClick={() => {
                        setMenuOpen(false);
                        openItem(item, { origin });
                      }}
                    >
                      <span className={styles.itemIcon}>{kindIcon(item)}</span>
                      <span className={styles.itemBody}>
                        <span className={styles.itemTitle}>{item.title}</span>
                        <span className={styles.itemMeta}>
                          {item.openable
                            ? item.kind === "lesson"
                              ? "サイトで開く"
                              : itemStatusText(item)
                            : "開けません"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </DrawerContent>
      </div>
    </Drawer>
  );
}
