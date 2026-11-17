export const SETTINGS_VERSION = 1;
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2.0;

export type Settings = {
  autoplay: {
    enabled: boolean;
    delaySeconds: number;
    skipWatched: boolean;
    includeSupplement: boolean;
  };
  speed: {
    initial: number;
    step: 0.25 | 0.1;
    scope: "global" | "per-video";
    applyToUnwatched: boolean;
    hotkeys: { faster: string; slower: string; reset: string };
  };
  notify: {
    enabled: boolean;
    tests: boolean;
    reports: boolean;
    // A practice problem of an advanced chapter, where autoplay pauses.
    exercises: boolean;
    silent: boolean;
    clickToTab: boolean;
  };
  display: {
    chapterTotal: boolean;
    monthSummary: boolean;
    subjectSummary: boolean;
    timeStyle: "hms" | "ja";
    includeSupplement: boolean;
  };
  appearance: {
    theme: "system" | "light" | "dark";
    accent: "neutral" | "violet" | "blue" | "green" | "amber" | "orange" | "coral" | "rose";
  };
  // ZEN Study restyling with ArcUI. Each screen can be turned off separately; turning a
  // screen off returns it to the site's own markup.
  skin: {
    enabled: boolean;
    month: boolean;
    chapter: boolean;
    dashboard: boolean;
    media: boolean;
  };
  // The study plan: a goal of hours per day or per week, between a start and an end date.
  plan: {
    unit: "day" | "week";
    hours: number;
    startDate: string | null;
    endDate: string | null;
    streakMinMinutes: number;
    weekStartsOn: 0 | 1;
  };
  debug: {
    enabled: boolean;
    // How the diagnostics screen shows the records: a formatted reading, or the raw lines.
    viewMode: "formatted" | "raw";
  };
};

export type DeepPartial<T> = {
  [Key in keyof T]?: T[Key] extends object ? DeepPartial<T[Key]> : T[Key];
};

export const DEFAULT_SETTINGS: Settings = {
  autoplay: {
    enabled: true,
    delaySeconds: 2,
    skipWatched: true,
    includeSupplement: false,
  },
  speed: {
    initial: 1.0,
    step: 0.25,
    scope: "global",
    applyToUnwatched: true,
    hotkeys: { faster: "]", slower: "[", reset: "\\" },
  },
  notify: {
    enabled: true,
    tests: true,
    reports: true,
    exercises: true,
    silent: false,
    clickToTab: true,
  },
  display: {
    chapterTotal: true,
    monthSummary: true,
    subjectSummary: true,
    timeStyle: "hms",
    includeSupplement: false,
  },
  appearance: { theme: "system", accent: "blue" },
  skin: { enabled: true, month: true, chapter: true, dashboard: true, media: true },
  plan: {
    unit: "day",
    hours: 1,
    startDate: null,
    endDate: null,
    streakMinMinutes: 10,
    weekStartsOn: 1,
  },
  debug: { enabled: true, viewMode: "formatted" },
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function isSpeedStep(value: unknown): value is Settings["speed"]["step"] {
  return value === 0.25 || value === 0.1;
}

function isSpeedInitial(value: unknown, step: Settings["speed"]["step"]): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (value < SPEED_MIN || value > SPEED_MAX) return false;
  const stepCount = (value - SPEED_MIN) / step;
  return Math.abs(stepCount - Math.round(stepCount)) < 1e-9;
}

function cloneDefaults(): Settings {
  return {
    autoplay: { ...DEFAULT_SETTINGS.autoplay },
    speed: { ...DEFAULT_SETTINGS.speed, hotkeys: { ...DEFAULT_SETTINGS.speed.hotkeys } },
    notify: { ...DEFAULT_SETTINGS.notify },
    display: { ...DEFAULT_SETTINGS.display },
    appearance: { ...DEFAULT_SETTINGS.appearance },
    skin: { ...DEFAULT_SETTINGS.skin },
    plan: { ...DEFAULT_SETTINGS.plan },
    debug: { ...DEFAULT_SETTINGS.debug },
  };
}

// Reads the study plan. A date must look like YYYY-MM-DD; an end before the start is dropped.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function readDate(value: unknown): string | null {
  return typeof value === "string" && DATE_PATTERN.test(value) ? value : null;
}

function parsePlan(plan: UnknownRecord): Settings["plan"] {
  const base = DEFAULT_SETTINGS.plan;
  const hours =
    typeof plan.hours === "number" &&
    Number.isFinite(plan.hours) &&
    plan.hours >= 0 &&
    plan.hours <= 24
      ? plan.hours
      : base.hours;
  const startDate = readDate(plan.startDate);
  const endDate = readDate(plan.endDate);
  const validRange = startDate !== null && endDate !== null && endDate >= startDate;
  const streak =
    typeof plan.streakMinMinutes === "number" &&
    Number.isInteger(plan.streakMinMinutes) &&
    plan.streakMinMinutes >= 1 &&
    plan.streakMinMinutes <= 240
      ? plan.streakMinMinutes
      : base.streakMinMinutes;
  return {
    unit: plan.unit === "week" ? "week" : "day",
    hours,
    startDate: validRange || (startDate !== null && endDate === null) ? startDate : null,
    endDate: validRange ? endDate : null,
    streakMinMinutes: streak,
    weekStartsOn: plan.weekStartsOn === 0 ? 0 : 1,
  };
}

