import { browser } from "wxt/browser";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createLogger, type LogRecord, type Logger } from "../../lib/logger";
import { classifyPath, type Route } from "../../lib/routes";
import { pickNext } from "../../lib/next-target";
import type { ChapterSection } from "../../lib/zen-api";
import { getSettings, watchSettings } from "../../lib/settings-storage";
import { DEFAULT_SETTINGS, type Settings } from "../../lib/settings";
import { clampSpeed, recordSpeed, resetSpeed, resolveStartSpeed, stepSpeed } from "../../lib/speed";
import { getSpeedState, saveSpeedState } from "../../lib/speed-storage";
import { sendToBackground } from "../../lib/context-safety";
import {
  frameBySource,
  isSitePlayerSrc,
  parsePlayerEnded,
  parsePlayerPath,
} from "../../lib/player-frame";
import {
  domUnderstandingProbe,
  wallClock,
  waitForUnderstandingAnswer,
  type UnderstandingAnswer,
} from "../../lib/understanding";
import { startSummaryUi } from "./summary";
import { startStudyTracker } from "./study-tracker";

// The message a player frame posts to the chapter page when its movie ends. The answer is the
// learner's reply to the understanding question ("none" when there was no question).
type PlayerEndedMessage = {
  source: "better-report";
  type: "ended";
  movieId: number;
  answer: UnderstandingAnswer;
};

type HotkeyMessage = {
  source: "better-report";
  type: "hotkey";
  key: string;
};

const SPEED_BADGE_ID = "better-report-speed-badge";
const SPEED_BADGE_MS = 2000;

// Every frame sends its records to background, which keeps the buffer that the
// popup reads. Sending failures are ignored so logging never breaks a feature.
function createFrameLogger(scope: "top" | "player"): Logger {
  return createLogger({
    scope,
    source: scope,
    sink: (record: LogRecord) => {
      void sendToBackground({ type: "debug-log", record });
    },
    path: () => location.pathname,
  });
}

async function waitForPlayerVideo(): Promise<HTMLVideoElement | null> {
  const existingVideo = document.querySelector<HTMLVideoElement>("video#video-player");
  if (existingVideo) return existingVideo;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (video: HTMLVideoElement | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timeoutId);
      resolve(video);
    };

    const observer = new MutationObserver(() => {
      const video = document.querySelector<HTMLVideoElement>("video#video-player");
      if (video) finish(video);
    });
    const timeoutId = window.setTimeout(() => finish(null), 20_000);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    const video = document.querySelector<HTMLVideoElement>("video#video-player");
    if (video) finish(video);
  });
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable ||
    target.closest("[contenteditable='true'], [contenteditable='']") !== null
  );
}

// The player frame to send hotkeys to. The shell's own player is preferred: a copy of the site's
// window, if one is still on the page, is never the one that plays.
function findPlayerFrame(): HTMLIFrameElement | undefined {
  const frames = Array.from(document.querySelectorAll("iframe"));
  const isPlayer = (iframe: HTMLIFrameElement) =>
    isSitePlayerSrc(iframe.getAttribute("src"), location.href);
  return (
    frames.find((iframe) => iframe.closest("#bzs-app") !== null && isPlayer(iframe)) ??
    frames.find(isPlayer)
  );
}

