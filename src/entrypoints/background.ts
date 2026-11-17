import { browser, type Browser } from "wxt/browser";
import { createLogger, LOG_RING_BUFFER_SIZE, type LogRecord } from "../lib/logger";
import { isMessage, type Message } from "../lib/messages";
import {
  getSettings,
  rememberNotificationTab,
  takeNotificationTab,
  watchSettings,
} from "../lib/settings-storage";
import {
  buildChapterSummary,
  chaptersFromMonthly,
  monthSummary,
  summarizeChapters,
  type ChapterRef,
  type ChapterSummary,
  type MonthSummary,
} from "../lib/summary-service";
import {
  createTtlCache,
  fetchChapter,
  fetchMonthly,
  type ChapterSection,
  type MonthlyReport,
  ZEN_API_BASE,
} from "../lib/zen-api";
import { formatArrivalNotification, parseSubjectFromPageTitle } from "../lib/notification-text";
import { addStudy, readStudyLog } from "../lib/study-storage";
import { fillIssueForm, type FillResult, type IssueDraft } from "../lib/github-issue";
import { buildIssueUrl, ISSUE_NEW_URL } from "../lib/report";
import type { IssueDraftMessage } from "../lib/messages";

const chapterCache = createTtlCache<{ title: string; sections: ChapterSection[] }>(10 * 60 * 1000);
const monthlyCache = createTtlCache<MonthlyReport>(5 * 60 * 1000);
const monthSummaryCache = createTtlCache<MonthSummary>(5 * 60 * 1000);

