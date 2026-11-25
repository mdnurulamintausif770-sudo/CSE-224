import type { StudentHealthDatabase } from "../types";

export const STANDARD_WELLNESS_DISCLAIMER =
  "General Health Guidance: This AI health advisor supports general wellness awareness only and does not replace an in-person licensed doctor, parent/guardian guidance, or urgent medical care.";

export const EMPTY_DATABASE: StudentHealthDatabase = {
  departments: [],
  users: [],
  students: [],
  stress_reports: [],
  stress_factors: [],
  report_factors: [],
  saved_routines: [],
};

export const SUGGESTED_FACTOR_TEMPLATES: Array<{
  factor_name: string;
  description: string;
}> = [
  {
    factor_name: "Exams",
    description: "Midterms, finals, quiz schedules, and performance pressure.",
  },
  {
    factor_name: "Workload",
    description: "Heavy assignments, lab deadlines, or overlapping coursework.",
  },
  {
    factor_name: "Lack of Sleep",
    description: "Short or irregular sleep schedule causing fatigue or poor focus.",
  },
  {
    factor_name: "Financial Strain",
    description: "Tuition, living expenses, or part-time work pressures.",
  },
  {
    factor_name: "Personal Issues",
    description: "Family, social, or personal wellbeing challenges.",
  },
];
