// Builds the files a diagnostic export and an issue report carry. Pure functions only.
//
// Two files are made from the same records: a formatted reading (Markdown) and the raw records
// (JSON). Both pass through scrubbing first: course and chapter titles are hidden unless the person
// allows them, e-mail addresses are removed, and the query part of an address is dropped.

import { groupRecords, summarize, SEVERITY_LABELS, areaLabel, type Described } from "./diagnostics";
import type { LogRecord } from "./logger";

// Keys whose values are human titles of courses, chapters, and materials.
const TITLE_KEYS: ReadonlySet<string> = new Set([
  "title",
  "pageTitle",
  "chapterTitle",
  "courseTitle",
  "materialTitle",
  "subjectTitle",
  "name",
]);

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const HIDDEN_TITLE = "[伏せました]";
const HIDDEN_EMAIL = "[メールアドレス]";

// An address is kept, without its query: the query is where a search term or an id may sit.
function stripQuery(value: string): string {
  if (!value.startsWith("/") && !/^https?:\/\//.test(value)) return value;
  const cut = value.indexOf("?");
  return cut < 0 ? value : `${value.slice(0, cut)}?…`;
}

function scrubString(value: string): string {
  return stripQuery(value.replace(EMAIL, HIDDEN_EMAIL));
}

function scrubValue(
  value: unknown,
  includeTitles: boolean,
  key: string | undefined,
  depth: number,
): unknown {
  if (typeof value === "string") {
    if (key !== undefined && TITLE_KEYS.has(key) && !includeTitles) return HIDDEN_TITLE;
    return scrubString(value);
  }
  if (depth > 6) return "[深すぎるため省略]";
  if (Array.isArray(value))
    return value.map((item) => scrubValue(item, includeTitles, key, depth + 1));
  if (typeof value === "object" && value !== null) {
    const output: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      output[childKey] = scrubValue(child, includeTitles, childKey, depth + 1);
    }
    return output;
  }
  return value;
}

// A copy of a record that is safe to put in a file or an issue.
export function scrubRecord(record: LogRecord, includeTitles: boolean): LogRecord {
  return {
    ...record,
    message: scrubString(record.message),
    path: record.path === undefined ? undefined : stripQuery(record.path),
    data:
      record.data === undefined ? undefined : scrubValue(record.data, includeTitles, undefined, 0),
  };
}

// The session records and the warnings kept across restarts, in time order, without repeats. The
// session holds every record, so the kept problems mostly repeat it; they matter after a restart.
export function mergeRecords(
  records: readonly LogRecord[],
  problems: readonly LogRecord[],
): LogRecord[] {
  const seen = new Set<string>();
  const merged: LogRecord[] = [];
  for (const record of [...records, ...problems]) {
    const key = `${record.time}|${record.scope}|${record.message}|${JSON.stringify(record.data ?? null)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(record);
  }
  return merged.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

export type ReportInput = {
  createdAt: Date;
  extensionVersion: string;
  userAgent: string;
  settings: unknown;
  records: readonly LogRecord[];
  includeTitles: boolean;
};

// The local time as the person reads it in the file name and the header.
function localStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function reportFileNames(createdAt: Date): { formatted: string; raw: string } {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${createdAt.getFullYear()}${pad(createdAt.getMonth() + 1)}${pad(createdAt.getDate())}-${pad(createdAt.getHours())}${pad(createdAt.getMinutes())}${pad(createdAt.getSeconds())}`;
  const base = `better-zen-study-diagnostics-${stamp}`;
  return { formatted: `${base}.md`, raw: `${base}.json` };
}

function formatEntry(entry: Described): string[] {
  const repeat = entry.repeat > 1 ? `（×${entry.repeat}）` : "";
  const lines = [
    `- ${localStamp(new Date(entry.time))} [${SEVERITY_LABELS[entry.severity]}] ${areaLabel(entry.area)}: ${entry.headline}${repeat}`,
  ];
  for (const detail of entry.detail) lines.push(`  - ${detail}`);
  if (entry.hint) lines.push(`  - 対処: ${entry.hint}`);
  return lines;
}

// One Markdown file: the state at a glance, the problems with what to do about them, the settings,
// and then every record in order as a reading.
export function buildFormattedReport(input: ReportInput): string {
  const scrubbed = input.records.map((record) => scrubRecord(record, input.includeTitles));
  const entries = groupRecords(scrubbed);
  const summary = summarize(entries, input.createdAt);
  const problems = entries.filter(
    (entry) => entry.severity === "problem" || entry.severity === "warn",
  );

  const lines: string[] = [
    "# Better ZEN Study 診断ログ",
    "",
    `- 作成: ${localStamp(input.createdAt)}`,
    `- 拡張機能の版: ${input.extensionVersion}`,
    `- ブラウザ: ${input.userAgent}`,
    `- 状態: ${SEVERITY_LABELS[summary.status === "ok" ? "ok" : summary.status === "warn" ? "warn" : "problem"]}（直近 1 時間の問題 ${summary.problemsLastHour} 件）`,
  ];
  if (summary.lastScreen) lines.push(`- 最後に開いた画面: ${summary.lastScreen}`);
  if (summary.lastAutoplay) lines.push(`- 最後の自動再生の記録: ${summary.lastAutoplay}`);
  if (!input.includeTitles) lines.push("", "※ 教材名、コース名、章名は伏せてあります。");

  lines.push("", "## 注意と問題", "");
  if (problems.length === 0) lines.push("注意や問題の記録はありません。");
  for (const entry of problems) lines.push(...formatEntry(entry));

  lines.push(
    "",
    "## 設定",
    "",
    "```json",
    JSON.stringify(scrubValue(input.settings, input.includeTitles, undefined, 0), null, 2),
    "```",
  );
  lines.push("", "## すべての記録（時刻順）", "");
  if (entries.length === 0) lines.push("記録はありません。");
  for (const entry of entries) lines.push(...formatEntry(entry));

  return `${lines.join("\n")}\n`;
}

// One JSON file: the environment, the settings, and every record as it was written, scrubbed.
export function buildRawReport(input: ReportInput): string {
  const records = input.records.map((record) => scrubRecord(record, input.includeTitles));
  return `${JSON.stringify(
    {
      createdAt: input.createdAt.toISOString(),
      extension: { version: input.extensionVersion, userAgent: input.userAgent },
      titlesIncluded: input.includeTitles,
      settings: scrubValue(input.settings, input.includeTitles, undefined, 0),
      recordCount: records.length,
      records,
    },
    null,
    2,
  )}\n`;
}

// The address of the new-issue page of the project, and the labels a report starts with.
export const ISSUE_NEW_URL = "https://github.com/tukuyomil032/Better-ZEN-Study/issues/new";
export const ISSUE_LABEL = "bug";

// Browsers and sites accept about 8000 characters in an address. The body is cut at a line break
// until the whole address fits, so the title and the start of the body are always there.
export const ISSUE_URL_LIMIT = 7000;

export function buildIssueUrl(title: string, body: string): { url: string; truncated: boolean } {
  const build = (text: string) =>
    `${ISSUE_NEW_URL}?labels=${encodeURIComponent(ISSUE_LABEL)}&title=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`;
  let text = body;
  let url = build(text);
  let truncated = false;
  while (url.length > ISSUE_URL_LIMIT && text.length > 0) {
    const cut = text.lastIndexOf("\n", text.length - 2);
    text = cut > 0 ? text.slice(0, cut) : text.slice(0, Math.floor(text.length / 2));
    truncated = true;
    url = build(text);
  }
  return { url, truncated };
}
