import { createElement } from "react";
import { browser } from "wxt/browser";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import type { Logger } from "../../lib/logger";
import { classifyPath } from "../../lib/routes";
import type { Settings } from "../../lib/settings";
import { getSettings, watchSettings } from "../../lib/settings-storage";
import { chapterKey } from "../../lib/summary-format";
import type { ChapterSummary, MonthSummary } from "../../lib/summary-service";
import { createSlotManager } from "./ui/slots";
import { ChapterTotalView, MonthTotalView, SubjectTotalView } from "./ui/views";

type ChapterSummaryResponse = { ok: true; summary: ChapterSummary } | { ok: false; error: string };
type MonthSummaryResponse = { ok: true; summary: MonthSummary } | { ok: false; error: string };

const REFRESH_DEBOUNCE_MS = 400;

// Finds the "教材" label in the chapter header. Its row holds the chapter total.
function findChapterHeaderAnchor(): Element | null {
  const labels = [...document.querySelectorAll("body *")].filter(
    (element) => element.children.length === 0 && element.textContent?.trim() === "教材",
  );
  return labels.find((element) => element.closest("main")) ?? labels[0] ?? null;
}

// The month card (for example "12月のレポート" with 進捗度). We pick the innermost
// element that starts with the title, so the block lands directly under the card.
function findMonthCardAnchor(month: number): Element | null {
  const title = `${month}月のレポート`;
  const candidates = [...document.querySelectorAll("div, section, article")].filter((element) => {
    const text = element.textContent ?? "";
    return (
      text.startsWith(title) &&
      text.includes("進捗度") &&
      element.getBoundingClientRect().height > 100
    );
  });
  return (
    candidates.find(
      (candidate) => !candidates.some((other) => other !== candidate && candidate.contains(other)),
    ) ?? null
  );
}

// The row link is a flex row whose only child is the text column (subject, chapter title,
// progress). The note goes inside that column, so the row keeps its width.
function findSubjectRows(): { box: Element; courseId: number; chapterId: number }[] {
  return [...document.querySelectorAll<HTMLAnchorElement>('li > a[href^="/courses/"]')].flatMap(
    (anchor) => {
      const match = /^\/courses\/(\d+)\/chapters\/(\d+)/.exec(anchor.getAttribute("href") ?? "");
      if (!match) return [];
      const box = anchor.firstElementChild ?? anchor;
      return [{ box, courseId: Number(match[1]), chapterId: Number(match[2]) }];
    },
  );
}

