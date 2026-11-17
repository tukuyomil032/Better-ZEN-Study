import { useEffect, useState } from "react";
import { Badge } from "@/components/arc/badge/badge";
import { formatDuration } from "@/lib/duration";
import { buildCourseView, type CourseView } from "@/lib/views/course-view";
import { buildTrail } from "@/lib/trail";
import { useApi } from "./data";
import { shellLog } from "./log";
import { useTrail } from "./trail";
import { Notice } from "./ui";
import styles from "./media.module.css";

// A short test (習熟度テスト) of an advanced course. The site's own question page runs inside the
// frame, so answering and grading stay as ZEN Study built them. The shell adds a one-line header.
// The test is found in the course, because the course lists it beside the chapters.
export function ShortTestPage({ courseId, testId }: { courseId: number; testId: number }) {
  const api = useApi();
  const [course, setCourse] = useState<CourseView | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setCourse(undefined);
    setError(undefined);
    api(`/v2/material/courses/${courseId}?revision=1`)
      .then((raw) => {
        if (!active) return;
        const built = buildCourseView(raw);
        if (built) setCourse(built);
        else setError("コースの情報が見つかりませんでした");
      })
      .catch((caught: unknown) => {
        if (active) setError(String(caught));
      });
    return () => {
      active = false;
    };
  }, [api, courseId]);

  const test = course?.chapters.find((row) => row.kind === "short_test" && row.id === testId);
  const info = test?.test;

  useTrail(
    course
      ? buildTrail({
          screen: "short_test",
          courseId,
          service: course.service,
          courseTitle: course.title,
          testTitle: test?.title,
        })
      : undefined,
  );

  // A test that is not in its course, or that has no page to show, is recorded for the report.
  useEffect(() => {
    if (!course) return;
    if (!test) {
      shellLog.warn("習熟度テストが、コースの中に見つかりませんでした", {
        courseId,
        testId,
        rows: course.chapters.length,
      });
    } else if (!info?.contentUrl) {
      shellLog.warn("習熟度テストの表示先が見つかりませんでした", { courseId, testId });
    }
  }, [course, test, info, courseId, testId]);

  if (error) return <Notice tone="error">読み込めませんでした: {error}</Notice>;
  if (!course) return <Notice>読み込んでいます…</Notice>;
  if (!test || !info) {
    return <Notice tone="error">この習熟度テストは、このコースには見つかりませんでした</Notice>;
  }
  if (!info.contentUrl) return <Notice tone="error">テストの表示先が見つかりませんでした</Notice>;

  const passed = test.status === "done";
  const statusText = passed ? "合格" : info.score === undefined ? "未受験" : "未合格";
  const scoreText = info.score === undefined ? "" : ` ・ 前回 ${info.score}点`;

  return (
    <div className={styles.screen} data-test-status={test.status}>
      <header className={styles.bar}>
        <div className={styles.titles}>
          <span className={styles.title}>{test.title}</span>
          <span className={styles.subtitle}>{course.title}</span>
        </div>
        <div className={styles.controls}>
          <div className={styles.badges}>
            <Badge size="sm" tone="info">
              習熟度テスト
            </Badge>
            <Badge size="sm" tone={passed ? "success" : "neutral"}>
              {statusText}
            </Badge>
            <span className={styles.metaText}>
              {info.questionCount}問 ・ 制限時間 {formatDuration(info.timeLimitSeconds, "hms")}
              {scoreText}
            </span>
          </div>
        </div>
      </header>

      <div className={styles.frame}>
        <iframe className={styles.iframe} src={info.contentUrl} title={test.title} />
      </div>
    </div>
  );
}
