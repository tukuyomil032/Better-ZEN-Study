import { storage } from "wxt/utils/storage";
import { addStudySeconds, parseStudyLog, pruneStudyLog, type StudyLog } from "./pace";

// The per-day study record, kept in extension storage. Writes go through one chain so two
// flushes from different frames never overwrite each other.
export const studyLogItem = storage.defineItem<StudyLog>("local:study-log", {
  fallback: { days: {} },
});

let writeChain: Promise<unknown> = Promise.resolve();

// The tracker already drops seeks step by step, so the amount that arrives here is trusted.
export function addStudy(seconds: number): Promise<void> {
  const run = writeChain.then(async () => {
    const now = new Date();
    const current = parseStudyLog(await studyLogItem.getValue());
    const next = pruneStudyLog(
      addStudySeconds(current, now, seconds, Number.POSITIVE_INFINITY),
      now,
    );
    await studyLogItem.setValue(next);
  });
  writeChain = run.catch(() => undefined);
  return run;
}

export async function readStudyLog(): Promise<StudyLog> {
  return parseStudyLog(await studyLogItem.getValue());
}
