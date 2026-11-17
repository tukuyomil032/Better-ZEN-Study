import { expect, test } from "bun:test";
import { pickNext } from "../src/lib/next-target";
import { chapterSections } from "./fixtures/chapter-31713";

const sections = chapterSections.map(({ id, resource_type, material_type, passed }) => ({
  id,
  resource_type,
  material_type,
  passed,
}));

test("stops at the first assessment when skipping watched movies", () => {
  expect(pickNext(sections, 46100, { skipWatched: true, includeSupplement: false })).toEqual({
    kind: "stop",
    index: 6,
    resourceType: "evaluation_test",
    id: 7186,
  });
});

test("plays the next watched movie when skipWatched is disabled", () => {
  expect(pickNext(sections, 46100, { skipWatched: false, includeSupplement: false })).toEqual({
    kind: "movie",
    index: 2,
    id: 46101,
  });
});

test("skips the optional supplement and stops at the next test by default", () => {
  expect(pickNext(sections, 46302, { skipWatched: true, includeSupplement: false })).toEqual({
    kind: "stop",
    index: 14,
    resourceType: "evaluation_test",
    id: 7187,
  });
});

test("includes the optional supplement when requested", () => {
  expect(pickNext(sections, 46302, { skipWatched: true, includeSupplement: true })).toEqual({
    kind: "movie",
    index: 13,
    id: 46500,
  });
});

test("returns null when the current movie is missing", () => {
  expect(pickNext(sections, 99999, { skipWatched: true, includeSupplement: false })).toBeNull();
});

// An advanced chapter, in the order the site lists its materials: guides and movies mixed with
// practice problems, and lessons that are never played.
const advancedSections = [
  { id: 1, resource_type: "guide", material_type: "main", passed: false },
  { id: 2, resource_type: "movie", material_type: "main", passed: false },
  { id: 3, resource_type: "exercise", material_type: "main", passed: false },
  { id: 4, resource_type: "guide", material_type: "main", passed: false },
  { id: 5, resource_type: "movie", material_type: "main", passed: false },
  { id: 6, resource_type: "exercise", material_type: "main", passed: false },
  { id: 7, resource_type: "movie", material_type: "main", passed: false },
  { id: 8, resource_type: "lesson", material_type: "main", passed: false },
];

test("an advanced chapter stops at the first practice problem after a movie, past the guide", () => {
  expect(pickNext(advancedSections, 2, { skipWatched: true, includeSupplement: false })).toEqual({
    kind: "stop",
    index: 2,
    resourceType: "exercise",
    id: 3,
  });
});

test("an advanced chapter plays the next movie when no practice problem comes first", () => {
  const movieThenMovie = [
    { id: 10, resource_type: "movie", material_type: "main", passed: false },
    { id: 11, resource_type: "movie", material_type: "main", passed: false },
  ];
  expect(pickNext(movieThenMovie, 10, { skipWatched: true, includeSupplement: false })).toEqual({
    kind: "movie",
    index: 1,
    id: 11,
  });
});

test("an advanced chapter stops at a practice problem that sits between two movies", () => {
  expect(pickNext(advancedSections, 5, { skipWatched: true, includeSupplement: false })).toEqual({
    kind: "stop",
    index: 5,
    resourceType: "exercise",
    id: 6,
  });
});
