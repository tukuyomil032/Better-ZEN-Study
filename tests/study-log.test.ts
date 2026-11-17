import { describe, expect, test } from "bun:test";
import { computeStreak, lastNDays } from "../src/lib/study-log";

describe("computeStreak", () => {
  test("continues yesterday's run when today is not counted yet", () => {
    expect(
      computeStreak(
        { days: { "2026-11-14": 600, "2026-11-15": 600, "2026-11-16": 20 } },
        new Date(2026, 10, 16),
        60,
      ),
    ).toEqual({ current: 2, longest: 2, todayCounted: false });
  });

  test("counts a run across a year boundary", () => {
    const today = new Date(2026, 0, 2, 9, 30);
    const originalTime = today.getTime();
    expect(
      computeStreak({ days: { "2025-12-31": 60, "2026-01-01": 120, "2026-01-02": 60 } }, today, 60),
    ).toEqual({ current: 3, longest: 3, todayCounted: true });
    expect(today.getTime()).toBe(originalTime);
  });

  test("reports zero current streak when neither today nor yesterday counts", () => {
    expect(computeStreak({ days: { "2026-11-14": 600 } }, new Date(2026, 10, 16), 60)).toEqual({
      current: 0,
      longest: 1,
      todayCounted: false,
    });
  });
});

describe("lastNDays", () => {
  test("returns oldest first across a year boundary and marks positive seconds", () => {
    expect(
      lastNDays({ days: { "2025-12-31": 2, "2026-01-01": 0 } }, new Date(2026, 0, 2), 3),
    ).toEqual([
      { key: "2025-12-31", seconds: 2, counted: true },
      { key: "2026-01-01", seconds: 0, counted: false },
      { key: "2026-01-02", seconds: 0, counted: false },
    ]);
  });

  test("returns no days for a non-positive count", () => {
    expect(lastNDays({ days: {} }, new Date(2026, 0, 1), 0)).toEqual([]);
  });
});
