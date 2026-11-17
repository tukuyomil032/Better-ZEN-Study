import { expect, test } from "bun:test";
import {
  EMPTY_SPEED_STATE,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STATE_PER_VIDEO_LIMIT,
  clampSpeed,
  parseSpeedState,
  recordSpeed,
  resetSpeed,
  resolveStartSpeed,
  stepSpeed,
  type SpeedState,
} from "../src/lib/speed";

test("clamps speed to supported bounds and falls back for non-finite values", () => {
  expect(clampSpeed(SPEED_MIN)).toBe(SPEED_MIN);
  expect(clampSpeed(SPEED_MAX)).toBe(SPEED_MAX);
  expect(clampSpeed(1.25)).toBe(1.25);
  expect(clampSpeed(0.1)).toBe(SPEED_MIN);
  expect(clampSpeed(4)).toBe(SPEED_MAX);
  expect(clampSpeed(Number.NaN)).toBe(1);
  expect(clampSpeed(Number.POSITIVE_INFINITY)).toBe(1);
  expect(clampSpeed(Number.NEGATIVE_INFINITY)).toBe(1);
});

test("steps in both directions, clamps at bounds, and avoids floating point drift", () => {
  expect(stepSpeed(1, 1, 0.25)).toBe(1.25);
  expect(stepSpeed(1, -1, 0.25)).toBe(0.75);
  expect(stepSpeed(1.1, 1, 0.25)).toBe(1.35);
  expect(stepSpeed(2.0, 1, 0.25)).toBe(2.0);
  expect(stepSpeed(SPEED_MAX, 1, 0.1)).toBe(SPEED_MAX);
  expect(stepSpeed(SPEED_MIN, -1, 0.25)).toBe(SPEED_MIN);

  let threeTenths = 1;
  threeTenths = stepSpeed(threeTenths, 1, 0.1);
  threeTenths = stepSpeed(threeTenths, 1, 0.1);
  threeTenths = stepSpeed(threeTenths, 1, 0.1);
  expect(threeTenths).toBe(1.3);

  let speed = 1;
  for (let index = 0; index < 10; index += 1) speed = stepSpeed(speed, 1, 0.1);
  expect(speed).toBe(2);
  for (let index = 0; index < 10; index += 1) speed = stepSpeed(speed, -1, 0.1);
  expect(speed).toBe(1);

  for (const step of [0.25, 0.1] as const) {
    let stepped = SPEED_MIN;
    while (stepped < SPEED_MAX) {
      const next = stepSpeed(stepped, 1, step);
      const stepCount = (next - SPEED_MIN) / step;
      expect(Math.abs(stepCount - Math.round(stepCount))).toBeLessThan(1e-9);
      expect(next).toBeGreaterThan(stepped);
      stepped = next;
    }
    expect(stepped).toBe(SPEED_MAX);
  }
});

test("resolves a start speed from the selected scope", () => {
  const state: SpeedState = {
    global: 1.75,
    perVideo: { "movie-1": 1.25 },
  };

  expect(resolveStartSpeed({ state, scope: "global", movieId: "movie-1", initial: 1 })).toBe(1.75);
  expect(resolveStartSpeed({ state, scope: "per-video", movieId: "movie-1", initial: 1 })).toBe(
    1.25,
  );
  expect(
    resolveStartSpeed({
      state: { global: 1.75, perVideo: {} },
      scope: "per-video",
      movieId: "movie-2",
      initial: 1.1,
    }),
  ).toBe(1.1);
  expect(resolveStartSpeed({ state, scope: "per-video", movieId: "movie-2", initial: 0.25 })).toBe(
    SPEED_MIN,
  );
  expect(
    resolveStartSpeed({
      state: EMPTY_SPEED_STATE,
      scope: "global",
      movieId: "movie-2",
      initial: 3,
    }),
  ).toBe(SPEED_MAX);
});

test("records global speed without changing the input state", () => {
  const state: SpeedState = { global: 1, perVideo: { "movie-1": 1.25 } };
  const result = recordSpeed({ state, scope: "global", movieId: "movie-2", speed: 2.5 });

  expect(result).toEqual({ global: SPEED_MAX, perVideo: { "movie-1": 1.25 } });
  expect(result).not.toBe(state);
  expect(result.perVideo).not.toBe(state.perVideo);
  expect(state).toEqual({ global: 1, perVideo: { "movie-1": 1.25 } });
});

