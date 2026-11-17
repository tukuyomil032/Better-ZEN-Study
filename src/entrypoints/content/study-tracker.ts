import { sendToBackground } from "../../lib/context-safety";

// Counts the video time that actually plays, in video seconds, so a double-speed viewing
// counts as the length of the video. A step larger than STEP_LIMIT_SECONDS is a seek and is
// not counted. The counted time is sent to the background every FLUSH_MS, and whenever the
// video pauses, ends, or the page goes away.
const STEP_LIMIT_SECONDS = 2.5;
const FLUSH_MS = 15_000;

export function startStudyTracker(video: HTMLVideoElement): () => void {
  let last = video.currentTime;
  let pending = 0;

  const flush = () => {
    if (pending <= 0) return;
    const seconds = pending;
    pending = 0;
    void sendToBackground({ type: "study-add", seconds });
  };

  const onTimeUpdate = () => {
    const now = video.currentTime;
    const step = now - last;
    last = now;
    if (video.paused || video.seeking) return;
    if (step > 0 && step <= STEP_LIMIT_SECONDS) pending += step;
  };

  const onSeeking = () => {
    last = video.currentTime;
  };

  const timer = window.setInterval(flush, FLUSH_MS);
  video.addEventListener("timeupdate", onTimeUpdate);
  video.addEventListener("seeking", onSeeking);
  video.addEventListener("pause", flush);
  video.addEventListener("ended", flush);
  window.addEventListener("pagehide", flush);

  return () => {
    window.clearInterval(timer);
    video.removeEventListener("timeupdate", onTimeUpdate);
    video.removeEventListener("seeking", onSeeking);
    video.removeEventListener("pause", flush);
    video.removeEventListener("ended", flush);
    window.removeEventListener("pagehide", flush);
    flush();
  };
}