export function parseSettings(raw: unknown): Settings {
  try {
    if (!isRecord(raw)) return DEFAULT_SETTINGS;

    const autoplay = readRecord(raw.autoplay);
    const speed = readRecord(raw.speed);
    const hotkeys = readRecord(speed.hotkeys);
    const notify = readRecord(raw.notify);
    const display = readRecord(raw.display);
    const appearance = readRecord(raw.appearance);
    const skin = readRecord(raw.skin);
    const plan = readRecord(raw.plan);
    const debug = readRecord(raw.debug);

    const step = isSpeedStep(speed.step) ? speed.step : DEFAULT_SETTINGS.speed.step;
    const candidateInitial = speed.initial;
    const initial = isSpeedInitial(candidateInitial, step)
      ? candidateInitial
      : DEFAULT_SETTINGS.speed.initial;

    return {
      autoplay: {
        enabled: readBoolean(autoplay.enabled, DEFAULT_SETTINGS.autoplay.enabled),
        delaySeconds:
          typeof autoplay.delaySeconds === "number" &&
          Number.isInteger(autoplay.delaySeconds) &&
          autoplay.delaySeconds >= 0 &&
          autoplay.delaySeconds <= 30
            ? autoplay.delaySeconds
            : DEFAULT_SETTINGS.autoplay.delaySeconds,
        skipWatched: readBoolean(autoplay.skipWatched, DEFAULT_SETTINGS.autoplay.skipWatched),
        includeSupplement: readBoolean(
          autoplay.includeSupplement,
          DEFAULT_SETTINGS.autoplay.includeSupplement,
        ),
      },
      speed: {
        initial,
        step,
        scope:
          speed.scope === "global" || speed.scope === "per-video"
            ? speed.scope
            : DEFAULT_SETTINGS.speed.scope,
        applyToUnwatched: readBoolean(
          speed.applyToUnwatched,
          DEFAULT_SETTINGS.speed.applyToUnwatched,
        ),
        hotkeys: {
          faster: readString(hotkeys.faster, DEFAULT_SETTINGS.speed.hotkeys.faster),
          slower: readString(hotkeys.slower, DEFAULT_SETTINGS.speed.hotkeys.slower),
          reset: readString(hotkeys.reset, DEFAULT_SETTINGS.speed.hotkeys.reset),
        },
      },
      notify: {
        enabled: readBoolean(notify.enabled, DEFAULT_SETTINGS.notify.enabled),
        tests: readBoolean(notify.tests, DEFAULT_SETTINGS.notify.tests),
        reports: readBoolean(notify.reports, DEFAULT_SETTINGS.notify.reports),
        exercises: readBoolean(notify.exercises, DEFAULT_SETTINGS.notify.exercises),
        silent: readBoolean(notify.silent, DEFAULT_SETTINGS.notify.silent),
        clickToTab: readBoolean(notify.clickToTab, DEFAULT_SETTINGS.notify.clickToTab),
      },
      display: {
        chapterTotal: readBoolean(display.chapterTotal, DEFAULT_SETTINGS.display.chapterTotal),
        monthSummary: readBoolean(display.monthSummary, DEFAULT_SETTINGS.display.monthSummary),
        subjectSummary: readBoolean(
          display.subjectSummary,
          DEFAULT_SETTINGS.display.subjectSummary,
        ),
        timeStyle:
          display.timeStyle === "hms" || display.timeStyle === "ja"
            ? display.timeStyle
            : DEFAULT_SETTINGS.display.timeStyle,
        includeSupplement: readBoolean(
          display.includeSupplement,
          DEFAULT_SETTINGS.display.includeSupplement,
        ),
      },
      appearance: {
        theme:
          appearance.theme === "system" ||
          appearance.theme === "light" ||
          appearance.theme === "dark"
            ? appearance.theme
            : DEFAULT_SETTINGS.appearance.theme,
        accent:
          appearance.accent === "neutral" ||
          appearance.accent === "violet" ||
          appearance.accent === "blue" ||
          appearance.accent === "green" ||
          appearance.accent === "amber" ||
          appearance.accent === "orange" ||
          appearance.accent === "coral" ||
          appearance.accent === "rose"
            ? appearance.accent
            : DEFAULT_SETTINGS.appearance.accent,
      },
      skin: {
        enabled: readBoolean(skin.enabled, DEFAULT_SETTINGS.skin.enabled),
        month: readBoolean(skin.month, DEFAULT_SETTINGS.skin.month),
        chapter: readBoolean(skin.chapter, DEFAULT_SETTINGS.skin.chapter),
        dashboard: readBoolean(skin.dashboard, DEFAULT_SETTINGS.skin.dashboard),
        media: readBoolean(skin.media, DEFAULT_SETTINGS.skin.media),
      },
      plan: parsePlan(plan),
      debug: {
        enabled: readBoolean(debug.enabled, DEFAULT_SETTINGS.debug.enabled),
        viewMode: debug.viewMode === "raw" ? "raw" : "formatted",
      },
    };
  } catch {
    return cloneDefaults();
  }
}

export function mergeSettings(current: Settings, patch: DeepPartial<Settings>): Settings {
  return parseSettings({
    autoplay: { ...current.autoplay, ...patch.autoplay },
    speed: {
      ...current.speed,
      ...patch.speed,
      hotkeys: { ...current.speed.hotkeys, ...patch.speed?.hotkeys },
    },
    notify: { ...current.notify, ...patch.notify },
    display: { ...current.display, ...patch.display },
    appearance: { ...current.appearance, ...patch.appearance },
    skin: { ...current.skin, ...patch.skin },
    plan: { ...current.plan, ...patch.plan },
    debug: { ...current.debug, ...patch.debug },
  });
}
