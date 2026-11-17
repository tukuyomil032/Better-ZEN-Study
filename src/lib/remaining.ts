// Remaining study time from the site's own responses. Pure: the caller fetches the JSON.

import { chapterSections } from "./chapter-sections";

export type ChapterRef = { courseId: number; chapterId: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// Every chapter a month's report covers: the deadline groups first, then the completed
// chapters, without repeats. A completed month has its chapters only in completed_chapters.
export function chapterRefsFromMonthly(raw: unknown): ChapterRef[] {
  if (!isRecord(raw)) return [];
  const seen = new Set<string>();
  const refs: ChapterRef[] = [];
  const add = (item: unknown) => {
    if (!isRecord(item)) return;
    const courseId = asNumber(item.course_id);
    const chapterId = asNumber(item.chapter_id);
    if (courseId === undefined || chapterId === undefined) return;
    const key = `${courseId}:${chapterId}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ courseId, chapterId });
  };
  const groups = Array.isArray(raw.deadline_groups) ? raw.deadline_groups : [];
  for (const group of groups) {
    if (isRecord(group) && Array.isArray(group.chapters)) group.chapters.forEach(add);
  }
  if (Array.isArray(raw.completed_chapters)) raw.completed_chapters.forEach(add);
  return refs;
}

// Movie time left in one chapter: the length of each main movie that is not passed yet.
// Supplement movies count only when asked for.
export function remainingMovieSeconds(
  raw: unknown,
  includeSupplement: boolean,
): { movieCount: number; movieSeconds: number; remainingSeconds: number } {
  const empty = { movieCount: 0, movieSeconds: 0, remainingSeconds: 0 };
  // chapterSections reads both chapter shapes: the flat sections of a required chapter, and the
  // materials under class_headers of an advanced one.
  if (!isRecord(raw) || !isRecord(raw.chapter)) return empty;
  let movieCount = 0;
  let movieSeconds = 0;
  let remainingSeconds = 0;
  for (const section of chapterSections(raw.chapter)) {
    if (section.resource_type !== "movie") continue;
    const supplement = section.material_type === "supplement";
    if (supplement && !includeSupplement) continue;
    const length = asNumber(section.length);
    if (length === undefined || length <= 0) continue;
    movieCount += 1;
    movieSeconds += length;
    if (section.passed !== true) remainingSeconds += length;
  }
  return { movieCount, movieSeconds, remainingSeconds };
}