async function runPlayer(log: Logger): Promise<void> {
  const player = parsePlayerPath(location.pathname);
  if (!player) {
    // A side frame of a movie (reference slides, for example) is not a player. It is noted, not
    // reported, so it does not look like a fault.
    log.debug("frame is not a movie player", { pathname: location.pathname });
    return;
  }
  const { courseId, chapterId, movieId } = player;
  log.info("player ready", { courseId, chapterId, movieId });

  const video = await waitForPlayerVideo();
  if (!video) {
    log.warn("video#video-player not found within 20s", { movieId });
    return;
  }
  log.info("video element found", { movieId, readyState: video.readyState });
  startStudyTracker(video);

  let settings: Settings = await getSettings();
  let speedIntent = video.playbackRate;
  let lastRateReapplyAt = 0;
  let rateReapplyTimer: number | undefined;
  let metadataSequence = 0;
  let hotkeySequence = 0;
  let speedSaveQueue = Promise.resolve();
  let badgeTimer: number | undefined;

  const applySpeed = (nextSpeed: number) => {
    speedIntent = clampSpeed(nextSpeed);
    if (video.playbackRate !== speedIntent) video.playbackRate = speedIntent;
  };

  const persistSpeed = (scope: Settings["speed"]["scope"], speed: number) => {
    speedSaveQueue = speedSaveQueue
      .then(async () => {
        await navigator.locks.request("better-report-speed-state", async () => {
          const state = await getSpeedState();
          await saveSpeedState(recordSpeed({ state, scope, movieId: String(movieId), speed }));
        });
      })
      .catch((error: unknown) => {
        log.warn("speed state save failed", { error: String(error) });
      });
  };

  const showSpeedBadge = (speed: number) => {
    let badge = document.getElementById(SPEED_BADGE_ID);
    if (!badge) {
      badge = document.createElement("div");
      badge.id = SPEED_BADGE_ID;
      Object.assign(badge.style, {
        position: "fixed",
        right: "12px",
        bottom: "12px",
        zIndex: "2147483647",
        background: "rgba(0, 0, 0, 0.72)",
        color: "#fff",
        font: "600 14px/1.2 system-ui, sans-serif",
        padding: "4px 8px",
        borderRadius: "6px",
        pointerEvents: "none",
        display: "none",
      });
      document.body.appendChild(badge);
    }
    badge.textContent = `${speed}x`;
    badge.style.display = "block";
    window.clearTimeout(badgeTimer);
    badgeTimer = window.setTimeout(() => {
      badge.style.display = "none";
    }, SPEED_BADGE_MS);
  };

  const handleHotkey = (key: string, origin: "keyboard" | "top"): boolean => {
    const hotkeys = settings.speed.hotkeys;
    let action: "faster" | "slower" | "reset" | undefined;
    if (key === hotkeys.faster) action = "faster";
    else if (key === hotkeys.slower) action = "slower";
    else if (key === hotkeys.reset) action = "reset";
    if (!action) return false;

    const from = speedIntent;
    hotkeySequence += 1;
    const next =
      action === "reset"
        ? resetSpeed(settings.speed.initial)
        : stepSpeed(speedIntent, action === "faster" ? 1 : -1, settings.speed.step);
    applySpeed(next);
    showSpeedBadge(speedIntent);
    persistSpeed(settings.speed.scope, speedIntent);
    log.info("hotkey applied", {
      key,
      action,
      origin,
      from,
      to: speedIntent,
      scope: settings.speed.scope,
    });
    return true;
  };

  const initializeLoadedVideo = async () => {
    const sequence = ++metadataSequence;
    const startingHotkeySequence = hotkeySequence;
    log.info("initialize speed", { movieId, sequence, siteRate: video.playbackRate });
    try {
      const [nextSettings, speedState] = await Promise.all([getSettings(), getSpeedState()]);
      let watched = false;
      try {
        const responseValue: unknown = await browser.runtime.sendMessage({
          type: "fetch-chapter",
          courseId,
          chapterId,
        });
        if (
          typeof responseValue === "object" &&
          responseValue !== null &&
          "ok" in responseValue &&
          responseValue.ok === true &&
          "sections" in responseValue &&
          Array.isArray(responseValue.sections)
        ) {
          const currentSection = responseValue.sections.find(
            (section: unknown) =>
              typeof section === "object" &&
              section !== null &&
              "id" in section &&
              section.id === movieId,
          );
          watched =
            typeof currentSection === "object" &&
            currentSection !== null &&
            "passed" in currentSection &&
            currentSection.passed === true;
          log.debug("watched state read", { movieId, watched });
        } else {
          log.warn("chapter response was not ok; treating movie as unwatched", {
            movieId,
            response: String(
              typeof responseValue === "object" &&
                responseValue !== null &&
                "error" in responseValue
                ? responseValue.error
                : "unknown",
            ),
          });
        }
      } catch (error) {
        log.warn("watched state request failed; treating movie as unwatched", {
          movieId,
          error: String(error),
        });
        watched = false;
      }

      if (sequence !== metadataSequence) {
        log.debug("initialize superseded by a newer load", { sequence });
        return;
      }
      settings = nextSettings;
      if (hotkeySequence !== startingHotkeySequence) {
        log.debug("initialize skipped: a hotkey was pressed first", { movieId });
        return;
      }
      if (!nextSettings.speed.applyToUnwatched && !watched) {
        speedIntent = video.playbackRate;
        log.info("speed left at the site default", {
          movieId,
          reason: "applyToUnwatched is off and the movie is unwatched",
          siteRate: video.playbackRate,
        });
        return;
      }

      const start = resolveStartSpeed({
        state: speedState,
        scope: nextSettings.speed.scope,
        movieId: String(movieId),
        initial: nextSettings.speed.initial,
      });
      applySpeed(start);
      log.info("start speed applied", {
        movieId,
        speed: start,
        scope: nextSettings.speed.scope,
        watched,
      });
    } catch (error) {
      log.warn("initialize speed failed", { movieId, error: String(error) });
    }
  };

  video.addEventListener("loadedmetadata", () => {
    log.debug("loadedmetadata", { movieId, siteRate: video.playbackRate });
    void initializeLoadedVideo();
  });
  video.addEventListener("play", () => {
    log.debug("play", { movieId, rate: video.playbackRate, intent: speedIntent });
  });
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    void initializeLoadedVideo();
  }

  video.addEventListener("ratechange", () => {
    if (Math.abs(video.playbackRate - speedIntent) < 0.001) return;
    const now = Date.now();
    if (now - lastRateReapplyAt < 500) {
      if (rateReapplyTimer !== undefined) return;
      rateReapplyTimer = window.setTimeout(
        () => {
          rateReapplyTimer = undefined;
          if (Math.abs(video.playbackRate - speedIntent) < 0.001) return;
          lastRateReapplyAt = Date.now();
          log.debug("restoring intended rate (delayed)", {
            siteRate: video.playbackRate,
            intent: speedIntent,
          });
          video.playbackRate = speedIntent;
        },
        500 - (now - lastRateReapplyAt),
      );
      return;
    }
    lastRateReapplyAt = now;
    log.debug("restoring intended rate", { siteRate: video.playbackRate, intent: speedIntent });
    video.playbackRate = speedIntent;
  });

  window.addEventListener("keydown", (event) => {
    if (isEditableTarget(event.target)) return;
    if (handleHotkey(event.key, "keyboard")) event.preventDefault();
  });

  // Hotkeys pressed while focus is on the chapter page arrive here from the top frame.
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== location.origin) return;
    const data = event.data as Partial<HotkeyMessage> | null;
    if (
      data?.source === "better-report" &&
      data.type === "hotkey" &&
      typeof data.key === "string"
    ) {
      handleHotkey(data.key, "top");
    }
  });

  // An advanced movie ends with the understanding question. Its answer is waited for here, and sent
  // with the end, so the chapter page moves on only after the learner has answered. Only one wait runs
  // at a time, so a second end while the first waits does nothing.
  let answering = false;
  video.addEventListener("ended", () => {
    if (answering) return;
    answering = true;
    log.info("video ended, notifying the chapter page", { movieId });
    void waitForUnderstandingAnswer(domUnderstandingProbe(document), wallClock)
      .catch((error: unknown): UnderstandingAnswer => {
        // Without an answer the movie is not treated as understood, so autoplay stays here.
        log.error("understanding answer wait failed", { movieId, error: String(error) });
        return "skipped";
      })
      .then((answer) => {
        log.info("understanding answer read", { movieId, answer });
        const message: PlayerEndedMessage = {
          source: "better-report",
          type: "ended",
          movieId,
          answer,
        };
        window.parent.postMessage(message, location.origin);
      })
      .finally(() => {
        answering = false;
      });
  });
}

