import { expect, test } from "bun:test";
import { shouldOpenIssueTab } from "../src/lib/github-issue";

// The settings page opens the issue tab only when the background has not already opened one.
test("does not open a second issue tab when the background opened one", () => {
  expect(shouldOpenIssueTab({ ok: true, opened: true })).toBe(false);
  expect(shouldOpenIssueTab({ ok: true, opened: true, reason: "login" })).toBe(false);
});

test("opens the tab itself when the background did not open one", () => {
  expect(shouldOpenIssueTab({ ok: true, opened: false, reason: "permission" })).toBe(true);
  expect(shouldOpenIssueTab(undefined)).toBe(true);
  expect(shouldOpenIssueTab({ ok: false })).toBe(true);
});
