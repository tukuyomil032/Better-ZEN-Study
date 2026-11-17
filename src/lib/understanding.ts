// The "このステップを理解できましたか？" question that ZEN Study shows when a movie of an advanced
// chapter ends. The extension waits for the learner's own answer before it moves on, and it never
// picks an answer itself. The rules are pure: the page is read through a probe, and time through a
// clock, so the waiting can be tested without the site.

export type UnderstandingAnswer = "none" | "good" | "bad" | "skipped";

// What the page shows at this moment. A DOM probe is in domUnderstandingProbe below.
export type UnderstandingProbe = {
  // The "理解度を指定" footer is there. Only movies of advanced chapters have it.
  footerPresent(): boolean;
  // The question is on screen.
  modalOpen(): boolean;
  // The page's text. The site's confirmation toast appears in it for two seconds after an answer.
  pageText(): string;
};

export type UnderstandingClock = {
  now(): number;
  sleep(ms: number): Promise<void>;
};

export type UnderstandingTiming = {
  // How long the question may take to open after the movie ends. If it does not open, the learner
  // has answered it before, and the movie counts as done.
  appearMs: number;
  // After the question closes, how long its confirmation toast may take to appear. No toast means the
  // question was closed without an answer.
  toastMs: number;
  // The longest wait for any answer, so a forgotten question does not hold the movie forever.
  maxWaitMs: number;
  pollMs: number;
};

export const UNDERSTANDING_TIMING: UnderstandingTiming = {
  appearMs: 2000,
  toastMs: 1200,
  maxWaitMs: 20 * 60 * 1000,
  pollMs: 250,
};

export const FOOTER_LABEL = "理解度を指定";
export const MODAL_LABEL = "UnderstandingModal";

// The toast after a saved answer reads 「自信あり」を選択しました。 (the site puts a line break after the
// quoted word, so the match allows whitespace). The buttons alone ("自信あり") do not match.
const TOAST = /「(自信あり|自信なし)」\s*を選択しました/;

export function readUnderstandingToast(text: string): "good" | "bad" | undefined {
  const match = TOAST.exec(text);
  if (!match) return undefined;
  return match[1] === "自信あり" ? "good" : "bad";
}

// Waits for the learner's answer to a movie that has just ended.
//   none:    no question for this movie (a basic movie, or one already answered).
//   good:    「自信あり」 was saved.
//   bad:     「自信なし」 was saved.
//   skipped: the question was closed without an answer, or no answer came in time.
export async function waitForUnderstandingAnswer(
  probe: UnderstandingProbe,
  clock: UnderstandingClock,
  timing: UnderstandingTiming = UNDERSTANDING_TIMING,
): Promise<UnderstandingAnswer> {
  if (!probe.footerPresent()) return "none";

  const start = clock.now();
  let modalSeen = false;
  let closedAt: number | undefined;
  for (;;) {
    // The toast is checked first: it arrives in the same moment the question closes.
    const answer = readUnderstandingToast(probe.pageText());
    if (answer) return answer;

    const now = clock.now();
    const elapsed = now - start;
    if (elapsed >= timing.maxWaitMs) return "skipped";

    if (probe.modalOpen()) {
      modalSeen = true;
      closedAt = undefined;
    } else if (modalSeen) {
      closedAt ??= now;
      if (now - closedAt >= timing.toastMs) return "skipped";
    } else if (elapsed >= timing.appearMs) {
      return "none";
    }
    await clock.sleep(timing.pollMs);
  }
}

// The probe for a real page. It only reads, and never clicks.
export function domUnderstandingProbe(doc: Document): UnderstandingProbe {
  return {
    footerPresent: () =>
      Array.from(doc.querySelectorAll("button, [role='button']")).some(
        (element) => element.textContent?.trim() === FOOTER_LABEL,
      ),
    modalOpen: () => doc.querySelector(`[role="dialog"][aria-label="${MODAL_LABEL}"]`) !== null,
    pageText: () => doc.body?.textContent ?? "",
  };
}

// The clock of a real page.
export const wallClock: UnderstandingClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
