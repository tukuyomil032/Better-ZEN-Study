import { describe, expect, test } from "bun:test";
import type { LogRecord } from "../src/lib/logger";
import {
  describeRecord,
  filterEntries,
  groupRecords,
  httpHint,
  summarize,
  type Described,
} from "../src/lib/diagnostics";

function record(overrides: Partial<LogRecord>): LogRecord {
  return {
    time: "2026-11-17T01:00:00.000Z",
    scope: "bg",
    level: "info",
    source: "bg",
    message: "background started",
    data: { version: "0.0.0" },
    ...overrides,
  };
}

describe("describeRecord", () => {
  test("turns a known message into one sentence with its values", () => {
    const described = describeRecord(
      record({ message: "monthly fetched", data: { year: 2026, month: 12, chapters: 11 } }),
    );
    expect(described.headline).toBe("2026年12月のレポート情報を読みました（章 11 件）");
    expect(described.area).toBe("summary");
    expect(described.severity).toBe("ok");
    expect(described.detail).toEqual(["year: 2026", "month: 12", "chapters: 11"]);
  });

  test("gives a hint for a failed request that says what to do", () => {
    const described = describeRecord(
      record({
        level: "warn",
        message: "api get failed",
        data: { path: "/v2/material/courses/1598", status: 401 },
      }),
    );
    expect(described.severity).toBe("warn");
    expect(described.headline).toBe("通信が失敗しました: /v2/material/courses/1598（HTTP 401）");
    expect(described.hint).toContain("ログイン");
  });

  test("keeps the page address as the first detail line when the record has one", () => {
    const described = describeRecord(
      record({
        path: "/courses/2036/chapters/20212",
        message: "ended accepted",
        data: { movieId: 2 },
      }),
    );
    expect(described.detail[0]).toBe("画面: /courses/2036/chapters/20212");
  });

  test("shows a message with no rule as its own text, at its level", () => {
    const described = describeRecord(
      record({ level: "error", message: "something new happened", data: { code: 7 } }),
    );
    expect(described.headline).toBe("something new happened");
    expect(described.severity).toBe("problem");
    expect(described.detail).toEqual(["code: 7"]);
  });

  test("marks developer-level records as detailed", () => {
    expect(describeRecord(record({ level: "debug", message: "unknown debug" })).detailed).toBe(
      true,
    );
    expect(
      describeRecord(record({ message: "play", level: "debug", data: { rate: 1 } })).detailed,
    ).toBe(true);
    expect(describeRecord(record({ message: "monthly fetched" })).detailed).toBe(false);
  });

  test("names the records the shell writes about screens and empty chapters", () => {
    expect(
      describeRecord(record({ message: "画面を開きました", data: { screen: "章 1" } })).headline,
    ).toBe("章 1 を開きました");
    expect(
      describeRecord(
        record({
          level: "warn",
          message: "章に教材が見つかりませんでした",
          data: { chapterId: 9 },
        }),
      ).headline,
    ).toBe("章 9 に、教材が一つも見つかりませんでした");
  });
});

describe("httpHint", () => {
  test("explains the statuses the site returns", () => {
    expect(httpHint(401)).toContain("ログイン");
    expect(httpHint(403)).toContain("見られない");
    expect(httpHint(404)).toContain("見つかりません");
    expect(httpHint(503)).toContain("一時的");
    expect(httpHint(418)).toContain("通信");
  });
});

describe("groupRecords", () => {
  test("joins a run of the same entry into one with a count", () => {
    const groups = groupRecords([
      record({ message: "play", level: "debug", data: { rate: 1 } }),
      record({ message: "play", level: "debug", data: { rate: 1 } }),
      record({ message: "play", level: "debug", data: { rate: 1 } }),
      record({ message: "monthly fetched", data: { year: 2026, month: 6, chapters: 8 } }),
    ]);
    expect(groups.map((group) => group.repeat)).toEqual([3, 1]);
  });
});

describe("filterEntries", () => {
  const now = new Date("2026-11-17T02:00:00.000Z");
  const entries: Described[] = groupRecords([
    record({
      time: "2026-11-17T01:59:00.000Z",
      level: "error",
      message: "autoplay failed",
      data: { error: "x" },
    }),
    record({
      time: "2026-11-17T01:58:00.000Z",
      level: "debug",
      message: "play",
      data: { rate: 1 },
    }),
    record({
      time: "2026-11-16T10:00:00.000Z",
      level: "warn",
      message: "api get failed",
      data: { path: "/v2/x", status: 500 },
    }),
    record({
      time: "2026-11-17T01:50:00.000Z",
      message: "monthly fetched",
      data: { year: 2026, month: 12, chapters: 11 },
    }),
  ]);

  test("shows only the severities asked for, and hides developer detail by default", () => {
    const problems = filterEntries(
      entries,
      { minSeverity: "problem", area: "all", showDetailed: false },
      now,
    );
    expect(problems.map((entry) => entry.severity)).toEqual(["problem"]);
    const everything = filterEntries(
      entries,
      { minSeverity: "ok", area: "all", showDetailed: true },
      now,
    );
    expect(everything.some((entry) => entry.detailed)).toBe(true);
  });

  test("keeps only one area, and only records within the time window", () => {
    const network = filterEntries(
      entries,
      { minSeverity: "ok", area: "network", showDetailed: true, withinMs: 24 * 60 * 60 * 1000 },
      now,
    );
    expect(network.map((entry) => entry.headline)).toEqual([
      "通信が失敗しました: /v2/x（HTTP 500）",
    ]);
  });
});

describe("summarize", () => {
  const now = new Date("2026-11-17T02:00:00.000Z");

  test("reports a problem and where it was, when something failed in the last hour", () => {
    const summary = summarize(
      groupRecords([
        record({
          time: "2026-11-17T01:55:00.000Z",
          message: "画面を開きました",
          data: { screen: "マイコース" },
        }),
        record({
          time: "2026-11-17T01:57:00.000Z",
          level: "error",
          message: "autoplay failed",
          data: { error: "boom" },
        }),
      ]),
      now,
    );
    expect(summary.status).toBe("problem");
    expect(summary.problemsLastHour).toBe(1);
    expect(summary.problemAreas).toEqual([{ area: "autoplay", count: 1 }]);
    expect(summary.lastScreen).toBe("マイコース を開きました");
  });

  test("is ok when nothing went wrong in the last hour, even if an older problem exists", () => {
    const summary = summarize(
      groupRecords([
        record({
          time: "2026-11-16T10:00:00.000Z",
          level: "error",
          message: "autoplay failed",
          data: { error: "old" },
        }),
      ]),
      now,
    );
    expect(summary.status).toBe("ok");
    expect(summary.problemsLastHour).toBe(0);
  });
});
