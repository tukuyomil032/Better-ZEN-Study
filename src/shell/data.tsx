import { createContext, useContext } from "react";
import type { PlanSettings, StudyLog } from "@/lib/pace";

// The screens never call fetch themselves. They ask this function for a path such as
// "/v2/dashboard/report_progresses?service=basic". The extension supplies a transport that
// goes through the background (with the user's cookies); the development page supplies one
// that reads saved fixtures. Same screens, no login needed to work on them.
export type ApiGet = (path: string) => Promise<unknown>;

const notReady: ApiGet = async (path) => {
  throw new Error(`No API transport is set up for ${path}`);
};

export const ApiContext = createContext<ApiGet>(notReady);

export function useApi(): ApiGet {
  return useContext(ApiContext);
}

// The study record kept on this browser, with the plan the user set. Read through the
// background in the extension.
export type StudySnapshot = {
  log: StudyLog;
  plan: PlanSettings;
  includeSupplement: boolean;
};
export type StudyReader = () => Promise<StudySnapshot>;

const noStudy: StudyReader = async () => ({
  log: { days: {} },
  plan: {
    unit: "day",
    hours: 0,
    startDate: null,
    endDate: null,
    streakMinMinutes: 10,
    weekStartsOn: 1,
  },
  includeSupplement: false,
});

export const StudyContext = createContext<StudyReader>(noStudy);

export function useStudy(): StudyReader {
  return useContext(StudyContext);
}
