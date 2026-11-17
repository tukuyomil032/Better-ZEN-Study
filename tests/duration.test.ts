import { expect, test } from "bun:test";
import { formatDuration, sumSeconds } from "../src/lib/duration";

test("formats durations as hms or Japanese hours and minutes", () => {
  expect(formatDuration(7_542, "hms")).toBe("2:05:42");
  expect(formatDuration(65, "hms")).toBe("1:05");
  expect(formatDuration(7_542, "ja")).toBe("2時間5分");
  expect(formatDuration(3_600, "ja")).toBe("1時間0分");
  expect(formatDuration(290, "ja")).toBe("4分");
  expect(formatDuration(65.9, "hms")).toBe("1:05");
});

test("rejects negative and non-finite durations", () => {
  expect(() => formatDuration(-1, "hms")).toThrow(RangeError);
  expect(() => formatDuration(Number.NaN, "hms")).toThrow(RangeError);
  expect(() => formatDuration(Number.POSITIVE_INFINITY, "hms")).toThrow(RangeError);
});

test("sums seconds", () => {
  expect(sumSeconds([216, 561, 413])).toBe(1_190);
  expect(sumSeconds([])).toBe(0);
});
