import type { CSSProperties } from "react";
import { formatDuration } from "../../../lib/duration";
import { formatChapterTotal, formatSubjectLine, type TimeStyle } from "../../../lib/summary-format";
import type { ChapterSummary, MonthSummary } from "../../../lib/summary-service";

// Styles are inline on purpose: the UI renders inside a shadow root, so the page's
// CSS cannot restyle it, and we do not depend on any class names from ZEN Study.
const pill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  marginLeft: 12,
  padding: "2px 10px",
  borderRadius: 999,
  background: "#e8f7ef",
  color: "#0a7a4f",
  font: "600 12px/1.4 system-ui, -apple-system, sans-serif",
  whiteSpace: "nowrap",
};

// A block line inside the row's text column: it adds height, never width.
const subjectLine: CSSProperties = {
  display: "block",
  boxSizing: "border-box",
  maxWidth: "100%",
  marginTop: 4,
  color: "#4b5563",
  font: "500 12px/1.4 system-ui, -apple-system, sans-serif",
  textAlign: "left",
  whiteSpace: "normal",
  overflowWrap: "anywhere",
};

const card: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  marginTop: 12,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  color: "#111827",
  font: "400 13px/1.5 system-ui, -apple-system, sans-serif",
};

const cardTitle: CSSProperties = { fontWeight: 700, marginBottom: 6 };

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  columnGap: 16,
  rowGap: 2,
  margin: 0,
};

const label: CSSProperties = { color: "#6b7280" };
const value: CSSProperties = { margin: 0, fontVariantNumeric: "tabular-nums" };
const warning: CSSProperties = { marginTop: 6, color: "#b45309", fontSize: 12 };

export function ChapterTotalView({
  summary,
  style,
}: {
  summary: ChapterSummary;
  style: TimeStyle;
}) {
  return (
    <span style={pill}>{formatChapterTotal(summary.movieCount, summary.movieSeconds, style)}</span>
  );
}

export function SubjectTotalView({
  summary,
  style,
}: {
  summary: ChapterSummary;
  style: TimeStyle;
}) {
  return (
    <span style={subjectLine}>
      {formatSubjectLine({
        movieCount: summary.movieCount,
        movieSeconds: summary.movieSeconds,
        testCount: summary.testCount,
        reportCount: summary.reportCount,
        style,
      })}
    </span>
  );
}

export function MonthTotalView({ summary, style }: { summary: MonthSummary; style: TimeStyle }) {
  const totals = summary.totals;
  return (
    <section style={card} aria-label="月の合計">
      <div style={cardTitle}>{summary.month}月の合計</div>
      <dl style={grid}>
        <dt style={label}>動画</dt>
        <dd style={value}>{totals.movieCount}本</dd>
        <dt style={label}>総再生時間</dt>
        <dd style={value}>{formatDuration(totals.movieSeconds, style)}</dd>
        <dt style={label}>確認テスト</dt>
        <dd style={value}>{totals.testCount}回</dd>
        <dt style={label}>レポート</dt>
        <dd style={value}>{totals.reportCount}件</dd>
        <dt style={label}>定期テスト</dt>
        <dd style={value}>{totals.scheduledAssessmentTests}件</dd>
      </dl>
      {totals.chapterFailures > 0 && (
        <div style={warning}>{totals.chapterFailures}章の数字を取得できませんでした</div>
      )}
    </section>
  );
}
