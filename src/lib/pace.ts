export type StudyLog = { days: Record<string, number> };

export type PlanSettings = {
  unit: "day" | "week";
  hours: number;
  startDate: string | null;
  endDate: string | null;
  streakMinMinutes: number;
  weekStartsOn: 0 | 1;
};

export type PaceResult = {
  planDays: number | null;
  dailyGoalSeconds: number;
  todaySeconds: number;
  weekSeconds: number;
  weekGoalSeconds: number;
  expectedSeconds: number;
  actualSeconds: number;
  deltaSeconds: number;
  state: "ahead" | "on_track" | "behind" | "no_plan";
  etaDate: string | null;
  finishDeadlineDelta: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export function dayKey(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function copyLog(log: StudyLog): StudyLog {
  return { days: { ...log.days } };
}

export function addStudySeconds(
  log: StudyLog,
  date: Date,
  seconds: number,
  maxStepSeconds = 2.5,
): StudyLog {
  const next = copyLog(log);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > maxStepSeconds) return next;

  const key = dayKey(date);
  const existing = next.days[key];
  next.days[key] =
    (typeof existing === "number" && Number.isFinite(existing) && existing >= 0 ? existing : 0) +
    seconds;
  return next;
}

export function pruneStudyLog(log: StudyLog, today: Date, keepDays = 400): StudyLog {
  const safeKeepDays = Number.isFinite(keepDays) ? Math.max(0, Math.floor(keepDays)) : 400;
  if (safeKeepDays === 0) return { days: {} };
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  cutoff.setDate(cutoff.getDate() - (safeKeepDays - 1));
  const cutoffKey = dayKey(cutoff);
  const todayKey = dayKey(today);
  const days: Record<string, number> = {};

  for (const [key, seconds] of Object.entries(log.days)) {
    if (parseDateKey(key) && key >= cutoffKey && key <= todayKey) days[key] = seconds;
  }

  return { days };
}

export function parseStudyLog(raw: unknown): StudyLog {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { days: {} };
  const daysValue = (raw as { days?: unknown }).days;
  if (typeof daysValue !== "object" || daysValue === null || Array.isArray(daysValue)) {
    return { days: {} };
  }

  const days: Record<string, number> = {};
  for (const [key, value] of Object.entries(daysValue)) {
    if (
      DATE_KEY_PATTERN.test(key) &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0
    ) {
      days[key] = value;
    }
  }
  return { days };
}

function parseDateKey(value: string | null): Date | undefined {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year!, month! - 1, day!);
  if (date.getFullYear() !== year || date.getMonth() !== month! - 1 || date.getDate() !== day) {
    return undefined;
  }
  return date;
}

function dateOrdinal(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

function daysBetween(start: Date, end: Date): number {
  return dateOrdinal(end) - dateOrdinal(start);
}

function secondsFor(log: StudyLog, key: string): number {
  const seconds = log.days[key];
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
}

function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

function sumBetween(log: StudyLog, startKey: string, endKey: string): number {
  return Object.entries(log.days).reduce((sum, [key, value]) => {
    if (
      key >= startKey &&
      key <= endKey &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0
    ) {
      return sum + value;
    }
    return sum;
  }, 0);
}

export function computePace(input: {
  remainingSeconds: number;
  log: StudyLog;
  plan: PlanSettings;
  today: Date;
}): PaceResult {
  const { log, plan, today } = input;
  const todayKey = dayKey(today);
  const startDate = parseDateKey(plan.startDate);
  const endDate = parseDateKey(plan.endDate);
  const planDays =
    startDate && endDate && dateOrdinal(endDate) >= dateOrdinal(startDate)
      ? daysBetween(startDate, endDate) + 1
      : null;
  const hours = Number.isFinite(plan.hours) ? plan.hours : 0;
  const dailyGoalSeconds = Math.max(0, hours * 3_600) / (plan.unit === "week" ? 7 : 1);
  const todaySeconds = secondsFor(log, todayKey);

  const weekStartsOn = plan.weekStartsOn === 1 ? 1 : 0;
  const daysSinceWeekStart = (today.getDay() - weekStartsOn + 7) % 7;
  let weekSeconds = 0;
  for (let offset = 0; offset <= daysSinceWeekStart; offset += 1) {
    weekSeconds += secondsFor(log, dayKey(addCalendarDays(today, -offset)));
  }

  const weekGoalSeconds = dailyGoalSeconds * 7;
  let expectedSeconds = 0;
  let actualSeconds = 0;
  if (startDate && dateOrdinal(today) >= dateOrdinal(startDate)) {
    const elapsedDays = daysBetween(startDate, today) + 1;
    expectedSeconds =
      dailyGoalSeconds * (planDays === null ? elapsedDays : Math.min(elapsedDays, planDays));
    actualSeconds = sumBetween(log, dayKey(startDate), todayKey);
  }

  const deltaSeconds = actualSeconds - expectedSeconds;
  let state: PaceResult["state"] = "no_plan";
  if (dailyGoalSeconds > 0 && startDate) {
    const tolerance = dailyGoalSeconds * 0.1;
    state =
      deltaSeconds >= tolerance ? "ahead" : deltaSeconds <= -tolerance ? "behind" : "on_track";
  }

  let etaDate: string | null = null;
  if (
    dailyGoalSeconds > 0 &&
    Number.isFinite(input.remainingSeconds) &&
    input.remainingSeconds >= 0
  ) {
    etaDate = dayKey(addCalendarDays(today, Math.ceil(input.remainingSeconds / dailyGoalSeconds)));
  }

  const finishDeadlineDelta =
    endDate && etaDate ? daysBetween(parseDateKey(etaDate)!, endDate) : null;

  return {
    planDays,
    dailyGoalSeconds,
    todaySeconds,
    weekSeconds,
    weekGoalSeconds,
    expectedSeconds,
    actualSeconds,
    deltaSeconds,
    state,
    etaDate,
    finishDeadlineDelta,
  };
}