type MaterialRoute = Extract<Route, { kind: "material" }>;

const TITLE_WAIT_MS = 3000;
const TITLE_POLL_MS = 500;
const ROUTE_POLL_MS = 1000;

// The arrival kind of a material, or undefined when the material is not one to announce. A practice
// problem is announced only when autoplay paused on it: opening one by hand is not news.
function arrivalKindOf(
  route: MaterialRoute,
  pausedHere: boolean,
): "test" | "report" | "exercise" | undefined {
  if (route.resourceType === "evaluation_test" || route.resourceType === "essay_test") {
    return "test";
  }
  if (route.resourceType === "evaluation_report" || route.resourceType === "essay_report") {
    return "report";
  }
  if (route.resourceType === "exercise" && pausedHere) return "exercise";
  return undefined;
}

function runTopFrame(ctx: ContentScriptContext, log: Logger): void {
  let autoplayInProgress = false;
  let noFurtherAutoplay = false;
  let cachedSettings: Settings = DEFAULT_SETTINGS;
  // Pathname of the page the route handling last ran for. Route handling runs once per path.
  let lastPathname: string | undefined;
  // Document title seen when the previous route was handled, used to detect the new page.
  let lastTitle = "";
  // Incremented for every route change so a slow arrival can notice it is stale.
  let routeSeq = 0;
  // Arrival already sent for this resource; cleared when the user leaves it.
  let lastArrivalKey: string | undefined;
  // The practice problem autoplay paused on, by its resource key. Set just before autoplay moves
  // there, so only that move is announced.
  let autoplayPausedAt: string | undefined;

  // A page that outlived a reload of the extension cannot read its settings; it keeps the defaults.
  void getSettings()
    .then((settings) => {
      cachedSettings = settings;
    })
    .catch(() => undefined);
  const unwatchSettings = watchSettings((settings) => {
    cachedSettings = settings;
  });
  ctx.onInvalidated(unwatchSettings);

  // The SPA can still show the old page while the new URL is being committed, so wait
  // (bounded) for the title to move on before reading it. The notification uses the API
  // for the chapter and resource names, and the title only for the subject.
  const waitForTitleChange = async (previousTitle: string): Promise<string> => {
    const deadline = Date.now() + TITLE_WAIT_MS;
    while (document.title === previousTitle && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, TITLE_POLL_MS));
    }
    return document.title;
  };

  const announceMaterialArrival = async (
    route: MaterialRoute,
    kind: "test" | "report" | "exercise",
    seq: number,
    previousTitle: string,
  ) => {
    const pageTitle = await waitForTitleChange(previousTitle);
    if (seq !== routeSeq) {
      log.info("arrival dropped: the page changed while waiting", {
        resourceType: route.resourceType,
      });
      return;
    }

    log.info("material arrival", {
      kind,
      resourceType: route.resourceType,
      courseId: route.courseId,
      chapterId: route.chapterId,
      resourceId: route.id,
      titleChanged: pageTitle !== previousTitle,
      pageTitle,
    });
    try {
      const response: unknown = await browser.runtime.sendMessage({
        type: "test-arrival",
        kind,
        resourceType: route.resourceType,
        courseId: route.courseId,
        chapterId: route.chapterId,
        resourceId: route.id,
        pageTitle,
      });
      const answer = response as { ok?: boolean; error?: string } | undefined;
      log.info("test-arrival answered", {
        ok: answer?.ok === true,
        error: answer?.ok === false ? answer.error : undefined,
      });
    } catch (error) {
      log.error("test-arrival message failed", { error: String(error) });
    }
  };

  // Handles one path. Called from the WXT location event (which carries the new URL, sent
  // before the page commits) and from a slow poll as a fallback.
  const processRoute = (pathname: string, source: "event" | "poll" | "initial") => {
    if (pathname === lastPathname) return;
    lastPathname = pathname;
    routeSeq += 1;
    const seq = routeSeq;
    const previousTitle = lastTitle;
    lastTitle = document.title;

    const route = classifyPath(pathname);
    log.info("route", { kind: route.kind, source, pathname, route });
    // Entering a movie re-arms autoplay after an earlier stop at a test or report.
    if (route.kind === "movie") noFurtherAutoplay = false;

    if (route.kind !== "material") {
      lastArrivalKey = undefined;
      return;
    }
    const key = `${route.courseId}:${route.chapterId}:${route.resourceType}:${route.id}`;
    const pausedHere = autoplayPausedAt === key;
    autoplayPausedAt = undefined;
    const kind = arrivalKindOf(route, pausedHere);
    if (!kind) {
      lastArrivalKey = undefined;
      return;
    }
    if (key === lastArrivalKey) {
      log.debug("arrival already sent for this resource", { resourceType: route.resourceType });
      return;
    }
    lastArrivalKey = key;
    void announceMaterialArrival(route, kind, seq, previousTitle);
  };

  const handlePlayerEnded = async (event: MessageEvent<unknown>) => {
    if (event.origin !== location.origin) return;
    const message = parsePlayerEnded(event.data);
    if (!message) return;

    const route = classifyPath(location.pathname);
    if (route.kind !== "movie") {
      log.info("ended ignored: current page is not a movie", { kind: route.kind });
      return;
    }

    // The message must come from the frame that sent it, whichever copy of the player that is. The
    // shell's player and the site's own copy are both on the page, so the first frame is not enough.
    const frames = Array.from(document.querySelectorAll("iframe"));
    if (!frameBySource(frames, event.source)) {
      log.warn("ended ignored: message did not come from the player frame", {
        frames: frames.length,
        fromWindow: event.source !== null,
      });
      return;
    }
    if (message.movieId !== route.movieId) {
      log.warn("ended ignored: movie id mismatch", {
        fromFrame: message.movieId,
        onPage: route.movieId,
      });
      return;
    }

    // The learner has not said they understood: the movie is not finished, so autoplay stays here.
    if (message.answer === "bad") {
      log.info("ended: the learner did not understand, so autoplay stays on this movie", {
        movieId: route.movieId,
      });
      return;
    }
    if (message.answer === "skipped") {
      log.info("ended: no understanding answer, so autoplay stays on this movie", {
        movieId: route.movieId,
      });
      return;
    }

    if (autoplayInProgress) {
      log.debug("ended ignored: autoplay already in progress");
      return;
    }
    if (noFurtherAutoplay) {
      log.info("ended: autoplay is paused after a test or report");
      return;
    }
    autoplayInProgress = true;
    log.info("ended accepted", { movieId: route.movieId });

    try {
      const settings = await getSettings();
      if (!settings.autoplay.enabled) {
        log.info("autoplay is disabled in settings");
        return;
      }

      const responseValue: unknown = await browser.runtime.sendMessage({
        type: "fetch-chapter",
        courseId: route.courseId,
        chapterId: route.chapterId,
        fresh: true,
      });
      // The background has already read the chapter into the shape autoplay needs (see
      // fetchChapter), so only the reply itself is checked here.
      const reply = responseValue as { ok?: unknown; sections?: unknown } | undefined;
      if (reply?.ok !== true || !Array.isArray(reply.sections)) {
        log.error("autoplay stopped: no chapter data came back");
        return;
      }
      const sections = reply.sections as ChapterSection[];

      const target = pickNext(sections, route.movieId, {
        skipWatched: settings.autoplay.skipWatched,
        includeSupplement: settings.autoplay.includeSupplement,
      });
      if (!target) {
        log.info("no next target in this chapter", { movieId: route.movieId });
        return;
      }

      const section = sections[target.index];
      if (!section) {
        log.error("next target index is out of range", { index: target.index });
        return;
      }
      log.info("next target chosen", {
        kind: target.kind,
        id: section.id,
        resourceType: section.resource_type,
        title: section.title,
        delaySeconds: settings.autoplay.delaySeconds,
      });

      await new Promise((resolve) =>
        window.setTimeout(resolve, settings.autoplay.delaySeconds * 1000),
      );

      if (target.kind === "stop") {
        noFurtherAutoplay = true;
        // The arrival is announced when the page opens there, and only for this move.
        autoplayPausedAt = `${route.courseId}:${route.chapterId}:${section.resource_type}:${section.id}`;
        log.info("next target is a test, report or practice problem: autoplay will pause there", {
          resourceType: section.resource_type,
        });
      }

      const targetPath =
        target.kind === "movie"
          ? `/courses/${route.courseId}/chapters/${route.chapterId}/movie/${section.id}`
          : `/courses/${route.courseId}/chapters/${route.chapterId}/${section.resource_type}/${section.id}`;

      // On the shell's own screens the move is a request to the shell's router, so the page is
      // not reloaded. The shell sets data-bzs-shell on the page while it is on screen.
      if (document.documentElement.hasAttribute("data-bzs-shell")) {
        window.dispatchEvent(new CustomEvent("bzs:navigate", { detail: { path: targetPath } }));
        log.info("moved to the next item inside the shell", { title: section.title });
        return;
      }

      const targetButton = [...document.querySelectorAll<HTMLButtonElement>("li button")].find(
        (button) => button.innerText.trim() === section.title.trim(),
      );

      if (targetButton) {
        targetButton.click();
        log.info("clicked the list item", { title: section.title });
        return;
      }
      const targetUrl = new URL(targetPath, location.origin);
      log.warn("list item not found; navigating by URL", {
        title: section.title,
        path: targetPath,
      });
      location.assign(targetUrl.href);
    } catch (error) {
      log.error("autoplay failed", { error: String(error) });
    } finally {
      autoplayInProgress = false;
    }
  };

  // Hotkeys pressed while focus is on the chapter page are forwarded to the player frame,
  // so they work without clicking into the video first.
  window.addEventListener("keydown", (event) => {
    if (isEditableTarget(event.target)) return;
    const hotkeys = cachedSettings.speed.hotkeys;
    if (![hotkeys.faster, hotkeys.slower, hotkeys.reset].includes(event.key)) return;

    const playerFrame = findPlayerFrame();
    if (!playerFrame?.contentWindow) {
      log.debug("hotkey not forwarded: no player frame on this page", { key: event.key });
      return;
    }
    event.preventDefault();
    const message: HotkeyMessage = { source: "better-report", type: "hotkey", key: event.key };
    playerFrame.contentWindow.postMessage(message, location.origin);
    log.info("hotkey forwarded to the player", { key: event.key });
  });

  processRoute(location.pathname, "initial");
  // WXT fires this before the new URL is committed, with the new URL on the event.
  ctx.addEventListener(window, "wxt:locationchange", (event: Event) => {
    const newUrl = (event as Event & { newUrl?: URL }).newUrl;
    processRoute(newUrl?.pathname ?? location.pathname, "event");
  });
  // Fallback in case a navigation skips the event: compare the path once a second.
  ctx.setInterval(() => processRoute(location.pathname, "poll"), ROUTE_POLL_MS);
  startSummaryUi(ctx, log);
  window.addEventListener("message", (event) => {
    void handlePlayerEnded(event).catch((error: unknown) => {
      log.error("ended handler threw", { error: String(error) });
    });
  });
}

export default defineContentScript({
  matches: ["https://www.nnn.ed.nico/*"],
  allFrames: true,
  runAt: "document_idle",
  main(ctx) {
    const isTop = window.top === window;
    const log = createFrameLogger(isTop ? "top" : "player");
    log.info("content script loaded", {
      frame: isTop ? "top" : "iframe",
      pathname: location.pathname,
    });

    if (isTop) {
      runTopFrame(ctx, log);
      return;
    }

    if (location.pathname.startsWith("/contents/")) void runPlayer(log);
  },
});
