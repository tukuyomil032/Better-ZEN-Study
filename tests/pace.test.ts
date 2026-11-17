import { describe, expect, test } from "bun:test";
import {
  addStudySeconds,
  computePace,
  dayKey,
  parseStudyLog,
  pruneStudyLog,
  type PlanSettings,
  type StudyLog,
} from "../src/lib/pace";

describe("dayKey and study log helpers", () => {
  test("formats a local calendar day with zero padding", () => {
    expect(dayKey(new Date(2026, 0, 4, 23, 59))).toBe("2026-01-04");
  });

  test("adds seconds immutably and drops a step larger than 2.5 seconds", () => {
    const original: StudyLog = { days: { "2026-11-16": 10 } };
    const added = addStudySeconds(original, new Date(2026, 10, 16), 2.5);
    const dropped = addStudySeconds(added, new Date(2026, 10, 16), 2.5001);

    expect(added.days["2026-11-16"]).toBe(12.5);
    expect(dropped.days["2026-11-16"]).toBe(12.5);
    expect(original.days["2026-11-16"]).toBe(10);
    expect(added).not.toBe(original);
    expect(added.days).not.toBe(original.days);
    expect(addStudySeconds(original, new Date(2026, 10, 16), -1).days).toEqual(original.days);
    expect(addStudySeconds(original, new Date(2026, 10, 16), Number.NaN).days).toEqual(
      original.days,
    );
  });

  test("prunes old and future entries while retaining the inclusive window", () => {
    const log: StudyLog = {
      days: {
        "2025-10-12": 1,
        "2025-10-13": 2,
        "2026-11-16": 3,
        "2026-11-17": 4,
      },
    };
    expect(pruneStudyLog(log, new Date(2026, 10, 16), 400)).toEqual({
      days: { "2025-10-13": 2, "2026-11-16": 3 },
    });
    expect(log.days["2025-10-12"]).toBe(1);
  });

  test("parses only matching keys and finite non-negative values", () => {
    expect(
      parseStudyLog({
        days: {
          "2026-01-01": 1,
          "2026-1-01": 2,
          "2026-01-02": -1,
          "2026-01-03": Number.POSITIVE_INFINITY,
          "2026-01-04": "3",
        },
      }),
    ).toEqual({ days: { "2026-01-01": 1 } });
    expect(parseStudyLog(null)).toEqual({ days: {} });
    expect(parseStudyLog([])).toEqual({ days: {} });
    expect(parseStudyLog({})).toEqual({ days: {} });
    expect(parseStudyLog({ days: [] })).toEqual({ days: {} });
  });
});

const basePlan: PlanSettings = {
  unit: "day",
  hours: 1,
  startDate: "2026-11-14",
  endDate: "2026-11-20",
  streakMinMinutes: 10,
  weekStartsOn: 1,
};

describe("computePace", () => {
  test("returns no-plan state when dates and goal are unavailable", () => {
    const result = computePace({
      remainingSeconds: 1_800,
      log: { days: {} },
      plan: { ...basePlan, hours: 0, startDate: null, endDate: null },
      today: new Date(2026, 10, 16),
    });
    expect(result.planDays).toBeNull();
    expect(result.state).toBe("no_plan");
    expect(result.expectedSeconds).toBe(0);
    expect(result.actualSeconds).toBe(0);
    expect(result.etaDate).toBeNull();
    expect(result.finishDeadlineDelta).toBeNull();
  });

  test("spreads a week goal over seven days and counts the current Monday-based week", () => {
    const result = computePace({
      remainingSeconds: 0,
      log: {
        days: {
          "2026-11-15": 100,
          "2026-11-16": 200,
          "2026-11-17": 999,
        },
      },
      plan: { ...basePlan, unit: "week", hours: 7, startDate: "2026-11-16", endDate: null },
      today: new Date(2026, 10, 16),
    });
    expect(result.dailyGoalSeconds).toBe(3_600);
    expect(result.weekGoalSeconds).toBe(25_200);
    expect(result.weekSeconds).toBe(200);
    expect(result.expectedSeconds).toBe(3_600);
    expect(result.actualSeconds).toBe(200);
    expect(result.etaDate).toBe("2026-11-16");
  });

  test("handles inclusive ranges, day-of-deadline and whole-day deadline delta", () => {
    const result = computePace({
      remainingSeconds: 7_200,
      log: {
        days: {
          "2026-12-30": 1_000,
          "2026-12-31": 1_000,
        },
      },
      plan: {
        ...basePlan,
        startDate: "2026-12-30",
        endDate: "2026-12-31",
      },
      today: new Date(2026, 11, 31, 18),
    });
    expect(result.planDays).toBe(2);
    expect(result.expectedSeconds).toBe(7_200);
    expect(result.actualSeconds).toBe(2_000);
    expect(result.etaDate).toBe("2027-01-02");
    expect(result.finishDeadlineDelta).toBe(-2);
  });

  test("handles Sunday and Monday week starts across a month boundary", () => {
    const log: StudyLog = {
      days: { "2026-10-31": 10, "2026-11-01": 20, "2026-11-02": 30 },
    };
    const input = {
      remainingSeconds: 10,
      log,
      plan: { ...basePlan, startDate: null, endDate: null },
      today: new Date(2026, 10, 2),
    };
    expect(computePace({ ...input, plan: { ...input.plan, weekStartsOn: 0 } }).weekSeconds).toBe(
      50,
    );
    expect(computePace({ ...input, plan: { ...input.plan, weekStartsOn: 1 } }).weekSeconds).toBe(
      30,
    );
  });
});
