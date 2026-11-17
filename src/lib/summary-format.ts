import { formatDuration } from "./duration";

export type TimeStyle = "hms" | "ja";

// One-line total shown in the chapter header row.
export function formatChapterTotal(
  movieCount: number,
  movieSeconds: number,
  style: TimeStyle,
): string {
  return `動画${movieCount}本 ・ 総再生時間 ${formatDuration(movieSeconds, style)}`;
}

// Compact line shown at the right end of each subject row on the monthly page.
export function formatSubjectLine(args: {
  movieCount: number;
  movieSeconds: number;
  testCount: number;
  reportCount: number;
  style: TimeStyle;
}): string {
  return `動画${args.movieCount}本 ・ ${formatDuration(args.movieSeconds, args.style)} ・ テスト${args.testCount}回 ・ レポート${args.reportCount}件`;
}

// Key used to match a subject row (href /courses/{c}/chapters/{ch}) with a summary entry.
export function chapterKey(courseId: number, chapterId: number): string {
  return `${courseId}:${chapterId}`;
}
