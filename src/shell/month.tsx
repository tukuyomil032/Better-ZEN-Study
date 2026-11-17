import { useEffect, useState } from "react";
import { Badge } from "@/components/arc/badge/badge";
import { buildMonthView, type MonthItem, type MonthView } from "@/lib/views/month-view";
import { buildTrail } from "@/lib/trail";
import { useApi } from "./data";
import { navigate } from "./router";
import { Block, Notice, PageHeader, Stat } from "./ui";
import { SubjectIcon } from "./subject-icon";
import { useTrail } from "./trail";
import { Progress } from "@/components/arc/progress/progress";
import styles from "./month.module.css";

function dueTone(daysLeft: number): "danger" | "warning" | "info" {
  if (daysLeft < 0) return "danger";
  if (daysLeft <= 7) return "warning";
  return "info";
}

function dueText(daysLeft: number): string {
  return daysLeft < 0 ? `${-daysLeft}日過ぎ` : `あと${daysLeft}日`;
}

// A chapter row. The chapter is opened from this month, so its trail goes back here.
function ChapterRow({ item, year, month }: { item: MonthItem; year: number; month: number }) {
  return (
    <button
      type="button"
      className={styles.row}
      onClick={() =>
        navigate(`/courses/${item.courseId}/chapters/${item.chapterId}`, {
          origin: { year, month },
        })
      }
    >
      <span className={styles.rowSubject}>
        <SubjectIcon subject={item.subjectTitle} size="sm" />
        <span>{item.subjectTitle}</span>
      </span>
      <span className={styles.rowTitle}>{item.chapterTitle}</span>
      <span className={styles.rowProgress}>
        <Progress value={item.percent} />
      </span>
      <span className={styles.rowCount}>
        {item.percent}% ・ {item.passed}/{item.total}
      </span>
    </button>
  );
}

// Month page (/study_plans/month/{y}/{m}): the report deadlines of one month, with the
// chapters due under each deadline. Works the same for completed months.
export function MonthPage({ year, month }: { year: number; month: number }) {
  const api = useApi();
  const [view, setView] = useState<MonthView | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  useTrail(buildTrail({ screen: "month", year, month }));

  useEffect(() => {
    let active = true;
    setView(undefined);
    setError(undefined);
    api(`/v2/dashboard/report_progresses/monthly/${year}/${month}?service=basic`)
      .then((raw) => {
        if (!active) return;
        const built = buildMonthView(raw, new Date());
        if (built) setView(built);
        else setError("この月の情報が見つかりませんでした");
      })
      .catch((caught: unknown) => {
        if (active) setError(String(caught));
      });
    return () => {
      active = false;
    };
  }, [api, year, month]);

  if (error) return <Notice tone="error">読み込めませんでした: {error}</Notice>;
  if (!view) return <Notice>読み込んでいます…</Notice>;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={`${view.year}年`}
        title={`${view.month}月のレポート`}
        meta={
          <span>
            章 {view.passedChapters}/{view.totalChapters}・確認テスト {view.passedTests}/
            {view.totalTests}
          </span>
        }
      />

      <div className={styles.summary}>
        <Stat label="進み" value={view.percent} suffix="%" size="lg" />
        <Stat label="章" value={view.passedChapters} suffix={`/${view.totalChapters}`} size="lg" />
        <Stat
          label="確認テスト"
          value={view.passedTests}
          suffix={`/${view.totalTests}`}
          size="lg"
        />
      </div>

      {view.groups.map((group) => (
        <Block
          key={group.deadlineLabel + group.deadline.getTime()}
          title={group.deadlineLabel}
          id={`deadline-${group.deadline.getTime()}`}
          note={
            <Badge size="sm" tone={dueTone(group.daysLeft)}>
              {dueText(group.daysLeft)}
            </Badge>
          }
        >
          {group.items.length === 0 && <Notice>この期限の章はありません</Notice>}
          <div className={styles.rows}>
            {group.items.map((item) => (
              <ChapterRow
                key={`${item.courseId}-${item.chapterId}`}
                item={item}
                year={year}
                month={month}
              />
            ))}
          </div>
          {group.tests.length > 0 && (
            <div className={styles.tests}>
              <span className={styles.testsLabel}>定期テスト</span>
              {group.tests.map((test) => (
                <span key={test.assessmentTestId} className={styles.testRow}>
                  <span className={styles.rowTitle}>{test.title}</span>
                  <span className={styles.rowCount}>
                    {test.answered}/{test.totalQuestions}問
                  </span>
                </span>
              ))}
            </div>
          )}
        </Block>
      ))}

      {view.completedItems.length > 0 && (
        <Block title="完了した章" note={`${view.completedItems.length}章`} id="completed">
          <div className={styles.rows}>
            {view.completedItems.map((item) => (
              <ChapterRow
                key={`${item.courseId}-${item.chapterId}`}
                item={item}
                year={year}
                month={month}
              />
            ))}
          </div>
        </Block>
      )}
    </div>
  );
}