// Debug records from every context end up in storage, not in memory. An MV3 service worker is
// stopped when idle and loses its variables, but storage survives that.
//
// Two places hold them. storage.session keeps every record for the browser session (up to
// LOG_RING_BUFFER_SIZE). storage.local keeps the warnings and errors across browser restarts, so
// a problem that happened yesterday is still there when it is reported. Records are written in
// batches: a burst of log lines (the player logs on every play and pause) costs one write.
const DEBUG_LOG_KEY = "debug-logs";
const PROBLEM_LOG_KEY = "debug-problems";
const PROBLEM_LOG_SIZE = 300;
const FLUSH_DELAY_MS = 250;
let debugEnabled = true;
let pending: LogRecord[] = [];
let pendingProblems: LogRecord[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let logQueue: Promise<void> = Promise.resolve();

function appendLog(record: LogRecord): void {
  pending.push(record);
  if (record.level === "warn" || record.level === "error") pendingProblems.push(record);
  if (flushTimer === undefined) flushTimer = setTimeout(flushLogs, FLUSH_DELAY_MS);
}

// Writes the records collected so far, in order, after any write already in progress.
function flushLogs(): void {
  if (flushTimer !== undefined) clearTimeout(flushTimer);
  flushTimer = undefined;
  const batch = pending;
  const problems = pendingProblems;
  pending = [];
  pendingProblems = [];
  if (batch.length === 0) return;
  logQueue = logQueue
    .then(async () => {
      const stored = await browser.storage.session.get(DEBUG_LOG_KEY);
      const current = Array.isArray(stored[DEBUG_LOG_KEY])
        ? (stored[DEBUG_LOG_KEY] as LogRecord[])
        : [];
      await browser.storage.session.set({
        [DEBUG_LOG_KEY]: [...current, ...batch].slice(-LOG_RING_BUFFER_SIZE),
      });
      if (problems.length === 0) return;
      const kept = await browser.storage.local.get(PROBLEM_LOG_KEY);
      const previous = Array.isArray(kept[PROBLEM_LOG_KEY])
        ? (kept[PROBLEM_LOG_KEY] as LogRecord[])
        : [];
      await browser.storage.local.set({
        [PROBLEM_LOG_KEY]: [...previous, ...problems].slice(-PROBLEM_LOG_SIZE),
      });
    })
    .catch(() => undefined);
}

// Everything the diagnostics screen shows: the session records and the kept problems.
async function readLogs(): Promise<{ records: LogRecord[]; problems: LogRecord[] }> {
  flushLogs();
  await logQueue;
  const session = await browser.storage.session.get(DEBUG_LOG_KEY);
  const local = await browser.storage.local.get(PROBLEM_LOG_KEY);
  return {
    records: Array.isArray(session[DEBUG_LOG_KEY]) ? (session[DEBUG_LOG_KEY] as LogRecord[]) : [],
    problems: Array.isArray(local[PROBLEM_LOG_KEY]) ? (local[PROBLEM_LOG_KEY] as LogRecord[]) : [],
  };
}

async function clearLogs(): Promise<void> {
  pending = [];
  pendingProblems = [];
  if (flushTimer !== undefined) clearTimeout(flushTimer);
  flushTimer = undefined;
  logQueue = logQueue
    .then(async () => {
      await browser.storage.session.remove(DEBUG_LOG_KEY);
      await browser.storage.local.remove(PROBLEM_LOG_KEY);
    })
    .catch(() => undefined);
  await logQueue;
}

const log = createLogger({
  scope: "bg",
  source: "bg",
  sink: (record) => {
    if (debugEnabled) appendLog(record);
  },
});

type ChapterResponse =
  | { ok: true; title: string; sections: ChapterSection[] }
  | { ok: false; error: string };
type MonthlyResponse = { ok: true; report: MonthlyReport } | { ok: false; error: string };
type ChapterSummaryResponse = { ok: true; summary: ChapterSummary } | { ok: false; error: string };
type MonthSummaryResponse = { ok: true; summary: MonthSummary } | { ok: false; error: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

async function handleFetchChapter(
  courseId: number,
  chapterId: number,
  fresh: boolean | undefined,
): Promise<ChapterResponse> {
  const key = `${courseId}:${chapterId}`;
  const cached = fresh ? undefined : chapterCache.get(key);
  if (cached) {
    log.debug("chapter cache hit", { courseId, chapterId, count: cached.sections.length });
    return { ok: true, ...cached };
  }

  const started = performance.now();
  try {
    const chapter = await fetchChapter(courseId, chapterId);
    chapterCache.set(key, chapter);
    log.info("chapter fetched", {
      courseId,
      chapterId,
      fresh: fresh === true,
      count: chapter.sections.length,
      ms: Math.round(performance.now() - started),
    });
    return { ok: true, ...chapter };
  } catch (error) {
    log.error("chapter fetch failed", {
      courseId,
      chapterId,
      error: errorMessage(error),
      ms: Math.round(performance.now() - started),
    });
    return { ok: false, error: errorMessage(error) };
  }
}

// Generic read for the redrawn screens. The path is checked by isAllowedApiPath before this
// runs. Only the status and the path reach the log; the response body is never logged.
async function handleApiGet(
  path: string,
): Promise<{ ok: true; body: unknown } | { ok: false; status?: number; error: string }> {
  const started = performance.now();
  try {
    const response = await fetch(`${ZEN_API_BASE}${path}`, { credentials: "include" });
    if (!response.ok) {
      log.warn("api get failed", { path, status: response.status });
      return { ok: false, status: response.status, error: `HTTP ${response.status}` };
    }
    const body = (await response.json()) as unknown;
    log.debug("api get", { path, ms: Math.round(performance.now() - started) });
    return { ok: true, body };
  } catch (error) {
    log.error("api get threw", { path, error: errorMessage(error) });
    return { ok: false, error: errorMessage(error) };
  }
}

async function handleFetchMonthly(year: number, month: number): Promise<MonthlyResponse> {
  const key = `${year}:${month}`;
  const cached = monthlyCache.get(key);
  if (cached) {
    log.debug("monthly cache hit", { year, month });
    return { ok: true, report: cached };
  }

  const started = performance.now();
  try {
    const report = await fetchMonthly(year, month);
    monthlyCache.set(key, report);
    log.info("monthly fetched", {
      year,
      month,
      chapters: report.deadline_groups.reduce((total, group) => total + group.chapters.length, 0),
      ms: Math.round(performance.now() - started),
    });
    return { ok: true, report };
  } catch (error) {
    log.error("monthly fetch failed", {
      year,
      month,
      error: errorMessage(error),
      ms: Math.round(performance.now() - started),
    });
    return { ok: false, error: errorMessage(error) };
  }
}

async function handleChapterSummary(
  courseId: number,
  chapterId: number,
): Promise<ChapterSummaryResponse> {
  const started = performance.now();
  try {
    const settings = await getSettings();
    const response = await handleFetchChapter(courseId, chapterId, undefined);
    if (!response.ok) throw new Error(response.error);

    const chapterRef: ChapterRef = {
      courseId,
      chapterId,
      subjectTitle: "",
      courseTitle: "",
      chapterTitle: "",
    };
    const summary = buildChapterSummary(
      chapterRef,
      response.sections,
      settings.display.includeSupplement,
    );
    log.info("chapter summary built", {
      courseId,
      chapterId,
      movieCount: summary.movieCount,
      movieSeconds: summary.movieSeconds,
      supplementMovieCount: summary.supplementMovieCount,
      supplementSeconds: summary.supplementSeconds,
      testCount: summary.testCount,
      reportCount: summary.reportCount,
      ms: Math.round(performance.now() - started),
    });
    return { ok: true, summary };
  } catch (error) {
    log.error("chapter summary failed", {
      courseId,
      chapterId,
      error: errorMessage(error),
      ms: Math.round(performance.now() - started),
    });
    return { ok: false, error: errorMessage(error) };
  }
}

async function handleMonthSummary(
  year: number,
  month: number,
  includeSupplement: boolean | undefined,
): Promise<MonthSummaryResponse> {
  const started = performance.now();
  try {
    const resolvedIncludeSupplement =
      includeSupplement ?? (await getSettings()).display.includeSupplement;
    const key = `${year}:${month}:${resolvedIncludeSupplement}`;
    const cached = monthSummaryCache.get(key);
    if (cached) {
      log.debug("month summary cache hit", {
        year,
        month,
        includeSupplement: resolvedIncludeSupplement,
      });
      return { ok: true, summary: cached };
    }

    const monthlyResponse = await handleFetchMonthly(year, month);
    if (!monthlyResponse.ok) throw new Error(monthlyResponse.error);

    const chapters = await summarizeChapters(
      chaptersFromMonthly(monthlyResponse.report),
      async (courseId, chapterId) => {
        const response = await handleFetchChapter(courseId, chapterId, undefined);
        if (!response.ok) throw new Error(response.error);
        return response.sections;
      },
      { includeSupplement: resolvedIncludeSupplement },
    );
    for (const chapter of chapters) {
      if (chapter.error !== undefined) {
        log.warn("month chapter summary failed", {
          courseId: chapter.courseId,
          chapterId: chapter.chapterId,
        });
      }
    }

    const summary = monthSummary(monthlyResponse.report, chapters);
    monthSummaryCache.set(key, summary);
    log.info("month summary built", {
      year,
      month,
      chapters: summary.chapters.length,
      failures: summary.totals.chapterFailures,
      ms: Math.round(performance.now() - started),
    });
    return { ok: true, summary };
  } catch (error) {
    log.error("month summary failed", {
      year,
      month,
      error: errorMessage(error),
      ms: Math.round(performance.now() - started),
    });
    return { ok: false, error: errorMessage(error) };
  }
}

async function handleTestArrival(
  message: Extract<Message, { type: "test-arrival" }>,
  sender: Browser.runtime.MessageSender,
): Promise<{ ok: true; notificationId?: string } | { ok: false; error: string }> {
  log.info("test arrival received", {
    kind: message.kind,
    resourceType: message.resourceType,
    courseId: message.courseId,
    chapterId: message.chapterId,
    resourceId: message.resourceId,
  });

  try {
    const settings = await getSettings();
    if (!settings.notify.enabled) {
      log.info("test arrival settings skipped", { reason: "notifications are disabled" });
      return { ok: true };
    }
    if (message.kind === "test" && !settings.notify.tests) {
      log.info("test arrival settings skipped", { reason: "test notifications are disabled" });
      return { ok: true };
    }
    if (message.kind === "report" && !settings.notify.reports) {
      log.info("test arrival settings skipped", { reason: "report notifications are disabled" });
      return { ok: true };
    }
    if (message.kind === "exercise" && !settings.notify.exercises) {
      log.info("test arrival settings skipped", {
        reason: "practice problem notifications are disabled",
      });
      return { ok: true };
    }

    const tabId = sender.tab?.id ?? message.tabId;
    if (tabId === undefined) {
      log.warn("test arrival skipped", { reason: "sender tab is unavailable" });
      return { ok: false, error: "Sender tab is unavailable" };
    }

    let chapterTitle: string | undefined;
    let resourceTitle: string | undefined;
    try {
      const response = await handleFetchChapter(message.courseId, message.chapterId, undefined);
      if (!response.ok) {
        log.warn("test arrival lookup failed", {
          courseId: message.courseId,
          chapterId: message.chapterId,
          resourceId: message.resourceId,
          error: response.error,
        });
      } else {
        chapterTitle = response.title;
        const section = response.sections.find((item) => item.id === message.resourceId);
        if (section) {
          resourceTitle = section.title;
          log.info("test arrival lookup found", {
            courseId: message.courseId,
            chapterId: message.chapterId,
            resourceId: message.resourceId,
          });
        } else {
          log.warn("test arrival lookup not found", {
            courseId: message.courseId,
            chapterId: message.chapterId,
            resourceId: message.resourceId,
          });
        }
      }
    } catch (error) {
      log.warn("test arrival lookup failed", {
        courseId: message.courseId,
        chapterId: message.chapterId,
        resourceId: message.resourceId,
        error: errorMessage(error),
      });
    }

    const formatted = formatArrivalNotification({
      kind: message.kind,
      resourceType: message.resourceType,
      subjectTitle: parseSubjectFromPageTitle(message.pageTitle),
      chapterTitle,
      resourceTitle,
    });
    const notificationId = await browser.notifications.create({
      type: "basic",
      iconUrl: browser.runtime.getURL("/icon/128.png"),
      title: formatted.title,
      message: formatted.message,
      silent: settings.notify.silent,
    });

    await rememberNotificationTab(notificationId, {
      tabId,
      windowId: sender.tab?.windowId,
    });
    log.info("notification created", {
      kind: message.kind,
      resourceType: message.resourceType,
      notificationId,
      tabId,
    });
    return { ok: true, notificationId };
  } catch (error) {
    log.error("test arrival notification failed", { error: errorMessage(error) });
    return { ok: false, error: errorMessage(error) };
  }
}

async function handleTestNotification(): Promise<
  | { ok: true; notificationId: string; permissionLevel: string }
  | { ok: false; error: string; permissionLevel?: string }
> {
  let permissionLevel: string | undefined;
  try {
    permissionLevel = await browser.notifications.getPermissionLevel();
    const settings = await getSettings();
    const notificationId = await browser.notifications.create({
      type: "basic",
      iconUrl: browser.runtime.getURL("/icon/128.png"),
      title: "テスト通知",
      message: "通知の設定と権限の確認です",
      silent: settings.notify.silent,
    });
    log.info("test notification created", { permissionLevel, notificationId });
    return { ok: true, notificationId, permissionLevel };
  } catch (error) {
    const message = errorMessage(error);
    log.error("test notification failed", { permissionLevel, error: message });
    return {
      ok: false,
      error: message,
      ...(permissionLevel === undefined ? {} : { permissionLevel }),
    };
  }
}

// The GitHub access the report needs. It is optional and must be granted from the settings page.
const GITHUB_ORIGIN = "https://github.com/*";
// Where GitHub sends a person who is not signed in, instead of the issue form.
const GITHUB_LOGIN_URL = "https://github.com/login";
const ISSUE_TAB_WAIT_MS = 20_000;
const ISSUE_FORM_ATTEMPTS = 8;
const ISSUE_FORM_RETRY_MS = 1000;

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === "complete") finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    browser.tabs.onUpdated.addListener(listener);
  });
}

