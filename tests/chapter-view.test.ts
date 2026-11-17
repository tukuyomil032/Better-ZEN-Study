import { describe, expect, test } from "bun:test";
import { buildChapterView } from "../src/lib/views/chapter-view";

const response = {
  chapter: {
    id: 31713,
    title: "第9回",
    outline: "要点",
    sections: [
      {
        resource_type: "movie",
        id: 10,
        title: "動画",
        passed: true,
        length: 30,
        playback_position: 8,
        material_type: "main",
      },
      {
        resource_type: "essay_test",
        id: 11,
        title: "テスト",
        passed: false,
        material_type: "main",
      },
      {
        resource_type: "evaluation_report",
        id: 12,
        title: "レポート",
        passed: false,
        material_type: "supplement",
      },
      {
        resource_type: "extra",
        id: 13,
        title: "その他",
        passed: false,
        material_type: "main",
      },
      {
        resource_type: "movie",
        id: 14,
        title: "再生位置なし",
        passed: true,
        length: 5,
        playback_position: 0,
        material_type: "main",
      },
    ],
  },
};

describe("buildChapterView", () => {
  test("keeps API order and treats a passed movie as finished", () => {
    const view = buildChapterView(response, 5, 31713, "all");
    expect(view?.items.map((item) => item.title)).toEqual([
      "動画",
      "テスト",
      "レポート",
      "その他",
      "再生位置なし",
    ]);
    expect(view?.items[0]).toMatchObject({
      kind: "movie",
      lengthSeconds: 30,
      playbackSeconds: 8,
      remainingSeconds: 0,
      path: "/courses/5/chapters/31713/movie/10",
    });
    expect(view?.items[2]).toMatchObject({
      kind: "report",
      path: "/courses/5/chapters/31713/evaluation_report/12",
    });
    expect(view?.items[4].remainingSeconds).toBe(0);
    expect(view?.totals).toEqual({
      movieCount: 2,
      movieSeconds: 35,
      remainingSeconds: 0,
      passedMovieCount: 2,
      testCount: 1,
      reportCount: 1,
      materialPassed: 2,
      materialTotal: 5,
      questionClear: 0,
      questionTotal: 0,
    });
    expect(view?.advanced).toBe(false);
  });

  test("filters required and supplement items before calculating totals", () => {
    const required = buildChapterView(response, 5, 31713, "required");
    const supplement = buildChapterView(response, 5, 31713, "supplement");
    expect(required?.items.map((item) => item.id)).toEqual([10, 11, 13, 14]);
    expect(required?.totals.reportCount).toBe(0);
    expect(supplement?.items.map((item) => item.id)).toEqual([12]);
    expect(supplement?.totals.movieCount).toBe(0);
    expect(supplement?.totals.reportCount).toBe(1);
  });

  test("handles malformed section fields and missing section arrays", () => {
    const view = buildChapterView(
      { chapter: { sections: [null, [], {}, { resource_type: "movie", length: -4 }] } },
      1,
      2,
      "all",
    );
    expect(view?.items).toHaveLength(2);
    expect(view?.items[0]).toMatchObject({
      id: 0,
      title: "",
      kind: "other",
      resourceType: "",
      path: "/courses/1/chapters/2//0",
    });
    expect(view?.items[1]).toMatchObject({ lengthSeconds: 0, playbackSeconds: 0 });
    expect(buildChapterView(null, 1, 2, "all")).toBeUndefined();
    expect(buildChapterView([], 1, 2, "all")).toBeUndefined();
    expect(buildChapterView({}, 1, 2, "all")).toBeUndefined();
    expect(buildChapterView({ chapter: { sections: null } }, 1, 2, "all")?.items).toEqual([]);
  });
});

describe("buildChapterView remaining time", () => {
  const movie = (passed: boolean, length: number, playback: number) => ({
    chapter: {
      id: 1,
      title: "章",
      sections: [
        {
          resource_type: "movie",
          id: 7,
          title: "m",
          passed,
          length,
          playback_position: playback,
          material_type: "main",
        },
      ],
    },
  });

  test("a movie the site has not marked passed counts the time still to watch", () => {
    expect(buildChapterView(movie(false, 300, 120), 1, 1, "all")?.items[0]?.remainingSeconds).toBe(
      180,
    );
  });

  test("a movie that has not been started (saved position -1) counts its whole length", () => {
    expect(buildChapterView(movie(false, 300, -1), 1, 1, "all")?.items[0]?.remainingSeconds).toBe(
      300,
    );
  });

  test("a finished movie with the saved position -1 has nothing left", () => {
    expect(buildChapterView(movie(true, 300, -1), 1, 1, "all")?.items[0]?.remainingSeconds).toBe(0);
  });
});