export function startSummaryUi(ctx: ContentScriptContext, log: Logger): void {
  const slots = createSlotManager(ctx);
  let settings: Settings | undefined;
  let cachedKey: string | undefined;
  let cachedChapter: ChapterSummary | undefined;
  let cachedMonth: MonthSummary | undefined;
  let running = false;
  let queued = false;

  const loadChapter = async (
    courseId: number,
    chapterId: number,
  ): Promise<ChapterSummary | undefined> => {
    const response = (await browser.runtime.sendMessage({
      type: "chapter-summary",
      courseId,
      chapterId,
    })) as ChapterSummaryResponse | undefined;
    if (!response?.ok) {
      log.warn("chapter summary unavailable", {
        courseId,
        chapterId,
        error: response?.ok === false ? response.error : "no response",
      });
      return undefined;
    }
    return response.summary;
  };

  const loadMonth = async (
    year: number,
    month: number,
    includeSupplement: boolean,
  ): Promise<MonthSummary | undefined> => {
    const response = (await browser.runtime.sendMessage({
      type: "month-summary",
      year,
      month,
      includeSupplement,
    })) as MonthSummaryResponse | undefined;
    if (!response?.ok) {
      log.warn("month summary unavailable", {
        year,
        month,
        error: response?.ok === false ? response.error : "no response",
      });
      return undefined;
    }
    return response.summary;
  };

  const renderChapterTotal = async (
    courseId: number,
    chapterId: number,
    style: Settings["display"]["timeStyle"],
  ) => {
    if (!settings?.display.chapterTotal) return;
    const anchor = findChapterHeaderAnchor();
    if (!anchor) {
      log.debug("chapter header anchor not found yet", { courseId, chapterId });
      return;
    }
    const key = `${courseId}:${chapterId}`;
    if (cachedKey !== `chapter:${key}`) {
      cachedChapter = await loadChapter(courseId, chapterId);
      cachedKey = `chapter:${key}`;
    }
    if (!cachedChapter) return;
    const result = await slots.render(
      "chapter-total",
      anchor,
      createElement(ChapterTotalView, { summary: cachedChapter, style }),
      "after",
    );
    if (result === "mounted") {
      log.info("chapter total shown", { courseId, chapterId, movies: cachedChapter.movieCount });
    }
  };

  const renderMonth = async (year: number, month: number) => {
    if (!settings) return;
    const style = settings.display.timeStyle;
    const key = `month:${year}:${month}:${settings.display.includeSupplement}`;
    if (cachedKey !== key) {
      cachedMonth = await loadMonth(year, month, settings.display.includeSupplement);
      cachedKey = key;
    }
    if (!cachedMonth) return;

    if (settings.display.monthSummary) {
      const anchor = findMonthCardAnchor(month);
      if (anchor) {
        const result = await slots.render(
          "month-total",
          anchor,
          createElement(MonthTotalView, { summary: cachedMonth, style }),
          "after",
        );
        if (result === "mounted") {
          log.info("month total shown", { year, month, chapters: cachedMonth.chapters.length });
        }
      } else {
        log.debug("month card anchor not found yet", { year, month });
      }
    }

    if (settings.display.subjectSummary) {
      const byKey = new Map(
        cachedMonth.chapters.map((chapter) => [
          chapterKey(chapter.courseId, chapter.chapterId),
          chapter,
        ]),
      );
      let shown = 0;
      for (const row of findSubjectRows()) {
        const summary = byKey.get(chapterKey(row.courseId, row.chapterId));
        if (!summary) continue;
        await slots.render(
          `subject-${row.courseId}-${row.chapterId}`,
          row.box,
          createElement(SubjectTotalView, { summary, style }),
          "last",
        );
        shown += 1;
      }
      if (shown === 0) log.debug("no subject rows matched yet", { year, month });
    }
  };

  const refresh = async () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      settings = await getSettings();
      // While the ArcUI shell is on screen it draws these numbers itself. The site markup this
      // overlay attaches to is hidden, so nothing here should appear on top of the shell.
      if (document.documentElement.hasAttribute("data-bzs-shell")) {
        slots.removeAll();
        return;
      }
      const route = classifyPath(location.pathname);
      if (route.kind === "movie" || route.kind === "chapter") {
        await renderChapterTotal(route.courseId, route.chapterId, settings.display.timeStyle);
      } else if (route.kind === "month") {
        await renderMonth(route.year, route.month);
      }
      slots.prune();
    } catch (error) {
      log.error("summary refresh failed", { error: String(error) });
    } finally {
      running = false;
      if (queued) {
        queued = false;
        void refresh();
      }
    }
  };

  // Settings changes invalidate both the cached numbers and the rendered blocks.
  const unwatch = watchSettings(() => {
    cachedKey = undefined;
    slots.removeAll();
    void refresh();
  });
  ctx.onInvalidated(() => {
    unwatch();
    slots.removeAll();
  });

  let debounceTimer: number | undefined;
  const scheduleRefresh = () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
  };

  // The cache key already encodes the page (chapter or month), so a route change only
  // needs a re-render; a new key triggers exactly one message to background.
  ctx.addEventListener(window, "wxt:locationchange", scheduleRefresh);
  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.body, { childList: true, subtree: true });
  ctx.onInvalidated(() => observer.disconnect());

  void refresh();
}
