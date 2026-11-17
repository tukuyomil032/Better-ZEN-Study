import { dayKey, type StudyLog } from "./pace";

export type StreakResult = { current: number; longest: number; todayCounted: boolean };

function dateForKey(key: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(key)) return undefined;
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year!, month! - 1, day!);
  if (date.getFullYear() !== year || date.getMonth() !== month! - 1 || date.getDate() !== day) {
    return undefined;
  }
  return date;
}

function counted(log: StudyLog, key: string, minSeconds: number): boolean {
  const seconds = log.days[key];
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= minSeconds;
}

function nextDayKey(key: string): string | undefined {
  const date = dateForKey(key);
  if (!date) return undefined;
  date.setDate(date.getDate() + 1);
  return dayKey(date);
}

export function computeStreak(log: StudyLog, today: Date, minSeconds: number): StreakResult {
  const todayKey = dayKey(today);
  const todayCounted = counted(log, todayKey, minSeconds);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  yesterday.setDate(yesterday.getDate() - 1);

  let current = 0;
  let cursor = todayCounted
    ? new Date(today.getFullYear(), today.getMonth(), today.getDate())
    : counted(log, dayKey(yesterday), minSeconds)
      ? yesterday
      : undefined;
  while (cursor) {
    if (!counted(log, dayKey(cursor), minSeconds)) break;
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const keys = Object.keys(log.days)
    .filter((key) => dateForKey(key) !== undefined && counted(log, key, minSeconds))
    .sort();
  let longest = 0;
  let run = 0;
  let previousKey: string | undefined;
  for (const key of keys) {
    run = previousKey && nextDayKey(previousKey) === key ? run + 1 : 1;
    longest = Math.max(longest, run);
    previousKey = key;
  }

  return { current, longest, todayCounted };
}

export function lastNDays(
  log: StudyLog,
  today: Date,
  n: number,
): { key: string; seconds: number; counted: boolean }[] {
  const count = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  const firstDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  firstDay.setDate(firstDay.getDate() - Math.max(0, count - 1));
  const days: { key: string; seconds: number; counted: boolean }[] = [];

  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate());
    date.setDate(date.getDate() + offset);
    const key = dayKey(date);
    const value = log.days[key];
    const seconds = typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
    days.push({ key, seconds, counted: seconds > 0 });
  }

  return days;
}
