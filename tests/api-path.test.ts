import { describe, expect, test } from "bun:test";
import { isAllowedApiPath } from "../src/lib/messages";

describe("isAllowedApiPath", () => {
  test("accepts the dashboard and course paths the screens use", () => {
    expect(isAllowedApiPath("/v2/dashboard/report_progresses?service=basic")).toBe(true);
    expect(isAllowedApiPath("/v3/dashboard/my_courses?service=advanced&limit=20&offset=0")).toBe(
      true,
    );
    expect(isAllowedApiPath("/v2/material/courses/2466?revision=1")).toBe(true);
    expect(isAllowedApiPath("/v2/dashboard/report_progresses/monthly/2026/12?service=basic")).toBe(
      true,
    );
    expect(isAllowedApiPath("/v2/learning_amounts")).toBe(true);
  });

  test("refuses paths outside the read-only API versions", () => {
    expect(isAllowedApiPath("/v4/anything")).toBe(false);
    expect(isAllowedApiPath("/admin/users")).toBe(false);
    expect(isAllowedApiPath("v2/dashboard")).toBe(false);
  });

  test("refuses traversal, full URLs, and unexpected characters", () => {
    expect(isAllowedApiPath("/v2/../v1/users")).toBe(false);
    expect(isAllowedApiPath("https://evil.example/v2/x")).toBe(false);
    expect(isAllowedApiPath("/v2/x?next=https://evil.example")).toBe(false);
    expect(isAllowedApiPath("/v2/x y")).toBe(false);
    expect(isAllowedApiPath("/v2/x#frag")).toBe(false);
  });

  test("refuses very long paths", () => {
    expect(isAllowedApiPath(`/v2/${"a".repeat(400)}`)).toBe(false);
  });
});
