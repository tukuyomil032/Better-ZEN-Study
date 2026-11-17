import { useEffect, useState } from "react";
import { Badge } from "@/components/arc/badge/badge";
import { useApi } from "./data";
import { openCourseRow } from "./open-item";
import { Bar, Block, Notice, PageHeader, StatusBadge, Stat } from "./ui";
import { SubjectIcon } from "./subject-icon";
import { useTrail } from "./trail";
import {
  buildCourseView,
  testStatusLabel,
  type CourseChapterRow,
  type CourseView,
} from "@/lib/views/course-view";
import { buildTrail } from "@/lib/trail";
import styles from "./course.module.css";

// The line under a card's bar. A test shows its questions and its result; a chapter its count.
function countText(row: CourseChapterRow): string {
  if (row.kind === "chapter") {
    if (row.status === "no_progress") return "記録なし";
    return `${row.passed}/${row.total}`;
  }
  const questions = `${row.test?.questionCount ?? 0}問`;
  if (row.kind === "assessment_test") {
    const score = row.test?.score;
    const max = row.test?.maxScore;
    if (score !== undefined && max !== undefined) return `${questions} ・ ${score}/${max}点`;
    if ((row.test?.answeredCount ?? 0) > 0)
      return `${row.test?.answeredCount}/${questions} ・ 受験中`;
    return `${questions} ・ 未受験`;
  }
  const score = row.test?.score;
  return score === undefined ? `${questions} ・ 未受験` : `${questions} ・ ${score}点`;
}

// The badge that names a row's kind: 習熟度テスト for a short test, 定期テスト for a periodic test.
function kindLabel(row: CourseChapterRow): string | undefined {
  if (row.kind === "short_test") return "習熟度テスト";
  if (row.kind === "assessment_test") return "定期テスト";
  return undefined;
}

// Course page (/courses/{c}): every chapter of one subject, as cards.
export function CoursePage({ courseId }: { courseId: number }) {
  const api = useApi();
  const [view, setView] = useState<CourseView | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  useTrail(
    view
      ? buildTrail({
          screen: "course",
          courseId,
          service: view.service,
          courseTitle: view.title,
        })
      : undefined,
  );

  useEffect(() => {
    let active = true;
    setView(undefined);
    setError(undefined);
    api(`/v2/material/courses/${courseId}?revision=1`)
      .then((raw) => {
        if (!active) return;
        const built = buildCourseView(raw);
        if (built) setView(built);
        else setError("コースの情報が見つかりませんでした");
      })
      .catch((caught: unknown) => {
        if (active) setError(String(caught));
      });
    return () => {
      active = false;
    };
  }, [api, courseId]);

  if (error) return <Notice tone="error">読み込めませんでした: {error}</Notice>;
  if (!view) return <Notice>読み込んでいます…</Notice>;
  // Tests share the list, but they are not chapters, so the count leaves them out.
  const chapterCount = view.chapters.filter((row) => row.kind === "chapter").length;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={view.subjectTitle}
        eyebrowIcon={<SubjectIcon subject={view.subjectTitle} size="sm" />}
        title={view.title}
        meta={
          <span>
            {view.passedChapters}/{view.totalChapters} 章 完了
          </span>
        }
      />

      <div className={styles.summary}>
        <Stat label="全体の進み" value={view.percent} suffix="%" />
        <Stat label="完了した章" value={view.passedChapters} suffix={`/${view.totalChapters}`} />
      </div>

      <Block title="章の一覧" note={`${chapterCount}章`} id="chapters">
        <ul className={styles.grid}>
          {view.chapters.map((chapter) => {
            const kind = kindLabel(chapter);
            const testLabel = testStatusLabel(chapter);
            return (
              <li key={`${chapter.kind}-${chapter.id}`}>
                <button
                  type="button"
                  className={styles.card}
                  onClick={() => openCourseRow(chapter)}
                >
                  <span className={styles.cardTop}>
                    {kind && (
                      <Badge size="sm" tone="info">
                        {kind}
                      </Badge>
                    )}
                    {testLabel ? (
                      <Badge
                        size="sm"
                        tone={
                          testLabel === "合格"
                            ? "success"
                            : testLabel === "受験中"
                              ? "info"
                              : "neutral"
                        }
                      >
                        {testLabel}
                      </Badge>
                    ) : (
                      <StatusBadge status={chapter.status} />
                    )}
                  </span>
                  <span className={styles.cardTitle}>{chapter.title}</span>
                  <Bar percent={chapter.percent} />
                  <span className={styles.cardCount}>{countText(chapter)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Block>
    </div>
  );
}
