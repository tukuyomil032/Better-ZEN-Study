export type SectionLike = {
  resource_type: string;
  material_type: string;
  length?: number;
  passed: boolean;
};

export type ChapterSummary = {
  testCount: number;
  reportCount: number;
  movieCount: number;
  movieSeconds: number;
};

export type MonthSummary = {
  movieCount: number;
  movieSeconds: number;
  testCount: number;
  reportCount: number;
  scheduledAssessmentTests: number;
};

export function summarizeSections(
  sections: readonly SectionLike[],
  options: { includeSupplement: boolean },
): Omit<MonthSummary, "scheduledAssessmentTests"> & {
  supplementMovieCount: number;
  supplementSeconds: number;
} {
  let movieCount = 0;
  let movieSeconds = 0;
  let supplementMovieCount = 0;
  let supplementSeconds = 0;
  let testCount = 0;
  let reportCount = 0;

  for (const section of sections) {
    if (section.resource_type === "movie") {
      const length = section.length ?? 0;
      if (section.material_type === "supplement") {
        supplementMovieCount += 1;
        supplementSeconds += length;
        if (options.includeSupplement) {
          movieCount += 1;
          movieSeconds += length;
        }
      } else if (section.material_type === "main") {
        movieCount += 1;
        movieSeconds += length;
      }
    } else if (
      section.resource_type === "evaluation_test" ||
      section.resource_type === "essay_test"
    ) {
      testCount += 1;
    } else if (
      section.resource_type === "evaluation_report" ||
      section.resource_type === "essay_report"
    ) {
      reportCount += 1;
    }
  }

  return {
    movieCount,
    movieSeconds,
    supplementMovieCount,
    supplementSeconds,
    testCount,
    reportCount,
  };
}

export function summarizeMonth(
  chapters: readonly ChapterSummary[],
  scheduledAssessmentTests: number,
): MonthSummary {
  return chapters.reduce<MonthSummary>(
    (summary, chapter) => ({
      movieCount: summary.movieCount + chapter.movieCount,
      movieSeconds: summary.movieSeconds + chapter.movieSeconds,
      testCount: summary.testCount + chapter.testCount,
      reportCount: summary.reportCount + chapter.reportCount,
      scheduledAssessmentTests: summary.scheduledAssessmentTests,
    }),
    {
      movieCount: 0,
      movieSeconds: 0,
      testCount: 0,
      reportCount: 0,
      scheduledAssessmentTests,
    },
  );
}
