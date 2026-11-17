import { describe, expect, test } from "bun:test";
import {
  createLogger,
  createRecord,
  createRingBuffer,
  LOG_DATA_LIMIT,
  LOG_MESSAGE_LIMIT,
  limitData,
  redactKey,
  sanitizeData,
  type LogRecord,
} from "../src/lib/logger";

const fixedNow = () => new Date("2026-11-16T09:00:00.000Z");

describe("redactKey", () => {
  test("flags credential-like keys regardless of case", () => {
    expect(redactKey("Cookie")).toBe(true);
    expect(redactKey("accessToken")).toBe(true);
    expect(redactKey("authorization")).toBe(true);
    expect(redactKey("api_key")).toBe(true);
    expect(redactKey("courseId")).toBe(false);
  });
});

describe("sanitizeData", () => {
  test("replaces credential-like values and keeps ordinary fields", () => {
    expect(sanitizeData({ courseId: 2472, cookie: "secret=1", nested: { token: "t" } })).toEqual({
      courseId: 2472,
      cookie: "[redacted]",
      nested: { token: "[redacted]" },
    });
  });

  test("truncates long strings and stops at depth 4", () => {
    const long = "a".repeat(300);
    const out = sanitizeData(long) as string;
    expect(out.length).toBeLessThan(300);
    expect(out.endsWith("(truncated)")).toBe(true);

    const deep = { a: { b: { c: { d: { e: "deep" } } } } };
    expect(JSON.stringify(sanitizeData(deep))).toContain("[depth limit]");
  });

  test("caps array and object sizes", () => {
    const array = Array.from({ length: 80 }, (_, i) => i);
    expect((sanitizeData(array) as number[]).length).toBe(50);
  });

  test("turns functions and symbols into placeholders", () => {
    expect(sanitizeData(() => 1)).toBe("[function]");
    expect(sanitizeData(Symbol("x"))).toBe("[symbol]");
  });
});

describe("limitData", () => {
  test("keeps small data as-is", () => {
    expect(limitData({ ok: true, n: 1 })).toEqual({ ok: true, n: 1 });
  });

  test("replaces oversized data with a marker", () => {
    // Each string is cut to 200 chars by sanitizeData, but 50 of them still exceed the limit.
    const list = Array.from({ length: 50 }, () => "y".repeat(200));
    const out = limitData({ list });
    expect(typeof out).toBe("string");
    expect(out as string).toContain("[truncated");
    expect(LOG_DATA_LIMIT).toBeLessThan(50 * 200);
  });
});

describe("createRecord", () => {
  test("limits the message and stamps the time", () => {
    const record = createRecord({
      scope: "bg",
      level: "info",
      source: "bg",
      message: "m".repeat(LOG_MESSAGE_LIMIT + 50),
      now: fixedNow,
    });
    expect(record.message.length).toBeLessThanOrEqual(LOG_MESSAGE_LIMIT + "(truncated)".length + 1);
    expect(record.time).toBe("2026-11-16T09:00:00.000Z");
  });
});

describe("createLogger", () => {
  test("sends a record to the sink for each call above the minimum level", () => {
    const seen: LogRecord[] = [];
    const logger = createLogger({
      scope: "player",
      source: "player",
      sink: (record) => seen.push(record),
      minLevel: "info",
      console: false,
      now: fixedNow,
      path: () => "/courses/2472/chapters/31713/movie/46100",
    });
    logger.debug("hidden");
    logger.info("shown", { speed: 1.25 });
    logger.error("boom");
    expect(seen.map((r) => r.message)).toEqual(["shown", "boom"]);
    expect(seen[0]?.path).toBe("/courses/2472/chapters/31713/movie/46100");
    expect(seen[0]?.data).toEqual({ speed: 1.25 });
  });

  test("keeps logging even when the sink throws", () => {
    const logger = createLogger({
      scope: "bg",
      source: "bg",
      sink: () => {
        throw new Error("storage is down");
      },
      console: false,
    });
    expect(() => logger.warn("still fine")).not.toThrow();
  });
});

describe("createRingBuffer", () => {
  const make = (i: number, level: LogRecord["level"] = "info", scope = "bg"): LogRecord => ({
    time: "t",
    scope,
    level,
    source: "bg",
    message: `m${i}`,
  });

  test("keeps only the newest records, in insertion order", () => {
    const buffer = createRingBuffer(3);
    for (let i = 0; i < 5; i++) buffer.push(make(i));
    expect(buffer.size()).toBe(3);
    expect(buffer.list().map((r) => r.message)).toEqual(["m2", "m3", "m4"]);
  });

  test("filters by scope and minimum level", () => {
    const buffer = createRingBuffer(10);
    buffer.push(make(1, "debug", "bg"));
    buffer.push(make(2, "warn", "bg"));
    buffer.push(make(3, "error", "player"));
    expect(buffer.list({ level: "warn" }).map((r) => r.message)).toEqual(["m2", "m3"]);
    expect(buffer.list({ scope: "player" }).map((r) => r.message)).toEqual(["m3"]);
  });

  test("clear empties the buffer", () => {
    const buffer = createRingBuffer(5);
    buffer.push(make(1));
    buffer.clear();
    expect(buffer.size()).toBe(0);
  });
});
