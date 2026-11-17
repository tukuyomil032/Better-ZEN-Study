import { expect, test } from "bun:test";
import { DEFAULT_SETTINGS, mergeSettings, parseSettings } from "../src/lib/settings";

test("provides the complete defaults", () => {
  expect(parseSettings({})).toEqual(DEFAULT_SETTINGS);
  expect(DEFAULT_SETTINGS.autoplay).toEqual({
    enabled: true,
    delaySeconds: 2,
    skipWatched: true,
    includeSupplement: false,
  });
  expect(DEFAULT_SETTINGS.speed).toEqual({
    initial: 1,
    step: 0.25,
    scope: "global",
    applyToUnwatched: true,
    hotkeys: { faster: "]", slower: "[", reset: "\\" },
  });
  expect(DEFAULT_SETTINGS.notify).toEqual({
    enabled: true,
    tests: true,
    reports: true,
    exercises: true,
    silent: false,
    clickToTab: true,
  });
  expect(DEFAULT_SETTINGS.display.timeStyle).toBe("hms");
  expect(DEFAULT_SETTINGS.appearance).toEqual({ theme: "system", accent: "blue" });
});

test("falls back field by field and removes unknown keys", () => {
  expect(
    parseSettings({
      autoplay: { enabled: false, delaySeconds: 31, extra: true },
      speed: { step: 0.1, initial: 1.2, scope: "local" },
      notify: { silent: "yes" },
      display: { timeStyle: "minutes" },
      appearance: { accent: "magenta" },
      extra: "dropped",
    }),
  ).toEqual({
    ...DEFAULT_SETTINGS,
    autoplay: { ...DEFAULT_SETTINGS.autoplay, enabled: false },
    speed: { ...DEFAULT_SETTINGS.speed, step: 0.1, initial: 1.2 },
  });
});

test("returns defaults for non-object input and invalid speed values", () => {
  expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  expect(parseSettings("settings")).toEqual(DEFAULT_SETTINGS);
  expect(parseSettings({ speed: { initial: 2.5 } }).speed.initial).toBe(1);
  expect(parseSettings({ speed: { initial: 1.15, step: 0.25 } }).speed.initial).toBe(1);
});

test("merges nested patches and validates the result", () => {
  expect(
    mergeSettings(DEFAULT_SETTINGS, {
      autoplay: { enabled: false },
      speed: { hotkeys: { faster: "=" } },
    }),
  ).toEqual({
    ...DEFAULT_SETTINGS,
    autoplay: { ...DEFAULT_SETTINGS.autoplay, enabled: false },
    speed: {
      ...DEFAULT_SETTINGS.speed,
      hotkeys: { ...DEFAULT_SETTINGS.speed.hotkeys, faster: "=" },
    },
  });
});
