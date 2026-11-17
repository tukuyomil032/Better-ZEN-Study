import type { LogRecord } from "./logger";

// The sections of the settings page a message may open. Anything else is refused.
export const OPTIONS_TABS = [
  "autoplay",
  "speed",
  "notify",
  "display",
  "plan",
  "appearance",
  "diagnostics",
  "report",
] as const;
export type OptionsTab = (typeof OPTIONS_TABS)[number];

// "exercise": autoplay paused at a practice problem of an advanced chapter.
export type TestArrivalKind = "test" | "report" | "exercise";
export type TestArrivalResourceType =
  | "evaluation_test"
  | "essay_test"
  | "evaluation_report"
  | "essay_report"
  | "exercise";

export type Message =
  | { type: "fetch-chapter"; courseId: number; chapterId: number; fresh?: boolean }
  | { type: "fetch-monthly"; year: number; month: number }
  | { type: "chapter-summary"; courseId: number; chapterId: number }
  | { type: "month-summary"; year: number; month: number; includeSupplement?: boolean }
  | {
      type: "test-arrival";
      kind: TestArrivalKind;
      resourceType: TestArrivalResourceType;
      courseId: number;
      chapterId: number;
      resourceId: number;
      pageTitle: string;
      tabId?: number;
    }
  | { type: "test-notification" }
  | { type: "autoplay-status"; state: "idle" | "playing" | "stopped-at-test" | "finished" }
  | { type: "settings-changed" }
  | { type: "debug-log"; record: LogRecord }
  | { type: "get-debug-logs" }
  | { type: "clear-debug-logs" }
  | { type: "api-get"; path: string }
  | { type: "study-add"; seconds: number }
  | { type: "get-study-log" }
  | { type: "open-options"; tab: OptionsTab }
  | { type: "open-issue"; draft: IssueDraftMessage };

// A report draft as the settings page sends it: the text, and up to two files to attach.
export type IssueDraftMessage = {
  title: string;
  body: string;
  attachments: { name: string; content: string; type: string }[];
};
const ISSUE_TITLE_MAX = 200;
const ISSUE_BODY_MAX = 200_000;
const ISSUE_ATTACHMENTS_MAX = 2;
const ISSUE_ATTACHMENT_CONTENT_MAX = 2_000_000;

function isIssueDraft(value: unknown): value is IssueDraftMessage {
  if (!isRecord(value)) return false;
  if (typeof value.title !== "string" || value.title.trim().length === 0) return false;
  if (value.title.length > ISSUE_TITLE_MAX) return false;
  if (typeof value.body !== "string" || value.body.length > ISSUE_BODY_MAX) return false;
  if (!Array.isArray(value.attachments) || value.attachments.length > ISSUE_ATTACHMENTS_MAX)
    return false;
  return value.attachments.every(
    (item) =>
      isRecord(item) &&
      typeof item.name === "string" &&
      item.name.length > 0 &&
      item.name.length <= 120 &&
      typeof item.content === "string" &&
      item.content.length <= ISSUE_ATTACHMENT_CONTENT_MAX &&
      typeof item.type === "string" &&
      item.type.length <= 100,
  );
}

// Read-only ZEN Study API paths the redrawn screens may ask for. Only GET requests to the
// /v1, /v2 and /v3 API, with plain path characters and a query string. Anything else is
// refused before it reaches the network.
const API_PATH = /^\/v[123]\/[A-Za-z0-9_/.-]+(\?[A-Za-z0-9_=&.-]*)?$/;
const API_PATH_MAX = 300;

export function isAllowedApiPath(path: string): boolean {
  return path.length <= API_PATH_MAX && !path.includes("..") && API_PATH.test(path);
}

type MessageRecord = Record<string, unknown>;

const LOG_LEVELS: readonly string[] = ["debug", "info", "warn", "error"];
const LOG_SOURCES: readonly string[] = ["bg", "top", "player", "popup", "options", "skin"];

function isRecord(value: unknown): value is MessageRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLogRecord(value: unknown): value is LogRecord {
  return (
    isRecord(value) &&
    typeof value.time === "string" &&
    typeof value.scope === "string" &&
    typeof value.message === "string" &&
    typeof value.level === "string" &&
    LOG_LEVELS.includes(value.level) &&
    typeof value.source === "string" &&
    LOG_SOURCES.includes(value.source) &&
    (value.path === undefined || typeof value.path === "string")
  );
}

export function isMessage(value: unknown): value is Message {
  if (!isRecord(value)) return false;

  if (value.type === "fetch-chapter") {
    return (
      typeof value.courseId === "number" &&
      Number.isSafeInteger(value.courseId) &&
      typeof value.chapterId === "number" &&
      Number.isSafeInteger(value.chapterId) &&
      (value.fresh === undefined || typeof value.fresh === "boolean")
    );
  }

  if (value.type === "fetch-monthly") {
    return (
      typeof value.year === "number" &&
      Number.isSafeInteger(value.year) &&
      typeof value.month === "number" &&
      Number.isInteger(value.month) &&
      value.month >= 1 &&
      value.month <= 12
    );
  }

  if (value.type === "chapter-summary") {
    return (
      typeof value.courseId === "number" &&
      Number.isSafeInteger(value.courseId) &&
      typeof value.chapterId === "number" &&
      Number.isSafeInteger(value.chapterId)
    );
  }

  if (value.type === "month-summary") {
    return (
      typeof value.year === "number" &&
      Number.isSafeInteger(value.year) &&
      typeof value.month === "number" &&
      Number.isSafeInteger(value.month) &&
      value.month >= 1 &&
      value.month <= 12 &&
      (value.includeSupplement === undefined || typeof value.includeSupplement === "boolean")
    );
  }

  if (value.type === "test-arrival") {
    const expectedKind =
      value.resourceType === "evaluation_test" || value.resourceType === "essay_test"
        ? "test"
        : value.resourceType === "evaluation_report" || value.resourceType === "essay_report"
          ? "report"
          : value.resourceType === "exercise"
            ? "exercise"
            : undefined;

    return (
      expectedKind !== undefined &&
      value.kind === expectedKind &&
      typeof value.courseId === "number" &&
      Number.isSafeInteger(value.courseId) &&
      typeof value.chapterId === "number" &&
      Number.isSafeInteger(value.chapterId) &&
      typeof value.resourceId === "number" &&
      Number.isSafeInteger(value.resourceId) &&
      typeof value.pageTitle === "string" &&
      (value.tabId === undefined ||
        (typeof value.tabId === "number" && Number.isFinite(value.tabId)))
    );
  }

  if (value.type === "test-notification") return true;

  if (value.type === "autoplay-status") {
    return (
      value.state === "idle" ||
      value.state === "playing" ||
      value.state === "stopped-at-test" ||
      value.state === "finished"
    );
  }

  if (value.type === "debug-log") return isLogRecord(value.record);
  if (value.type === "get-debug-logs" || value.type === "clear-debug-logs") return true;
  if (value.type === "study-add") {
    return (
      typeof value.seconds === "number" &&
      Number.isFinite(value.seconds) &&
      value.seconds >= 0 &&
      value.seconds <= 600
    );
  }
  if (value.type === "get-study-log") return true;
  if (value.type === "open-options") {
    return typeof value.tab === "string" && (OPTIONS_TABS as readonly string[]).includes(value.tab);
  }
  if (value.type === "open-issue") return isIssueDraft(value.draft);
  if (value.type === "api-get") {
    return typeof value.path === "string" && isAllowedApiPath(value.path);
  }

  return value.type === "settings-changed";
}
