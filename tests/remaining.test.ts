import { describe, expect, test } from "bun:test";
import { remainingMovieSeconds } from "../src/lib/remaining";

// An advanced chapter: its movies sit under class_headers, not in a flat sections list.
const advancedChapter = {
  chapter: {
    id: 25167,
    class_headers: [
      {
        name: "section",
        sections: [
          {
            id: 1,
            resource_type: "guide",
            progress: { comprehension: { limit: 1, bad: 0, good: 0, perfect: 0 } },
          },
          {
            id: 2,
            resource_type: "movie",
            length: 822,
            playback_position: 100,
            progress: { comprehension: { limit: 1, bad: 0, good: 1, perfect: 0 } },
          },
          {
            id: 3,
            resource_type: "movie",
            length: 300,
            playback_position: 0,
            progress: { comprehension: { limit: 1, bad: 0, good: 0, perfect: 0 } },
          },
        ],
      },
      {
        name: "lesson",
        sections: [{ id: 4, resource_type: "lesson" }],
      },
    ],
  },
};

describe("remainingMovieSeconds", () => {
  test("counts the movies of an advanced chapter, and the ones not yet understood as remaining", () => {
    expect(remainingMovieSeconds(advancedChapter, false)).toEqual({
      movieCount: 2,
      movieSeconds: 1122,
      remainingSeconds: 300,
    });
  });

  test("returns nothing for a response without a chapter", () => {
    expect(remainingMovieSeconds({}, false)).toEqual({
      movieCount: 0,
      movieSeconds: 0,
      remainingSeconds: 0,
    });
  });

  test("leaves supplement movies out unless they are asked for", () => {
    const chapter = {
      chapter: {
        sections: [
          { id: 1, resource_type: "movie", length: 60, passed: false, material_type: "main" },
          { id: 2, resource_type: "movie", length: 90, passed: false, material_type: "supplement" },
        ],
      },
    };
    expect(remainingMovieSeconds(chapter, false).movieSeconds).toBe(60);
    expect(remainingMovieSeconds(chapter, true).movieSeconds).toBe(150);
  });
});

describe("remainingMovieSeconds for a basic chapter", () => {
  test("still reads the flat sections of a required chapter", () => {
    const chapter = {
      chapter: {
        sections: [
          { id: 1, resource_type: "movie", length: 120, passed: true, material_type: "main" },
          { id: 2, resource_type: "movie", length: 30, passed: false, material_type: "main" },
        ],
      },
    };
    expect(remainingMovieSeconds(chapter, false)).toEqual({
      movieCount: 2,
      movieSeconds: 150,
      remainingSeconds: 30,
    });
  });
});
