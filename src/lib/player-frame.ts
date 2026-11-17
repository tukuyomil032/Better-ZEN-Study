// Which frame is the movie player, and what the player says when a movie ends. Pure functions, so
// the rules can be tested without the site.

import type { UnderstandingAnswer } from "./understanding";

export type PlayerPath = { courseId: number; chapterId: number; movieId: number };

// A movie's player address, and nothing longer. The site also puts side frames under a movie (for
// example reference slides at .../movies/{id}/references/{id}); those are not players.
const PLAYER_PATH = /^\/contents\/courses\/(\d+)\/chapters\/(\d+)\/movies\/(\d+)\/?$/;

export function parsePlayerPath(pathname: string): PlayerPath | undefined {
  const match = PLAYER_PATH.exec(pathname);
  if (!match) return undefined;
  const courseId = Number(match[1]);
  const chapterId = Number(match[2]);
  const movieId = Number(match[3]);
  if (![courseId, chapterId, movieId].every(Number.isSafeInteger)) return undefined;
  return { courseId, chapterId, movieId };
}

// Whether a frame's address is one of the site's content pages (every player and material is one).
// The address must be on the same site as the page, so another site's frame is never taken for it.
export function isSitePlayerSrc(src: string | null, base: string): boolean {
  if (!src) return false;
  try {
    const url = new URL(src, base);
    return url.origin === new URL(base).origin && url.pathname.startsWith("/contents/");
  } catch {
    return false;
  }
}

// The frame that sent a message: the one whose window is the message's source. Matching by source is
// what keeps the right player when the page also holds another copy of a player.
export function frameBySource<T extends { contentWindow: unknown }>(
  frames: readonly T[],
  source: unknown,
): T | undefined {
  if (source === null || source === undefined) return undefined;
  return frames.find((frame) => frame.contentWindow === source);
}

export type PlayerEnded = { movieId: number; answer: UnderstandingAnswer | undefined };

// The message a player frame posts when its movie ends. The answer is absent from an older player
// message, and then the movie is treated as finished, as it was before.
export function parsePlayerEnded(data: unknown): PlayerEnded | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const record = data as Record<string, unknown>;
  if (record.source !== "better-report" || record.type !== "ended") return undefined;
  if (typeof record.movieId !== "number" || !Number.isSafeInteger(record.movieId)) return undefined;
  const answer =
    record.answer === "none" ||
    record.answer === "good" ||
    record.answer === "bad" ||
    record.answer === "skipped"
      ? record.answer
      : undefined;
  return { movieId: record.movieId, answer };
}
