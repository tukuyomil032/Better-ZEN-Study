import { summarizeMonth, summarizeSections } from "./summary";
import type { ChapterSection, MonthlyReport } from "./zen-api";

export type ChapterRef = {
  courseId: number;
  chapterId: number;
  subjectTitle: string;
  courseTitle: string;
  chapterTitle: string;
};

export type ChapterSummary = ChapterRef & {
  movieCount: number;
  movieSeconds: number;
  supplementMovieCount: number;
  supplementSeconds: number;
  testCount: number;
  reportCount: number;
  error?: string;
};

export type MonthSummary = {
  year: number;
  month: number;
  totals: {
    movieCount: number;
    movieSeconds: number;
    testCount: number;
    reportCount: number;
    scheduledAssessmentTests: number;
    chapterCount: number;
    chapterFailures: number;
  };
  chapters: ChapterSummary[];
};

export type ChapterSectionsFetcher = (
  courseId: number,
  chapterId: number,
) => Promise<readonly ChapterSection[]>;

export function chaptersFromMonthly(report: MonthlyReport): ChapterRef[] {
  const chapters = [
    ...report.deadline_groups.flatMap((group) => group.chapters),
    ...(report.completed_chapters ?? []),
  ];
  const seen = new Set<string>();
  const refs: ChapterRef[] = [];

  for (const chapter of chapters) {
    const key = `${chapter.course_id}:${chapter.chapter_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({
      courseId: chapter.course_id,
      chapterId: chapter.chapter_id,
      subjectTitle: chapter.subject_category_title,
      courseTitle: chapter.course_title,
      chapterTitle: chapter.chapter_title,
    });
  }

  return refs;
}

export function buildChapterSummary(
  ref: ChapterRef,
  sections: readonly ChapterSection[],
  includeSupplement: boolean,
): ChapterSummary {
  const summary = summarizeSections(sections, { includeSupplement });
  return {
    ...ref,
    movieCount: summary.movieCount,
    movieSeconds: summary.movieSeconds,
    supplementMovieCount: summary.supplementMovieCount,
    supplementSeconds: summary.supplementSeconds,
    testCount: summary.testCount,
    reportCount: summary.reportCount,
  };
}

function failedChapterSummary(ref: ChapterRef): ChapterSummary {
  return {
    ...ref,
    movieCount: 0,
    movieSeconds: 0,
    supplementMovieCount: 0,
    supplementSeconds: 0,
    testCount: 0,
    reportCount: 0,
    error: "Failed to fetch chapter sections.",
  };
}

export async function summarizeChapters(
  refs: readonly ChapterRef[],
  fetchSections: ChapterSectionsFetcher,
  options: { includeSupplement: boolean; concurrency?: number },
): Promise<ChapterSummary[]> {
  const concurrency = options.concurrency ?? 3;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("concurrency must be a positive integer");
  }

  const summaries: ChapterSummary[] = [];
  let nextIndex = 0;

  async function processNext(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      const ref = refs[index];
      if (ref === undefined) return;

      let sections: readonly ChapterSection[];
      try {
        sections = await fetchSections(ref.courseId, ref.chapterId);
      } catch {
        summaries[index] = failedChapterSummary(ref);
        continue;
      }

      summaries[index] = buildChapterSummary(ref, sections, options.includeSupplement);
    }
  }

  const workerCount = Math.min(concurrency, refs.length);
  await Promise.all(Array.from({ length: workerCount }, () => processNext()));
  return refs.map((_, index) => {
    const summary = summaries[index];
    if (summary === undefined) {
      throw new Error(`Missing chapter summary at index ${index}`);
    }
    return summary;
  });
}

export function monthSummary(
  report: MonthlyReport,
  chapters: readonly ChapterSummary[],
): MonthSummary {
  const totals = summarizeMonth(chapters, report.total_assessment_test);
  return {
    year: report.year,
    month: report.month,
    totals: {
      ...totals,
      chapterCount: chapters.length,
      chapterFailures: chapters.filter((chapter) => chapter.error !== undefined).length,
    },
    chapters: [...chapters],
  };
}
