import type { TestArrivalKind, TestArrivalResourceType } from "./messages";

export type ArrivalNotificationInput = {
  kind: TestArrivalKind;
  resourceType: TestArrivalResourceType;
  chapterTitle: string | undefined;
  resourceTitle: string | undefined;
  subjectTitle: string | undefined;
};

export function formatArrivalNotification(input: ArrivalNotificationInput): {
  title: string;
  message: string;
} {
  const title =
    input.kind === "test"
      ? "テストの画面に来ました"
      : input.kind === "exercise"
        ? "演習の画面に来ました"
        : "レポートの画面に来ました";
  const subjectTitle = input.subjectTitle?.trim();
  const chapterTitle = input.chapterTitle?.trim();
  const resourceTitle = input.resourceTitle?.trim();
  const chapterLine = [subjectTitle, chapterTitle].filter(Boolean).join(" / ");
  const message = [chapterLine, resourceTitle].filter(Boolean).join("\n") || "ZEN Study";

  return { title, message };
}

export function parseSubjectFromPageTitle(pageTitle: string): string | undefined {
  try {
    const suffix = " - ZEN Study";
    const trimmed = pageTitle.trim();
    const withoutSuffix = trimmed.endsWith(suffix)
      ? trimmed.slice(0, -suffix.length).trimEnd()
      : trimmed;
    const firstSpace = withoutSuffix.indexOf(" ");
    if (firstSpace <= 0) return undefined;
    return withoutSuffix.slice(0, firstSpace).trim() || undefined;
  } catch {
    return undefined;
  }
}