// Opens the new-issue page and fills it in with the draft. The page is checked before anything is
// typed into it: only the project's own new-issue page is filled, never a login or another page.
// When the form cannot be filled, the caller falls back to the standard mode (the prefilled address
// plus the files saved to disk).
// `opened` says whether this call has already opened the issue tab. When it has, the settings page
// must not open a second one: it only saves the files and tells the person what to do.
type IssueOutcome = { mode: "filled" | "standard"; reason?: string; opened: boolean };

async function handleOpenIssue(draft: IssueDraftMessage): Promise<IssueOutcome> {
  if (!(await browser.permissions.contains({ origins: [GITHUB_ORIGIN] }))) {
    return { mode: "standard", reason: "permission", opened: false };
  }
  const { url } = buildIssueUrl(draft.title, draft.body);
  const tab = await browser.tabs.create({ url });
  if (tab.id === undefined) return { mode: "standard", reason: "no-tab", opened: false };
  await waitForTabComplete(tab.id, ISSUE_TAB_WAIT_MS);

  // From here the tab is open, whatever the outcome below.
  const current = await browser.tabs.get(tab.id);
  const address = current.url ?? "";
  if (address.startsWith(GITHUB_LOGIN_URL)) {
    return { mode: "standard", reason: "login", opened: true };
  }
  if (!address.startsWith(ISSUE_NEW_URL)) {
    return { mode: "standard", reason: "not-issue-page", opened: true };
  }

  const payload: IssueDraft = {
    title: draft.title,
    body: draft.body,
    attachments: draft.attachments,
  };
  // The form is drawn by the page's own scripts, so it can arrive a moment after the load.
  for (let attempt = 0; attempt < ISSUE_FORM_ATTEMPTS; attempt += 1) {
    const [injected] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillIssueForm,
      args: [payload],
    });
    const result = injected?.result as FillResult | undefined;
    if (result?.filled) return { mode: "filled", opened: true };
    await new Promise((resolve) => setTimeout(resolve, ISSUE_FORM_RETRY_MS));
  }
  return { mode: "standard", reason: "form-not-found", opened: true };
}

