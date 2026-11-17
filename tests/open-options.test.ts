import { describe, expect, test } from "bun:test";
import { isMessage, OPTIONS_TABS } from "../src/lib/messages";

describe("open-options message", () => {
  test("accepts the settings page sections, including the report section", () => {
    for (const tab of OPTIONS_TABS) {
      expect(isMessage({ type: "open-options", tab })).toBe(true);
    }
    expect(OPTIONS_TABS).toContain("report");
    expect(OPTIONS_TABS).toContain("autoplay");
  });

  test("refuses any other section, so the message cannot open an arbitrary page", () => {
    expect(isMessage({ type: "open-options", tab: "../secret" })).toBe(false);
    expect(isMessage({ type: "open-options", tab: "" })).toBe(false);
    expect(isMessage({ type: "open-options" })).toBe(false);
    expect(isMessage({ type: "open-options", tab: 3 })).toBe(false);
  });
});
