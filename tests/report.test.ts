import { describe, expect, test } from "bun:test";
import type { LogRecord } from "../src/lib/logger";
import {
  buildFormattedReport,
  buildIssueUrl,
  buildRawReport,
  ISSUE_NEW_URL,
  ISSUE_URL_LIMIT,
  mergeRecords,
  reportFileNames,
  scrubRecord,
} from "../src/lib/report";

function record(overrides: Partial<LogRecord>): LogRecord {
  return {
    time: "2026-11-17T01:00:00.000Z",
    scope: "shell",
    level: "info",
    source: "skin",
    message: "画面を開きました",
    data: { screen: "マイコース" },
    path: "/my_course",
    ...overrides,
  };
}

describe("scrubRecord", () => {
  test("hides course and chapter titles unless the person allows them", () => {
    const hidden = scrubRecord(
      record({
        message: "一覧の教材を押して移りました",
        data: { title: "英検 2 級の試験概要", id: 6018 },
      }),
      false,
    );
    expect(hidden.data).toEqual({ title: "[伏せました]", id: 6018 });
    const shown = scrubRecord(
      record({ message: "一覧の教材を押して移りました", data: { title: "英検 2 級の試験概要" } }),
      true,
    );
    expect(shown.data).toEqual({ title: "英検 2 級の試験概要" });
  });

  test("removes e-mail addresses from text", () => {
    const scrubbed = scrubRecord(
      record({
        message: "連絡先 someone@example.com を見ました",
        data: { note: "a.b+c@mail.example.jp" },
      }),
      true,
    );
    expect(scrubbed.message).toBe("連絡先 [メールアドレス] を見ました");
    expect(scrubbed.data).toEqual({ note: "[メールアドレス]" });
  });

  test("keeps an address but drops its query, where a search term or id may sit", () => {
    const scrubbed = scrubRecord(
      record({
        path: "/courses/2036?q=英語&token=abc",
        data: { url: "https://www.nnn.ed.nico/contents/links/1?x=2" },
      }),
      true,
    );
    expect(scrubbed.path).toBe("/courses/2036?…");
    expect(scrubbed.data).toEqual({ url: "https://www.nnn.ed.nico/contents/links/1?…" });
  });

  test("leaves numbers and plain words alone", () => {
    const scrubbed = scrubRecord(record({ data: { chapterId: 20212, state: "done" } }), false);
    expect(scrubbed.data).toEqual({ chapterId: 20212, state: "done" });
  });
});

describe("mergeRecords", () => {
  test("joins the session records and the kept problems without repeats, in time order", () => {
    const a = record({ time: "2026-11-17T01:00:00.000Z", message: "a" });
    const b = record({ time: "2026-11-17T01:01:00.000Z", message: "b", level: "error" });
    const merged = mergeRecords([b, a], [b]);
    expect(merged.map((item) => item.message)).toEqual(["a", "b"]);
  });
});

describe("reportFileNames", () => {
  test("names the two files with the same stamp", () => {
    const names = reportFileNames(new Date(2026, 10, 17, 10, 43, 17));
    expect(names.formatted).toBe("better-zen-study-diagnostics-20261117-104317.md");
    expect(names.raw).toBe("better-zen-study-diagnostics-20261117-104317.json");
  });
});

describe("buildFormattedReport", () => {
  const input = {
    createdAt: new Date(2026, 10, 17, 10, 43, 17),
    extensionVersion: "0.1.0",
    userAgent: "TestBrowser",
    settings: { autoplay: { enabled: true } },
    records: [
      record({
        time: new Date(2026, 10, 17, 10, 40).toISOString(),
        message: "画面を開きました",
        data: { screen: "章 1" },
      }),
      record({
        time: new Date(2026, 10, 17, 10, 41).toISOString(),
        level: "warn",
        message: "章に教材が見つかりませんでした",
        data: { chapterId: 20212, shape: { keys: ["class_headers"] } },
      }),
    ],
    includeTitles: false,
  };

  test("has the problem section with what to do, the settings, and every record", () => {
    const text = buildFormattedReport(input);
    expect(text.startsWith("# Better ZEN Study 診断ログ")).toBe(true);
    expect(text).toContain("拡張機能の版: 0.1.0");
    expect(text).toContain("## 注意と問題");
    expect(text).toContain("章 20212 に、教材が一つも見つかりませんでした");
    expect(text).toContain("対処:");
    expect(text).toContain("## 設定");
    expect(text).toContain("## すべての記録（時刻順）");
    expect(text).toContain("教材名、コース名、章名は伏せてあります");
  });

  test("says so when there are no problems", () => {
    const text = buildFormattedReport({ ...input, records: [input.records[0]!] });
    expect(text).toContain("注意や問題の記録はありません。");
  });
});

describe("buildRawReport", () => {
  test("is valid JSON with every record and the environment", () => {
    const text = buildRawReport({
      createdAt: new Date(2026, 10, 17, 10, 43, 17),
      extensionVersion: "0.1.0",
      userAgent: "TestBrowser",
      settings: { debug: { enabled: true, viewMode: "raw" } },
      records: [record({ data: { title: "秘密の教材" } })],
      includeTitles: false,
    });
    const parsed = JSON.parse(text) as {
      recordCount: number;
      records: { data: { title: string } }[];
      titlesIncluded: boolean;
    };
    expect(parsed.recordCount).toBe(1);
    expect(parsed.titlesIncluded).toBe(false);
    expect(parsed.records[0]?.data.title).toBe("[伏せました]");
  });
});

describe("buildIssueUrl", () => {
  test("puts the title and body into the new-issue address, with the bug label", () => {
    const { url, truncated } = buildIssueUrl(
      "自動再生が止まる",
      "何が起きましたか\n動画が止まりました",
    );
    expect(url.startsWith(`${ISSUE_NEW_URL}?`)).toBe(true);
    expect(url).toContain("labels=bug");
    expect(url).toContain(encodeURIComponent("自動再生が止まる"));
    expect(url).toContain(encodeURIComponent("動画が止まりました"));
    expect(truncated).toBe(false);
  });

  test("cuts a long body at a line break so the address stays within the limit", () => {
    const body = Array.from(
      { length: 2000 },
      (_, index) => `行 ${index} の、日本語の長い文章です`,
    ).join("\n");
    const { url, truncated } = buildIssueUrl("長い報告", body);
    expect(url.length).toBeLessThanOrEqual(ISSUE_URL_LIMIT);
    expect(truncated).toBe(true);
    expect(url).toContain(encodeURIComponent("行 0 の"));
  });
});
