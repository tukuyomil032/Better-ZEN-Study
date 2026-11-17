// One flat list of a chapter's materials, whichever shape the site returned them in.
//
// Required (basic) chapters keep their materials in `chapter.sections`, with `passed` and
// `material_type`. Advanced chapters have no `sections`: their materials sit in
// `chapter.class_headers[].sections[]`, and they report progress as `progress.comprehension`
// (good or perfect means understood). The site's `progress.checkpoint` is not used for that: it
// reads 1 of 1 for almost every advanced material. Pure functions only, so the rules can be tested
// without the site.

export type UnknownRecord = Record<string, unknown>;

export type ChapterMaterial = UnknownRecord & {
  // The header the material came from: "section" (教材) or "lesson" (授業). Empty for basic chapters.
  header: string;
  material_type: string;
  passed: boolean;
  // False for a material that carries no progress at all, such as a lesson. It is not shown as
  // "not yet" in that case, because it was never counted.
  hasProgress: boolean;
};

export function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// The comprehension of an advanced material: how many of its counted units are understood. A
// material with no comprehension record (a lesson) has no progress to read.
function comprehensionOf(progress: unknown): UnknownRecord | undefined {
  return asRecord(asRecord(progress)?.comprehension);
}

// An advanced material is done once any of its units is understood (good or perfect).
function comprehensionDone(progress: unknown): boolean {
  const comprehension = comprehensionOf(progress);
  if (!comprehension) return false;
  return numberValue(comprehension.good) + numberValue(comprehension.perfect) > 0;
}

function withDefaults(section: UnknownRecord, header: string): ChapterMaterial {
  const ownPassed = typeof section.passed === "boolean" ? section.passed : undefined;
  const comprehension = comprehensionOf(section.progress);
  const hasComprehension = comprehension !== undefined && numberValue(comprehension.limit) > 0;
  return {
    ...section,
    header,
    material_type: typeof section.material_type === "string" ? section.material_type : "main",
    passed: ownPassed ?? comprehensionDone(section.progress),
    hasProgress: ownPassed !== undefined || hasComprehension,
  };
}

// Every material of a chapter, in the order the site lists them.
export function chapterSections(chapter: UnknownRecord): ChapterMaterial[] {
  if (Array.isArray(chapter.sections)) {
    return chapter.sections
      .map(asRecord)
      .filter((section): section is UnknownRecord => section !== undefined)
      .map((section) => withDefaults(section, ""));
  }

  const headers = Array.isArray(chapter.class_headers) ? chapter.class_headers : [];
  const materials: ChapterMaterial[] = [];
  for (const value of headers) {
    const header = asRecord(value);
    if (!header || !Array.isArray(header.sections)) continue;
    const name = typeof header.name === "string" ? header.name : "";
    for (const sectionValue of header.sections) {
      const section = asRecord(sectionValue);
      if (section) materials.push(withDefaults(section, name));
    }
  }
  return materials;
}

// The shape of a chapter response, without any of its values: the field names it has, and how many
// materials sit under each header. A diagnostic record uses this, so a report can show what the site
// returned without copying titles or addresses.
export function chapterShape(raw: unknown): {
  keys: string[];
  sections: number;
  headers: { name: string; sections: number }[];
} {
  const chapter = asRecord(asRecord(raw)?.chapter);
  if (!chapter) return { keys: [], sections: 0, headers: [] };
  const headers = Array.isArray(chapter.class_headers)
    ? chapter.class_headers
        .map(asRecord)
        .filter((header): header is UnknownRecord => header !== undefined)
        .map((header) => ({
          name: typeof header.name === "string" ? header.name : "(no name)",
          sections: Array.isArray(header.sections) ? header.sections.length : 0,
        }))
    : [];
  return {
    keys: Object.keys(chapter).sort(),
    sections: Array.isArray(chapter.sections) ? chapter.sections.length : 0,
    headers,
  };
}

// The address of a material's page, or undefined when it is not a site page we can show.
// The site writes its own port (:443) and a content_type query; both are kept or dropped by the
// URL parser, so the check is only on scheme, host, and port.
export function normalizeContentUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.hostname !== "www.nnn.ed.nico") return undefined;
  if (url.port !== "" && url.port !== "443") return undefined;
  return url.toString();
}

// Finds the one material this page shows and returns its address for the iframe.
export function findContentUrl(raw: unknown, id: number, resourceType: string): string | undefined {
  const chapter = asRecord(asRecord(raw)?.chapter);
  if (!chapter) return undefined;
  const section = chapterSections(chapter).find(
    (item) => item.id === id && item.resource_type === resourceType,
  );
  return normalizeContentUrl(section?.content_url);
}
