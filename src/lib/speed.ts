export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2;
export const SPEED_STATE_PER_VIDEO_LIMIT = 300;

export type SpeedState = {
  global?: number;
  perVideo: Record<string, number>;
  perVideoOrder?: string[];
};

export type SpeedScope = "global" | "per-video";

export const EMPTY_SPEED_STATE: SpeedState = { perVideo: {} };

export function clampSpeed(value: number): number {
  // Invalid stored or computed rates fall back to the normal 1.0x rate.
  if (!Number.isFinite(value)) return 1;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, value));
}

export function stepSpeed(current: number, direction: 1 | -1, step: number): number {
  const nextSpeed = clampSpeed(current + direction * step);
  return clampSpeed(Number(nextSpeed.toFixed(2)));
}

export function resolveStartSpeed(args: {
  state: SpeedState;
  scope: SpeedScope;
  movieId: string;
  initial: number;
}): number {
  const { state, scope, movieId, initial } = args;
  if (scope === "global") return clampSpeed(state.global ?? initial);
  return clampSpeed(state.perVideo[movieId] ?? initial);
}

export function recordSpeed(args: {
  state: SpeedState;
  scope: SpeedScope;
  movieId: string;
  speed: number;
}): SpeedState {
  const { state, scope, movieId, speed } = args;
  const normalized = parseSpeedState(state);
  const clampedSpeed = clampSpeed(speed);

  if (scope === "global") {
    return { ...normalized, global: clampedSpeed };
  }

  const orderedMovieIds = normalized.perVideoOrder ?? Object.keys(normalized.perVideo);
  const recentMovieIds = orderedMovieIds.filter((key) => key !== movieId);
  recentMovieIds.push(movieId);
  const retainedMovieIds = recentMovieIds.slice(-SPEED_STATE_PER_VIDEO_LIMIT);
  const perVideo = Object.fromEntries(
    retainedMovieIds.map((key) => [
      key,
      key === movieId ? clampedSpeed : normalized.perVideo[key]!,
    ]),
  );
  return { ...normalized, perVideo, perVideoOrder: retainedMovieIds };
}

export function parseSpeedState(raw: unknown): SpeedState {
  try {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return EMPTY_SPEED_STATE;
    }

    const record = raw as Record<string, unknown>;
    const parsed: SpeedState = { perVideo: {} };
    if (typeof record.global === "number" && Number.isFinite(record.global)) {
      parsed.global = clampSpeed(record.global);
    }

    const rawPerVideo = record.perVideo;
    if (typeof rawPerVideo !== "object" || rawPerVideo === null || Array.isArray(rawPerVideo)) {
      return parsed;
    }

    const validEntries = Object.entries(rawPerVideo).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]),
    );
    const validSpeeds = new Map(
      validEntries.map(([movieId, speed]) => [movieId, clampSpeed(speed)]),
    );
    const enumeratedMovieIds = validEntries.map(([movieId]) => movieId);
    const requestedOrder = Array.isArray(record.perVideoOrder)
      ? record.perVideoOrder.filter((movieId): movieId is string => typeof movieId === "string")
      : enumeratedMovieIds;
    const orderedMovieIds: string[] = [];
    const seenMovieIds = new Set<string>();
    for (const movieId of requestedOrder) {
      if (validSpeeds.has(movieId) && !seenMovieIds.has(movieId)) {
        orderedMovieIds.push(movieId);
        seenMovieIds.add(movieId);
      }
    }
    for (const movieId of enumeratedMovieIds) {
      if (!seenMovieIds.has(movieId)) {
        orderedMovieIds.push(movieId);
        seenMovieIds.add(movieId);
      }
    }
    const recentMovieIds = orderedMovieIds.slice(-SPEED_STATE_PER_VIDEO_LIMIT);
    parsed.perVideo = Object.fromEntries(
      recentMovieIds.map((movieId) => [movieId, validSpeeds.get(movieId)!]),
    );
    if (Array.isArray(record.perVideoOrder)) parsed.perVideoOrder = recentMovieIds;
    return parsed;
  } catch {
    return EMPTY_SPEED_STATE;
  }
}

export function resetSpeed(initial: number): number {
  return clampSpeed(initial);
}
