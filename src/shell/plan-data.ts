import { chapterRefsFromMonthly, remainingMovieSeconds } from "@/lib/remaining";
import { monthKey, type MonthMaterial } from "@/lib/views/dashboard-view";
import type { ApiGet } from "./data";

// Adds up the movie time still to watch across the given months. Each chapter is read once
// and kept, so moving between screens does not fetch the same chapter again.

export type MonthRef = { year: number; month: number };
export type RemainingTotal = { remainingSeconds: number; chapterCount: number; failures: number };

const chapterCache = new Map<string, unknown>();
const CONCURRENCY = 3;

async function chapterRaw(api: ApiGet, courseId: number, chapterId: number): Promise<unknown> {
  const key = `${courseId}:${chapterId}`;
  const cached = chapterCache.get(key);
  if (cached !== undefined) return cached;
  const raw = await api(`/v2/material/courses/${courseId}/chapters/${chapterId}?revision=1`);
  chapterCache.set(key, raw);
  return raw;
}

export async function loadRemainingSeconds(
  api: ApiGet,
  months: readonly MonthRef[],
  includeSupplement: boolean,
): Promise<RemainingTotal> {
  const refs = new Map<string, { courseId: number; chapterId: number }>();
  for (const month of months) {
    try {
      const raw = await api(
        `/v2/dashboard/report_progresses/monthly/${month.year}/${month.month}?service=basic`,
      );
      for (const ref of chapterRefsFromMonthly(raw))
        refs.set(`${ref.courseId}:${ref.chapterId}`, ref);
    } catch {
      // A month that fails to load adds nothing; the total then says so through failures.
    }
  }

  const list = [...refs.values()];
  let remainingSeconds = 0;
  let failures = 0;
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const ref = list[next];
      next += 1;
      if (!ref) continue;
      try {
        const raw = await chapterRaw(api, ref.courseId, ref.chapterId);
        remainingSeconds += remainingMovieSeconds(raw, includeSupplement).remainingSeconds;
      } catch {
        failures += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, () => worker()));
  return { remainingSeconds, chapterCount: list.length, failures };
}

// Reads each month's material count, so the dashboard's percent matches the site's own figure.
// A month that fails to load is left out, and that month keeps the chapter and test figure.
export async function loadMonthMaterials(
  api: ApiGet,
  months: readonly MonthRef[],
  onFailure?: (month: MonthRef, error: unknown) => void,
): Promise<Map<string, MonthMaterial>> {
  const result = new Map<string, MonthMaterial>();
  let next = 0;
  const worker = async () => {
    while (next < months.length) {
      const month = months[next];
      next += 1;
      if (!month) continue;
      try {
        const raw = (await api(
          `/v2/dashboard/report_progresses/monthly/${month.year}/${month.month}?service=basic`,
        )) as { passed_material_count?: unknown; total_material_count?: unknown } | null;
        const passed = raw?.passed_material_count;
        const total = raw?.total_material_count;
        if (typeof passed === "number" && typeof total === "number") {
          result.set(monthKey(month.year, month.month), { passed, total });
        }
      } catch (error) {
        // Keeps the chapter and test figure for this month.
        onFailure?.(month, error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, months.length) }, () => worker()));
  return result;
}
