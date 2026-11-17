import { chapterSections, type ChapterMaterial } from "./chapter-sections";

export const ZEN_API_BASE = "https://api.nnn.ed.nico";

export type ChapterSection = {
  resource_type: string;
  id: number;
  title: string;
  passed: boolean;
  // Only movies carry length and playback_position. Tests and reports omit them.
  length?: number;
  material_type: "main" | "supplement";
  content_url: string;
  playback_position?: number;
};

export type MonthlyAssessmentTest = {
  assessment_test_id: number;
  course_id: number;
  title: string;
  subject_category_title: string;
  course_title: string;
  total_question: number;
  time_limit: number;
  exempted: boolean;
  total_answered_question: number;
  scale_score: number | null;
  max_scale_score: number | null;
  drafted: boolean;
};

export type MonthlyChapter = {
  course_id: number;
  chapter_id: number;
  subject_category_title: string;
  course_title: string;
  chapter_title: string;
  total_count: number;
  passed_count: number;
  exempted: boolean;
};

export type MonthlyDeadlineGroup = {
  deadline: string;
  assessment_tests: MonthlyAssessmentTest[];
  chapters: MonthlyChapter[];
};

export type MonthlyReport = {
  year: number;
  month: number;
  total_chapter_count: number;
  passed_chapter_count: number;
  total_material_count: number;
  passed_material_count: number;
  total_assessment_test: number;
  passed_assessment_test_count: number;
  deadline_groups: MonthlyDeadlineGroup[];
  completed_chapters?: MonthlyChapter[];
  passed_assessment_tests?: MonthlyAssessmentTest[];
};

export type FetchLike = (
  url: string,
  init?: { credentials?: "include" | "omit" | "same-origin" },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class ZenApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ZenApiError";
  }
}

