import { useEffect, useMemo, useState } from "react";
import { ClipboardList, FileText, Play, Circle, Radio } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { formatDuration } from "@/lib/duration";
import {
  buildChapterView,
  type ChapterFilter,
  type ChapterItem,
  type ChapterItemKind,
  type ChapterView,
} from "@/lib/views/chapter-view";
import { buildCourseView, testStatusLabel, type CourseView } from "@/lib/views/course-view";
import { useApi } from "./data";
import { readOrigin } from "./router";
import { openCourseRow, openItem } from "./open-item";
import { useTrail } from "./trail";
import { buildTrail } from "@/lib/trail";
import { chapterShape } from "@/lib/chapter-sections";
import { shellLog } from "./log";
import { Block, Notice, PageHeader, Stat } from "./ui";
import styles from "./chapter.module.css";

const KIND_ICON: Record<ChapterItemKind, LucideIcon> = {
  movie: Play,
  test: FileText,
  report: ClipboardList,
  lesson: Radio,
  other: Circle,
};

// The name a material is shown under. Advanced courses add practice problems, guides and VR
// experiences, which are told apart by their resource type.
const OTHER_LABELS: Readonly<Record<string, string>> = {
  exercise: "演習",
  guide: "ガイド",
  vr_experience: "VR体験",
};

export function materialLabel(item: ChapterItem): string {
  if (item.kind === "movie") return "動画";
  if (item.kind === "test") return "確認テスト";
  if (item.kind === "report") return "レポート";
  if (item.kind === "lesson") return "授業";
  return OTHER_LABELS[item.resourceType] ?? "教材";
}

export function itemStatusText(item: ChapterItem): string {
  if (item.kind === "movie") {
    if (item.passed) return "視聴済み";
    if (item.playbackSeconds > 0) return "途中";
    return "未視聴";
  }
  if (item.kind === "test") return item.passed ? "合格" : "未了";
  if (item.kind === "report") return item.passed ? "提出済み" : "未提出";
  return item.passed ? "済" : "未";
}

