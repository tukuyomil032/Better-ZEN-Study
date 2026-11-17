import { asRecord, chapterSections, type UnknownRecord } from "../chapter-sections";

export type ChapterItemKind = "movie" | "test" | "report" | "lesson" | "other";

export type ChapterItem = {
  id: number;
  kind: ChapterItemKind;
  resourceType: string;
  title: string;
  supplement: boolean;
  passed: boolean;
  // False for a material that carries no progress (a lesson). Such an item is never shown as "not yet".
  hasProgress: boolean;
  lengthSeconds: number;
  playbackSeconds: number;
  remainingSeconds: number;
  // A practice problem's questions: how many are cleared out of how many. Zero for other items.
  questionClear: number;
  questionTotal: number;
  // Where the item's own page is. Empty when the item has no page to open.
  path: string;
  // False for an item with no page to open: a VR experience, which the site gives no address.
  openable: boolean;
};

export type ChapterFilter = "required" | "supplement" | "all";

export type ChapterView = {
  id: number;
  title: string;
  outline: string;
  // True for an advanced chapter, whose materials carry comprehension and question progress.
  advanced: boolean;
  items: ChapterItem[];
  totals: {
    movieCount: number;
    movieSeconds: number;
    remainingSeconds: number;
    passedMovieCount: number;
    testCount: number;
    reportCount: number;
    // Advanced chapters: materials understood out of the materials that are counted.
    materialPassed: number;
    materialTotal: number;
    // Advanced chapters: practice questions cleared out of all practice questions.
    questionClear: number;
    questionTotal: number;
  };
};

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nonNegativeNumber(value: unknown): number {
  return Math.max(0, finiteNumber(value));
}

function itemKind(resourceType: string): ChapterItemKind {
  if (resourceType === "movie") return "movie";
  if (resourceType === "evaluation_test" || resourceType === "essay_test") return "test";
  if (resourceType === "evaluation_report" || resourceType === "essay_report") return "report";
  if (resourceType === "lesson") return "lesson";
  return "other";
}

function matchesFilter(section: UnknownRecord, filter: ChapterFilter): boolean {
  if (filter === "all") return true;
  if (filter === "required") return section.material_type === "main";
  return section.material_type === "supplement";
}

export function buildChapterView(
  raw: unknown,
  courseId: number,
  chapterId: number,
  filter: ChapterFilter,
): ChapterView | undefined {
  const chapter = asRecord(asRecord(raw)?.chapter);
  if (!chapter) return undefined;

  // An advanced chapter has no flat `sections`; its materials come from the headers instead.
  const advanced = !Array.isArray(chapter.sections);
  const items: ChapterItem[] = [];

  for (const section of chapterSections(chapter)) {
    if (!matchesFilter(section, filter)) continue;

    const resourceType = stringValue(section.resource_type);
    const kind = itemKind(resourceType);
    const isMovie = kind === "movie";
    const isExercise = resourceType === "exercise";
    const lengthSeconds = isMovie ? nonNegativeNumber(section.length) : 0;
    const playbackSeconds = isMovie ? nonNegativeNumber(section.playback_position) : 0;
    const id = finiteNumber(section.id);
    const checkpoint = asRecord(asRecord(section.progress)?.checkpoint) ?? {};

    // A lesson has no address of its own on the shell: it opens on the site's lesson page. A VR
    // experience has no page the site gives us, so it is listed but cannot be opened.
    const openable = resourceType !== "vr_experience";
    const path = !openable
      ? ""
      : kind === "lesson"
        ? `/courses/${courseId}/chapters/${chapterId}/lessons/${id}`
        : isMovie
          ? `/courses/${courseId}/chapters/${chapterId}/movie/${id}`
          : `/courses/${courseId}/chapters/${chapterId}/${resourceType}/${id}`;

    items.push({
      id,
      kind,
      resourceType,
      title: stringValue(section.title),
      supplement: section.material_type === "supplement",
      passed: section.passed === true,
      hasProgress: section.hasProgress === true,
      lengthSeconds,
      playbackSeconds,
      // A passed movie has nothing left, whatever its saved position says: the site stores -1
      // for movies it has finished, which would otherwise count as the whole length.
      remainingSeconds: isMovie
        ? section.passed === true
          ? 0
          : Math.max(0, lengthSeconds - playbackSeconds)
        : 0,
      questionClear: isExercise ? nonNegativeNumber(checkpoint.clear) : 0,
      questionTotal: isExercise ? nonNegativeNumber(checkpoint.total) : 0,
      path,
      openable,
    });
  }

  const movies = items.filter((item) => item.kind === "movie");
  const counted = items.filter((item) => item.hasProgress);
  return {
    id: finiteNumber(chapter.id),
    title: stringValue(chapter.title),
    outline: stringValue(chapter.outline),
    advanced,
    items,
    totals: {
      movieCount: movies.length,
      movieSeconds: movies.reduce((sum, item) => sum + item.lengthSeconds, 0),
      remainingSeconds: movies.reduce((sum, item) => sum + item.remainingSeconds, 0),
      passedMovieCount: movies.filter((item) => item.passed).length,
      testCount: items.filter((item) => item.kind === "test").length,
      reportCount: items.filter((item) => item.kind === "report").length,
      materialPassed: counted.filter((item) => item.passed).length,
      materialTotal: counted.length,
      questionClear: items.reduce((sum, item) => sum + item.questionClear, 0),
      questionTotal: items.reduce((sum, item) => sum + item.questionTotal, 0),
    },
  };
}
