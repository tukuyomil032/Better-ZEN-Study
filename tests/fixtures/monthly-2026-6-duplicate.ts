import type { MonthlyReport } from "../../src/lib/zen-api";
import { completedMonthlyResponse } from "./monthly-2026-6";

export const duplicateMonthlyResponse: MonthlyReport = {
  ...completedMonthlyResponse,
  deadline_groups: [
    {
      deadline: "2026-06-30",
      assessment_tests: [],
      chapters: [
        {
          course_id: 2472,
          chapter_id: 31713,
          subject_category_title: "地理探究",
          course_title: "地理探究",
          chapter_title: "Deadline version",
          total_count: 23,
          passed_count: 23,
          exempted: false,
        },
      ],
    },
  ],
};