export default defineBackground(() => {
  log.info("background started", { version: browser.runtime.getManifest().version });

  void getSettings().then((settings) => {
    debugEnabled = settings.debug.enabled;
  });
  watchSettings((settings) => {
    debugEnabled = settings.debug.enabled;
  });

  browser.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
    if (!isMessage(rawMessage)) return false;

    if (rawMessage.type === "debug-log") {
      if (debugEnabled) appendLog(rawMessage.record);
      return false;
    }

    if (rawMessage.type === "get-debug-logs") {
      void readLogs().then(({ records, problems }) =>
        sendResponse({ ok: true, enabled: debugEnabled, records, problems }),
      );
      return true;
    }

    if (rawMessage.type === "clear-debug-logs") {
      void clearLogs().then(() => sendResponse({ ok: true }));
      return true;
    }

    log.debug("message received", { type: rawMessage.type });

    if (rawMessage.type === "study-add") {
      void addStudy(rawMessage.seconds)
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) => sendResponse({ ok: false, error: errorMessage(error) }));
      return true;
    }

    if (rawMessage.type === "get-study-log") {
      void readStudyLog()
        .then((log) => sendResponse({ ok: true, log }))
        .catch((error: unknown) => sendResponse({ ok: false, error: errorMessage(error) }));
      return true;
    }

    // Content scripts cannot open extension tabs themselves, so the shell asks for the settings
    // page here. The section name was checked by isMessage, so only the page's own anchors reach it.
    if (rawMessage.type === "open-options") {
      void browser.tabs.create({
        url: browser.runtime.getURL(`/options.html#${rawMessage.tab}`),
      });
      sendResponse({ ok: true });
      return false;
    }

    if (rawMessage.type === "open-issue") {
      void handleOpenIssue(rawMessage.draft)
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error: unknown) => sendResponse({ ok: false, error: errorMessage(error) }));
      return true;
    }

    if (rawMessage.type === "api-get") {
      void handleApiGet(rawMessage.path).then(sendResponse);
      return true;
    }

    if (rawMessage.type === "fetch-chapter") {
      void handleFetchChapter(rawMessage.courseId, rawMessage.chapterId, rawMessage.fresh).then(
        sendResponse,
      );
      return true;
    }

    if (rawMessage.type === "fetch-monthly") {
      void handleFetchMonthly(rawMessage.year, rawMessage.month).then(sendResponse);
      return true;
    }

    if (rawMessage.type === "chapter-summary") {
      void handleChapterSummary(rawMessage.courseId, rawMessage.chapterId).then(sendResponse);
      return true;
    }

    if (rawMessage.type === "month-summary") {
      void handleMonthSummary(rawMessage.year, rawMessage.month, rawMessage.includeSupplement).then(
        sendResponse,
      );
      return true;
    }

    if (rawMessage.type === "test-arrival") {
      void handleTestArrival(rawMessage, sender).then(sendResponse);
      return true;
    }

    if (rawMessage.type === "test-notification") {
      void handleTestNotification().then(sendResponse);
      return true;
    }

    return false;
  });

  browser.notifications.onClicked.addListener((notificationId) => {
    void (async () => {
      try {
        const target = await takeNotificationTab(notificationId);
        const settings = await getSettings();
        log.info("notification clicked", {
          notificationId,
          hasTarget: target !== undefined,
          clickToTab: settings.notify.clickToTab,
        });
        if (settings.notify.clickToTab && target) {
          await browser.tabs.update(target.tabId, { active: true });
          if (target.windowId !== undefined) {
            await browser.windows.update(target.windowId, { focused: true });
          }
        }
      } catch (error) {
        log.error("notification click handling failed", { error: errorMessage(error) });
      } finally {
        await browser.notifications.clear(notificationId);
      }
    })().catch(() => undefined);
  });
});