test("records per-video speed as newest and evicts oldest entries over the limit", () => {
  const state: SpeedState = {
    global: 1.75,
    perVideo: { "movie-1": 1, "movie-2": 1.25, "movie-3": 1.5 },
  };
  const updated = recordSpeed({
    state,
    scope: "per-video",
    movieId: "movie-2",
    speed: 0.1,
  });
  expect(updated.perVideoOrder).toEqual(["movie-1", "movie-3", "movie-2"]);
  expect(updated.perVideo["movie-2"]).toBe(SPEED_MIN);
  expect(updated.global).toBe(1.75);
  expect(state.perVideoOrder).toBeUndefined();
  expect(state).toEqual({
    global: 1.75,
    perVideo: { "movie-1": 1, "movie-2": 1.25, "movie-3": 1.5 },
  });

  const fullState: SpeedState = {
    perVideoOrder: Array.from(
      { length: SPEED_STATE_PER_VIDEO_LIMIT },
      (_, index) => `movie-${index}`,
    ),
    perVideo: Object.fromEntries(
      Array.from({ length: SPEED_STATE_PER_VIDEO_LIMIT }, (_, index) => [`movie-${index}`, 1]),
    ),
  };
  const evicted = recordSpeed({
    state: fullState,
    scope: "per-video",
    movieId: "movie-new",
    speed: 1.5,
  });
  expect(Object.keys(evicted.perVideo)).toHaveLength(SPEED_STATE_PER_VIDEO_LIMIT);
  expect(evicted.perVideo["movie-0"]).toBeUndefined();
  expect(evicted.perVideo["movie-1"]).toBe(1);
  expect(evicted.perVideo["movie-new"]).toBe(1.5);
  expect(evicted.perVideoOrder?.[0]).toBe("movie-1");
});

test("parses malformed state safely, drops invalid entries, clamps values, and keeps newest entries", () => {
  expect(parseSpeedState(null)).toBe(EMPTY_SPEED_STATE);
  expect(parseSpeedState([])).toBe(EMPTY_SPEED_STATE);
  expect(parseSpeedState("invalid")).toBe(EMPTY_SPEED_STATE);
  expect(
    parseSpeedState({
      global: Number.NaN,
      perVideo: {
        first: 0.1,
        second: 2.5,
        invalidString: "1.5",
        invalidNumber: Number.POSITIVE_INFINITY,
        invalidNull: null,
      },
    }),
  ).toEqual({ perVideo: { first: SPEED_MIN, second: SPEED_MAX } });

  const manyVideos = Object.fromEntries(
    Array.from({ length: SPEED_STATE_PER_VIDEO_LIMIT + 5 }, (_, index) => [
      `movie-${index}`,
      1 + (index % 5) / 10,
    ]),
  );
  const parsed = parseSpeedState({ global: 1.5, perVideo: manyVideos });
  expect(parsed.global).toBe(1.5);
  expect(Object.keys(parsed.perVideo)).toHaveLength(SPEED_STATE_PER_VIDEO_LIMIT);
  expect(parsed.perVideo["movie-0"]).toBeUndefined();
  expect(parsed.perVideo["movie-4"]).toBeUndefined();
  expect(parsed.perVideo["movie-5"]).toBe(1);
  expect(parsed.perVideo[`movie-${SPEED_STATE_PER_VIDEO_LIMIT + 4}`]).toBe(1.4);
});

test("keeps numeric movie ids in explicit LRU order through parsing and recording", () => {
  const numericState = parseSpeedState({
    perVideo: { "100": 1, "2": 1.25, "50": 1.5 },
    perVideoOrder: ["100", "2", "50"],
  });
  expect(numericState.perVideoOrder).toEqual(["100", "2", "50"]);

  const updated = recordSpeed({
    state: numericState,
    scope: "per-video",
    movieId: "100",
    speed: 1.75,
  });
  expect(updated.perVideoOrder).toEqual(["2", "50", "100"]);

  const numericIds = Array.from({ length: SPEED_STATE_PER_VIDEO_LIMIT + 5 }, (_, index) =>
    String(index + 1),
  );
  const largeNumericState = parseSpeedState({
    perVideo: Object.fromEntries(numericIds.map((movieId) => [movieId, 1])),
    perVideoOrder: numericIds,
  });
  expect(largeNumericState.perVideoOrder).toEqual(numericIds.slice(-SPEED_STATE_PER_VIDEO_LIMIT));
  expect(Object.keys(largeNumericState.perVideo)).toHaveLength(SPEED_STATE_PER_VIDEO_LIMIT);
  expect(largeNumericState.perVideo["1"]).toBeUndefined();
  expect(largeNumericState.perVideo["6"]).toBe(1);

  const afterNumericEviction = recordSpeed({
    state: largeNumericState,
    scope: "per-video",
    movieId: "306",
    speed: 1.5,
  });
  expect(afterNumericEviction.perVideoOrder).toEqual([
    ...numericIds.slice(-SPEED_STATE_PER_VIDEO_LIMIT + 1),
    "306",
  ]);
  expect(afterNumericEviction.perVideo["6"]).toBeUndefined();
  expect(afterNumericEviction.perVideo["7"]).toBe(1);
});

test("reset speed clamps the configured initial value", () => {
  expect(resetSpeed(1.25)).toBe(1.25);
  expect(resetSpeed(1.5)).toBe(1.5);
  expect(resetSpeed(-1)).toBe(SPEED_MIN);
  expect(resetSpeed(3)).toBe(SPEED_MAX);
  expect(resetSpeed(Number.NaN)).toBe(1);
});