// Chapter page (/courses/{c}/chapters/{ch}): the materials in order, with a filter for the
// required and the supplement ("N plus") materials.
export function ChapterPage({ courseId, chapterId }: { courseId: number; chapterId: number }) {
  const api = useApi();
  const [filter, setFilter] = useState<ChapterFilter>("required");
  const [chapterRaw, setChapterRaw] = useState<unknown>(undefined);
  const [course, setCourse] = useState<CourseView | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

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
    // The course list beside the chapter is optional: the page works without it.
    api(`/v2/material/courses/${courseId}?revision=1`)
      .then((raw) => {
        if (active) setCourse(buildCourseView(raw));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, courseId, chapterId]);

  const view: ChapterView | undefined = useMemo(
    () => (chapterRaw ? buildChapterView(chapterRaw, courseId, chapterId, filter) : undefined),
    [chapterRaw, courseId, chapterId, filter],
  );
  // A chapter opened from a month keeps that month in its trail and in what it opens next.
  const origin = readOrigin();
  useTrail(
    view
      ? buildTrail({
          screen: "chapter",
          courseId,
          service: course?.service ?? "basic",
          courseTitle: course?.title,
          chapterId,
          chapterTitle: view.title,
          origin,
        })
      : undefined,
  );

  // A chapter that comes back with no materials is recorded with the shape of its response (field
  // names and counts only), so a page that comes up empty leaves a clue for the report.
  useEffect(() => {
    if (!chapterRaw) return;
    const shape = chapterShape(chapterRaw);
    const materials =
      shape.sections + shape.headers.reduce((sum, header) => sum + header.sections, 0);
    if (materials === 0) {
      shellLog.warn("章に教材が見つかりませんでした", { courseId, chapterId, shape });
    }
  }, [chapterRaw, courseId, chapterId]);

  if (error) return <Notice tone="error">読み込めませんでした: {error}</Notice>;
  if (!view) return <Notice>読み込んでいます…</Notice>;

  const totals = view.totals;
  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <PageHeader
          eyebrow={course?.title ?? "章"}
          title={view.title}
          meta={view.outline ? <span className={styles.outline}>{view.outline}</span> : undefined}
          actions={
            <SegmentedControl
              label="教材の種類"
              value={filter}
              onValueChange={(value) =>
                setFilter(value === "supplement" || value === "all" ? value : "required")
              }
              options={[
                { value: "required", label: "必修" },
                { value: "supplement", label: "Nプラス" },
                { value: "all", label: "すべて" },
              ]}
            />
          }
        />

        <div className={styles.stats}>
          <Stat label="動画" value={totals.movieCount} suffix="本" />
          <Stat label="総再生時間" value={formatDuration(totals.movieSeconds, "hms")} />
          <Stat label="残り" value={formatDuration(totals.remainingSeconds, "hms")} />
          {view.advanced ? (
            <>
              <Stat
                label="理解済みの教材"
                value={totals.materialPassed}
                suffix={`/${totals.materialTotal}`}
              />
              <Stat
                label="解いた問題"
                value={totals.questionClear}
                suffix={`/${totals.questionTotal}`}
              />
            </>
          ) : (
            <>
              <Stat label="確認テスト" value={totals.testCount} suffix="回" />
              <Stat label="レポート" value={totals.reportCount} suffix="件" />
            </>
          )}
        </div>

        <Block title="教材" note={`${view.items.length}件`} id="materials">
          <ul className={styles.list}>
            {view.items.map((item) => {
              const Icon = KIND_ICON[item.kind];
              return (
                <li key={`${item.kind}-${item.id}`}>
                  <button
                    type="button"
                    className={styles.row}
                    disabled={!item.openable}
                    onClick={() => openItem(item, { origin })}
                  >
                    <span className={styles.rowIcon} aria-hidden="true">
                      <Icon size={16} />
                    </span>
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>{item.title}</span>
                      <span className={styles.rowMeta}>
                        {materialLabel(item)}
                        {item.kind === "lesson" ? " ・ サイトで開く" : ""}
                        {!item.openable && item.kind !== "lesson" ? " ・ 開けません" : ""}
                        {item.kind === "movie" && item.lengthSeconds > 0
                          ? ` ・ ${formatDuration(item.lengthSeconds, "hms")}`
                          : ""}
                        {item.questionTotal > 0
                          ? ` ・ ${item.questionClear}/${item.questionTotal} 問`
                          : ""}
                        {item.supplement ? " ・ Nプラス" : ""}
                      </span>
                    </span>
                    {/* A material with no progress (a lesson) shows no status, rather than "未". */}
                    {item.hasProgress && (
                      <Badge size="sm" tone={item.passed ? "success" : "neutral"}>
                        {itemStatusText(item)}
                      </Badge>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Block>
      </div>

      <aside className={styles.side} aria-label="同じコースの章">
        <Block
          title="このコースの章"
          note={
            course
              ? `${course.chapters.filter((row) => row.kind === "chapter").length}章`
              : undefined
          }
          id="course-chapters"
        >
          {!course && <Notice>読み込んでいます…</Notice>}
          <ul className={styles.chapterList}>
            {course?.chapters.map((other) => {
              const current = other.kind === "chapter" && other.id === chapterId;
              return (
                <li key={`${other.kind}-${other.id}`}>
                  <button
                    type="button"
                    className={current ? styles.chapterLinkCurrent : styles.chapterLink}
                    aria-current={current ? "page" : undefined}
                    onClick={() => openCourseRow(other, { origin })}
                  >
                    <span className={styles.chapterLinkTitle}>{other.title}</span>
                    <span className={styles.chapterLinkCount}>
                      {testStatusLabel(other) ??
                        (other.status === "no_progress"
                          ? "記録なし"
                          : `${other.passed}/${other.total}`)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Block>
      </aside>
    </div>
  );
}
