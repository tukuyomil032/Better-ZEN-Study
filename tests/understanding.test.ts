import { describe, expect, test } from "bun:test";
import {
  readUnderstandingToast,
  UNDERSTANDING_TIMING,
  waitForUnderstandingAnswer,
  type UnderstandingProbe,
} from "../src/lib/understanding";

// A clock that only moves when the code sleeps, and a page whose state depends on that time.
function scriptedPage(script: (t: number) => { footer?: boolean; modal?: boolean; text?: string }) {
  let t = 0;
  const probe: UnderstandingProbe = {
    footerPresent: () => script(t).footer ?? true,
    modalOpen: () => script(t).modal ?? false,
    pageText: () => script(t).text ?? "",
  };
  const clock = {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
  return { probe, clock, elapsed: () => t };
}

const SAVED_GOOD = "「自信あり」\nを選択しました。";
const SAVED_BAD = "「自信なし」を選択しました。";

describe("readUnderstandingToast", () => {
  test("reads the confirmation the site shows after a saved answer", () => {
    expect(readUnderstandingToast(SAVED_GOOD)).toBe("good");
    expect(readUnderstandingToast(SAVED_BAD)).toBe("bad");
  });

  test("ignores the buttons and the failure message, which are not an answer", () => {
    expect(readUnderstandingToast("自信あり 自信なし")).toBeUndefined();
    expect(readUnderstandingToast("理解度の送信に失敗しました。")).toBeUndefined();
    expect(readUnderstandingToast("")).toBeUndefined();
  });
});

describe("waitForUnderstandingAnswer", () => {
  test("a basic movie has no footer, so there is nothing to wait for", async () => {
    const page = scriptedPage(() => ({ footer: false }));
    await expect(waitForUnderstandingAnswer(page.probe, page.clock)).resolves.toBe("none");
    expect(page.elapsed()).toBe(0);
  });

  test("a movie answered before has a footer but no question, so it is done after the short wait", async () => {
    const page = scriptedPage(() => ({ footer: true, modal: false }));
    await expect(waitForUnderstandingAnswer(page.probe, page.clock)).resolves.toBe("none");
    expect(page.elapsed()).toBeGreaterThanOrEqual(UNDERSTANDING_TIMING.appearMs);
    expect(page.elapsed()).toBeLessThan(UNDERSTANDING_TIMING.appearMs + 1000);
  });

  test("the learner's 「自信あり」 comes back as good, and nothing moves before it", async () => {
    // The question opens shortly after the end. The answer is saved at 3000 ms: the question closes and the toast appears at once.
    const page = scriptedPage((t) => ({
      modal: t >= 500 && t < 3000,
      text: t >= 3000 && t < 5000 ? SAVED_GOOD : "",
    }));
    await expect(waitForUnderstandingAnswer(page.probe, page.clock)).resolves.toBe("good");
    expect(page.elapsed()).toBe(3000);
  });

  test("「自信なし」 comes back as bad", async () => {
    const page = scriptedPage((t) => ({
      modal: t >= 500 && t < 2500,
      text: t >= 2500 && t < 4500 ? SAVED_BAD : "",
    }));
    await expect(waitForUnderstandingAnswer(page.probe, page.clock)).resolves.toBe("bad");
  });

  test("a question closed without an answer is skipped, once no toast follows", async () => {
    const page = scriptedPage((t) => ({ modal: t >= 500 && t < 2000 }));
    await expect(waitForUnderstandingAnswer(page.probe, page.clock)).resolves.toBe("skipped");
    // Closed at 2000 ms; the toast had the 1200 ms the timing allows.
    expect(page.elapsed()).toBeGreaterThanOrEqual(2000 + UNDERSTANDING_TIMING.toastMs);
  });

  test("a failed save reopens the question, and the answer is still waited for", async () => {
    // Closed briefly (shorter than the toast window) after a failed save, then reopened and answered.
    const page = scriptedPage((t) => ({
      modal: (t >= 500 && t < 1000) || (t >= 1500 && t < 2500),
      text: t >= 2500 && t < 4500 ? SAVED_GOOD : "",
    }));
    await expect(waitForUnderstandingAnswer(page.probe, page.clock)).resolves.toBe("good");
  });

  test("a question that is never answered gives up at the longest wait", async () => {
    const page = scriptedPage(() => ({ modal: true }));
    const timing = { ...UNDERSTANDING_TIMING, maxWaitMs: 10_000 };
    await expect(waitForUnderstandingAnswer(page.probe, page.clock, timing)).resolves.toBe(
      "skipped",
    );
    expect(page.elapsed()).toBeGreaterThanOrEqual(10_000);
    expect(page.elapsed()).toBeLessThan(10_000 + timing.pollMs + 1);
  });
});
