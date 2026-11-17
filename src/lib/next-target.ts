export type NextSection = {
  id: number;
  resource_type: string;
  material_type: string;
  passed: boolean;
};

export type NextTarget =
  | { kind: "movie"; index: number; id: number }
  | { kind: "stop"; index: number; resourceType: string; id: number }
  | null;

// Where autoplay pauses: a test, a report, or a practice problem. A practice problem only occurs in
// an advanced chapter, so the same rule serves both kinds of chapter. Guides and lessons are passed
// over.
const STOP_RESOURCE_TYPES = new Set([
  "evaluation_test",
  "essay_test",
  "evaluation_report",
  "essay_report",
  "exercise",
]);

export function pickNext(
  sections: readonly NextSection[],
  currentMovieId: number,
  options: { skipWatched: boolean; includeSupplement: boolean },
): NextTarget {
  const currentIndex = sections.findIndex(
    (section) => section.id === currentMovieId && section.resource_type === "movie",
  );
  if (currentIndex < 0) return null;

  for (let index = currentIndex + 1; index < sections.length; index += 1) {
    const section = sections[index]!;
    if (STOP_RESOURCE_TYPES.has(section.resource_type)) {
      return {
        kind: "stop",
        index,
        resourceType: section.resource_type,
        id: section.id,
      };
    }

    if (section.resource_type !== "movie") continue;
    if (section.material_type === "supplement" && !options.includeSupplement) continue;
    if (section.passed && options.skipWatched) continue;
    return { kind: "movie", index, id: section.id };
  }

  return null;
}