function assertInteger(name: string, value: number): void {
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be an integer`);
}

export function chapterUrl(courseId: number, chapterId: number): string {
  assertInteger("courseId", courseId);
  assertInteger("chapterId", chapterId);
  return `${ZEN_API_BASE}/v2/material/courses/${courseId}/chapters/${chapterId}?revision=1`;
}

export function monthlyUrl(year: number, month: number): string {
  assertInteger("year", year);
  assertInteger("month", month);
  if (month < 1 || month > 12) throw new RangeError("month must be between 1 and 12");
  return `${ZEN_API_BASE}/v2/dashboard/report_progresses/monthly/${year}/${month}?service=basic`;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// One material as the rest of the extension reads it, or undefined when it cannot be read. The
// material comes from chapterSections, which already gives an advanced material its `passed` and
// `material_type`. An advanced material may have no content_url (a VR experience has an empty one).
function toChapterSection(material: UnknownRecord): ChapterSection | undefined {
  if (
    typeof material.resource_type !== "string" ||
    !isFiniteNumber(material.id) ||
    typeof material.passed !== "boolean" ||
    (material.length !== undefined && !isFiniteNumber(material.length)) ||
    (material.playback_position !== undefined && !isFiniteNumber(material.playback_position))
  ) {
    return undefined;
  }
  const section: ChapterSection = {
    resource_type: material.resource_type,
    id: material.id,
    title: typeof material.title === "string" ? material.title : "",
    passed: material.passed,
    material_type: material.material_type === "supplement" ? "supplement" : "main",
    content_url: typeof material.content_url === "string" ? material.content_url : "",
  };
  if (isFiniteNumber(material.length)) section.length = material.length;
  if (isFiniteNumber(material.playback_position)) {
    section.playback_position = material.playback_position;
  }
  return section;
}

// A chapter as the extension reads it. `advanced` is true when the materials sat under class_headers.
export type ChapterData = { title: string; sections: ChapterSection[]; advanced: boolean };

// A chapter's materials in the order the site lists them, whichever shape the site used. Returns
// undefined when the response has no chapter, or when a material cannot be read.
function chapterData(payload: unknown): ChapterData | undefined {
  const chapter = isRecord(payload) ? payload.chapter : undefined;
  if (!isRecord(chapter)) return undefined;
  const hasSections = Array.isArray(chapter.sections);
  if (!hasSections && !Array.isArray(chapter.class_headers)) return undefined;

  const sections: ChapterSection[] = [];
  for (const material of chapterSections(chapter)) {
    const section = toChapterSection(material);
    if (!section) return undefined;
    sections.push(section);
  }
  return {
    title: typeof chapter.title === "string" ? chapter.title : "",
    sections,
    // An advanced chapter has no flat sections list; its materials sit under class_headers.
    advanced: !hasSections,
  };
}

function isMonthlyAssessmentTest(value: unknown): value is MonthlyAssessmentTest {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.assessment_test_id) &&
    isFiniteNumber(value.course_id) &&
    typeof value.title === "string" &&
    typeof value.subject_category_title === "string" &&
    typeof value.course_title === "string" &&
    isFiniteNumber(value.total_question) &&
    isFiniteNumber(value.time_limit) &&
    typeof value.exempted === "boolean" &&
    isFiniteNumber(value.total_answered_question) &&
    (value.scale_score === null || isFiniteNumber(value.scale_score)) &&
    (value.max_scale_score === null || isFiniteNumber(value.max_scale_score)) &&
    typeof value.drafted === "boolean"
  );
}

function isMonthlyChapter(value: unknown): value is MonthlyChapter {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.course_id) &&
    isFiniteNumber(value.chapter_id) &&
    typeof value.subject_category_title === "string" &&
    typeof value.course_title === "string" &&
    typeof value.chapter_title === "string" &&
    isFiniteNumber(value.total_count) &&
    isFiniteNumber(value.passed_count) &&
    typeof value.exempted === "boolean"
  );
}

function isMonthlyDeadlineGroup(value: unknown): value is MonthlyDeadlineGroup {
  if (!isRecord(value) || typeof value.deadline !== "string") return false;
  return (
    Array.isArray(value.assessment_tests) &&
    value.assessment_tests.every(isMonthlyAssessmentTest) &&
    Array.isArray(value.chapters) &&
    value.chapters.every(isMonthlyChapter)
  );
}

function isMonthlyReport(value: unknown): value is MonthlyReport {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.year) &&
    isFiniteNumber(value.month) &&
    isFiniteNumber(value.total_chapter_count) &&
    isFiniteNumber(value.passed_chapter_count) &&
    isFiniteNumber(value.total_material_count) &&
    isFiniteNumber(value.passed_material_count) &&
    isFiniteNumber(value.total_assessment_test) &&
    isFiniteNumber(value.passed_assessment_test_count) &&
    Array.isArray(value.deadline_groups) &&
    value.deadline_groups.every(isMonthlyDeadlineGroup) &&
    (!Object.prototype.hasOwnProperty.call(value, "completed_chapters") ||
      (Array.isArray(value.completed_chapters) &&
        value.completed_chapters.every(isMonthlyChapter))) &&
    (!Object.prototype.hasOwnProperty.call(value, "passed_assessment_tests") ||
      (Array.isArray(value.passed_assessment_tests) &&
        value.passed_assessment_tests.every(isMonthlyAssessmentTest)))
  );
}

export async function fetchChapter(
  courseId: number,
  chapterId: number,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<ChapterData> {
  const url = chapterUrl(courseId, chapterId);
  const response = await fetchImpl(url, { credentials: "include" });
  if (!response.ok) {
    throw new ZenApiError(`Chapter request failed with status ${response.status}`, response.status);
  }

  const payload = await response.json();
  const data = chapterData(payload);
  if (!data) {
    throw new ZenApiError(
      `Chapter response has an invalid shape: ${describePayloadShape(payload)}`,
    );
  }
  return data;
}

export async function fetchChapterSections(
  courseId: number,
  chapterId: number,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<ChapterSection[]> {
  const chapter = await fetchChapter(courseId, chapterId, fetchImpl);
  return chapter.sections;
}

// Describes the shape of an unexpected response using key names and value types only.
// Values are never included, so the text is safe to log.
export function describePayloadShape(payload: unknown): string {
  if (!isRecord(payload)) return `payload=${payload === null ? "null" : typeof payload}`;
  const keys = Object.keys(payload).slice(0, 8).join("|");
  const chapter = payload.chapter;
  if (!isRecord(chapter)) {
    return `keys=${keys}; chapter=${chapter === null ? "null" : typeof chapter}`;
  }
  if (!Array.isArray(chapter.sections) && !Array.isArray(chapter.class_headers)) {
    return `keys=${keys}; sections=${typeof chapter.sections}; class_headers=${typeof chapter.class_headers}`;
  }
  const materials: ChapterMaterial[] = chapterSections(chapter);
  const headers = Array.isArray(chapter.class_headers) ? chapter.class_headers.length : "none";
  const invalidIndex = materials.findIndex((material) => toChapterSection(material) === undefined);
  if (invalidIndex < 0) return `keys=${keys}; materials=${materials.length}; headers=${headers}`;
  const invalid = materials[invalidIndex];
  const fields = invalid
    ? Object.entries(invalid)
        .slice(0, 12)
        .map(([key, value]) => `${key}:${value === null ? "null" : typeof value}`)
        .join(",")
    : "";
  return `keys=${keys}; materials=${materials.length}; headers=${headers}; firstInvalid=${invalidIndex}(${fields})`;
}

export async function fetchMonthly(
  year: number,
  month: number,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<MonthlyReport> {
  const url = monthlyUrl(year, month);
  const response = await fetchImpl(url, { credentials: "include" });
  if (!response.ok) {
    throw new ZenApiError(`Monthly request failed with status ${response.status}`, response.status);
  }

  const payload = await response.json();
  if (!isMonthlyReport(payload)) {
    throw new ZenApiError("Monthly response has an invalid shape");
  }
  return payload;
}

export function createTtlCache<T>(
  ttlMs: number,
  now: () => number = Date.now,
): { get(key: string): T | undefined; set(key: string, value: T): void } {
  const entries = new Map<string, { value: T; expiresAt: number }>();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (now() >= entry.expiresAt) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      entries.set(key, { value, expiresAt: now() + ttlMs });
    },
  };
}
