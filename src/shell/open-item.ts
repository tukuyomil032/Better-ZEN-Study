import type { ChapterItem } from "@/lib/views/chapter-view";
import { opensOnSite, type CourseChapterRow } from "@/lib/views/course-view";
import type { MonthOrigin } from "@/lib/trail";
import { navigate } from "./router";

// Opens one material. A lesson is the site's own page, so the shell hands over to it with a full
// page load. Movies, tests, reports, exercises and guides stay in the shell, and keep the month
// they were opened from (origin), so their trail still goes back to that month. Items with nothing
// to open do nothing.
export function openItem(item: ChapterItem, options: { origin?: MonthOrigin } = {}): void {
  if (!item.openable || !item.path) return;
  if (item.kind === "lesson") window.location.assign(item.path);
  else navigate(item.path, { origin: options.origin });
}

// Opens one row of a course list. A periodic test opens on the site's own page, with a full page
// load, because the site runs it (its face check and steps). A chapter or a short test stays in the
// shell.
export function openCourseRow(row: CourseChapterRow, options: { origin?: MonthOrigin } = {}): void {
  if (!row.path) return;
  if (opensOnSite(row.kind)) window.location.assign(row.path);
  else navigate(row.path, { origin: options.origin });
}
