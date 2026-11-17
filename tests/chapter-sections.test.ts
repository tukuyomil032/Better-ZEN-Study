import { describe, expect, test } from "bun:test";
import { chapterSections, findContentUrl, normalizeContentUrl } from "../src/lib/chapter-sections";

// The shape an advanced chapter returns: materials under class_headers, with comprehension progress.
const advancedChapter = {
  id: 20212,
  title: "頻出表現集",
  class_pattern_name: "exercise",
  class_headers: [
    {
      name: "section",
      label: "教材",
      sections: [
        {
          id: 1,
          title: "問題 1",
          resource_type: "exercise",
          content_url: "https://www.nnn.ed.nico/contents/links/325871?content_type=n-yobi",
          progress: { comprehension: { limit: 1, bad: 0, good: 1, perfect: 0 } },
        },
        {
          id: 2,
          title: "解説動画",
          resource_type: "movie",
          content_url: "https://www.nnn.ed.nico:443/contents/courses/2036/chapters/1/movies/2",
          length: 822,
          playback_position: 0,
          progress: { comprehension: { limit: 1, bad: 0, good: 0, perfect: 0 } },
        },
      ],
    },
    {
      name: "lesson",
      label: "授業",
      sections: [{ id: 3, title: "授業", resource_type: "lesson", progress: {} }],
    },
  ],
};

describe("chapterSections", () => {
  test("keeps a basic chapter's sections and their own passed flag", () => {
    const sections = chapterSections({
      sections: [{ id: 9, resource_type: "movie", passed: true, material_type: "supplement" }],
    });
    expect(sections).toEqual([
      expect.objectContaining({
        id: 9,
        header: "",
        material_type: "supplement",
        passed: true,
      }),
    ]);
  });

  test("flattens an advanced chapter's headers in order, with the header name on each material", () => {
    const sections = chapterSections(advancedChapter);
    expect(sections.map((section) => [section.header, section.id])).toEqual([
      ["section", 1],
      ["section", 2],
      ["lesson", 3],
    ]);
    expect(sections.every((section) => section.material_type === "main")).toBe(true);
  });

  test("reads an advanced material as passed once it is understood, and a lesson as not counted", () => {
    const [exercise, movie, lesson] = chapterSections(advancedChapter);
    expect(exercise).toMatchObject({ passed: true, hasProgress: true });
    expect(movie).toMatchObject({ passed: false, hasProgress: true });
    expect(lesson).toMatchObject({ passed: false, hasProgress: false });
  });

  test("counts a bad answer as not understood, and a guide that was read as understood", () => {
    const sections = chapterSections({
      class_headers: [
        {
          name: "section",
          sections: [
            {
              id: 1,
              resource_type: "exercise",
              progress: { comprehension: { limit: 1, bad: 1, good: 0, perfect: 0 } },
            },
            {
              id: 2,
              resource_type: "guide",
              progress: { comprehension: { limit: 1, bad: 0, good: 1, perfect: 0 } },
            },
          ],
        },
      ],
    });
    expect(sections.map((section) => section.passed)).toEqual([false, true]);
  });

  test("ignores the site's checkpoint, which reads 1 of 1 whatever has been studied", () => {
    const [guide] = chapterSections({
      class_headers: [
        {
          name: "section",
          sections: [
            {
              id: 5,
              resource_type: "guide",
              progress: {
                checkpoint: { total: 1, clear: 1 },
                comprehension: { limit: 1, bad: 0, good: 0, perfect: 0 },
              },
            },
          ],
        },
      ],
    });
    expect(guide).toMatchObject({ passed: false, hasProgress: true });
  });

  test("returns nothing for a chapter with neither sections nor headers", () => {
    expect(chapterSections({})).toEqual([]);
    expect(chapterSections({ class_headers: [null, { name: "x" }] })).toEqual([]);
  });
});

describe("normalizeContentUrl", () => {
  test("accepts the site's own https address, with or without its explicit port 443", () => {
    expect(
      normalizeContentUrl(
        "https://www.nnn.ed.nico:443/contents/courses/2036/chapters/1/movies/2?content_type=n-yobi",
      ),
    ).toBe("https://www.nnn.ed.nico/contents/courses/2036/chapters/1/movies/2?content_type=n-yobi");
    expect(normalizeContentUrl("https://www.nnn.ed.nico/contents/links/325871")).toBe(
      "https://www.nnn.ed.nico/contents/links/325871",
    );
  });

  test("refuses other hosts, other ports, other schemes, and empty values", () => {
    expect(normalizeContentUrl("https://example.com/contents/links/1")).toBeUndefined();
    expect(normalizeContentUrl("https://www.nnn.ed.nico:8443/contents/links/1")).toBeUndefined();
    expect(normalizeContentUrl("http://www.nnn.ed.nico/contents/links/1")).toBeUndefined();
    expect(normalizeContentUrl("")).toBeUndefined();
    expect(normalizeContentUrl(undefined)).toBeUndefined();
    expect(normalizeContentUrl("not a url")).toBeUndefined();
  });
});

describe("findContentUrl", () => {
  test("finds an advanced material by id and resource type, and returns its normalised address", () => {
    expect(findContentUrl({ chapter: advancedChapter }, 2, "movie")).toBe(
      "https://www.nnn.ed.nico/contents/courses/2036/chapters/1/movies/2",
    );
    expect(findContentUrl({ chapter: advancedChapter }, 1, "exercise")).toBe(
      "https://www.nnn.ed.nico/contents/links/325871?content_type=n-yobi",
    );
  });

  test("returns nothing for a material with the wrong type or no address", () => {
    expect(findContentUrl({ chapter: advancedChapter }, 1, "movie")).toBeUndefined();
    expect(findContentUrl({ chapter: advancedChapter }, 3, "lesson")).toBeUndefined();
    expect(findContentUrl(null, 1, "movie")).toBeUndefined();
  });
});
