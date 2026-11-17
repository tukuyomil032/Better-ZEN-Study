import { expect, test } from "bun:test";
import {
  chapterUrl,
  createTtlCache,
  fetchChapter,
  fetchChapterSections,
  fetchMonthly,
  monthlyUrl,
  ZenApiError,
} from "../src/lib/zen-api";
import { chapterResponse } from "./fixtures/chapter-31713";
import { completedMonthlyResponse } from "./fixtures/monthly-2026-6";
import { monthlyResponse } from "./fixtures/monthly-2026-12";

test("builds chapter and monthly API URLs", () => {
  expect(chapterUrl(2472, 31713)).toBe(
    "https://api.nnn.ed.nico/v2/material/courses/2472/chapters/31713?revision=1",
  );
  expect(monthlyUrl(2026, 12)).toBe(
    "https://api.nnn.ed.nico/v2/dashboard/report_progresses/monthly/2026/12?service=basic",
  );
  expect(() => monthlyUrl(2026, 13)).toThrow(RangeError);
  expect(() => monthlyUrl(2026, 1.5)).toThrow(RangeError);
  expect(() => chapterUrl(1.2, 2)).toThrow(RangeError);
});

test("includes credentials and parses chapter sections", async () => {
  let requestedUrl = "";
  let requestedCredentials: string | undefined;
  const fetchImpl = async (
    url: string,
    init?: { credentials?: "include" | "omit" | "same-origin" },
  ) => {
    requestedUrl = url;
    requestedCredentials = init?.credentials;
    return { ok: true, status: 200, json: async () => chapterResponse };
  };

  const sections = await fetchChapterSections(2472, 31713, fetchImpl);
  expect(requestedUrl).toContain("/courses/2472/chapters/31713");
  expect(requestedCredentials).toBe("include");
  expect(sections).toHaveLength(24);
});

test("returns the chapter title and defaults a missing title to an empty string", async () => {
  const chapter = await fetchChapter(2472, 31713, async () => ({
    ok: true,
    status: 200,
    json: async () => chapterResponse,
  }));
  expect(chapter.title).toBe("第9回");
  expect(chapter.sections).toHaveLength(24);

  const chapterWithoutTitle = await fetchChapter(2472, 31713, async () => ({
    ok: true,
    status: 200,
    json: async () => ({ chapter: { sections: chapterResponse.chapter.sections } }),
  }));
  expect(chapterWithoutTitle.title).toBe("");
});

test("reads an advanced chapter's materials from its headers, and marks the chapter advanced", async () => {
  const advancedChapter = {
    chapter: {
      id: 25167,
      title: "Lesson 3",
      class_headers: [
        {
          name: "section",
          sections: [
            {
              id: 1,
              title: "演習 1",
              resource_type: "exercise",
              content_url: "https://www.nnn.ed.nico/contents/links/1",
              progress: { comprehension: { limit: 1, bad: 0, good: 1, perfect: 0 } },
            },
            {
              id: 2,
              title: "解説動画",
              resource_type: "movie",
              content_url:
                "https://www.nnn.ed.nico:443/contents/courses/2036/chapters/25167/movies/2",
              length: 822,
              playback_position: 10,
              progress: { comprehension: { limit: 1, bad: 0, good: 0, perfect: 0 } },
            },
            { id: 3, title: "VR", resource_type: "vr_experience", content_url: "" },
          ],
        },
        {
          name: "lesson",
          sections: [{ id: 4, title: "授業", resource_type: "lesson" }],
        },
      ],
    },
  };
  const chapter = await fetchChapter(2036, 25167, async () => ({
    ok: true,
    status: 200,
    json: async () => advancedChapter,
  }));
  expect(chapter.advanced).toBe(true);
  expect(chapter.title).toBe("Lesson 3");
  expect(
    chapter.sections.map((section) => [section.id, section.passed, section.material_type]),
  ).toEqual([
    [1, true, "main"],
    [2, false, "main"],
    [3, false, "main"],
    [4, false, "main"],
  ]);
  expect(chapter.sections[1]).toMatchObject({ length: 822, playback_position: 10 });
  expect(chapter.sections[2]?.content_url).toBe("");
});

test("marks a basic chapter as not advanced", async () => {
  const chapter = await fetchChapter(2472, 31713, async () => ({
    ok: true,
    status: 200,
    json: async () => chapterResponse,
  }));
  expect(chapter.advanced).toBe(false);
});

test("throws for HTTP failures and malformed response shapes", async () => {
  const failedFetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await expect(fetchChapterSections(1, 2, failedFetch)).rejects.toBeInstanceOf(ZenApiError);
  await expect(
    fetchChapterSections(1, 2, async () => ({
      ok: true,
      status: 200,
      json: async () => ({ chapter: { sections: [{ id: 1 }] } }),
    })),
  ).rejects.toBeInstanceOf(ZenApiError);
  await expect(
    fetchMonthly(2026, 12, async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ...monthlyResponse, total_assessment_test: "1" }),
    })),
  ).rejects.toBeInstanceOf(ZenApiError);
});

test("validates monthly responses", async () => {
  const report = await fetchMonthly(2026, 12, async () => ({
    ok: true,
    status: 200,
    json: async () => monthlyResponse,
  }));
  expect(report.total_assessment_test).toBe(1);
  expect(report.deadline_groups[0]?.chapters).toHaveLength(11);
});

test("accepts completed-month fields and reports without completed chapters", async () => {
  const completedReport = await fetchMonthly(2026, 6, async () => ({
    ok: true,
    status: 200,
    json: async () => completedMonthlyResponse,
  }));
  expect(completedReport.completed_chapters).toHaveLength(2);
  expect(completedReport.passed_assessment_tests).toHaveLength(1);

  const reportWithoutCompletedChapters = Object.fromEntries(
    Object.entries(completedMonthlyResponse).filter(([key]) => key !== "completed_chapters"),
  );
  await expect(
    fetchMonthly(2026, 6, async () => ({
      ok: true,
      status: 200,
      json: async () => reportWithoutCompletedChapters,
    })),
  ).resolves.toMatchObject({ year: 2026, month: 6 });
});

test("rejects invalid completed-month fields", async () => {
  await expect(
    fetchMonthly(2026, 6, async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ...completedMonthlyResponse, completed_chapters: "invalid" }),
    })),
  ).rejects.toBeInstanceOf(ZenApiError);
});

test("expires TTL cache entries using the injected clock", () => {
  let time = 100;
  const cache = createTtlCache<string>(50, () => time);
  cache.set("chapter", "cached");
  expect(cache.get("chapter")).toBe("cached");
  time = 150;
  expect(cache.get("chapter")).toBeUndefined();
});
