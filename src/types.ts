export type ActiveRole = "Student" | "Admin";

export type UserRole = "Admin" | "Student";

export interface Department {
  dept_id: string;
  dept_name: string;
  building: string;
  created_at: string;
}

export interface UserAccount {
  user_id: string;
  student_id: string | null;
  username: string;
  display_name?: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
}

export interface AdminGuardState {
  ip: string;
  clientKey: string;
  failedAttempts: number;
  maxAttempts: number;
  isBlocked: boolean;
  blockedUntil: number | null;
  remainingSeconds: number;
}

export interface AdminSettings {
  maxAdmins: number;
  maxLoginAttempts: number;
}

export interface Student {
  student_id: string;
  dept_id: string | null;
  dept_name?: string;
  user_id: string | null;
  name: string;
  email: string;
  semester: string;
  full_name: string;
  class_section: string;
  roll_no: string;
  age: number;
  created_at: string;
}

export type FeverStatus = "None" | "Mild" | "Moderate" | "High";

export interface StressReport {
  report_id: string;
  student_id: string;
  stress_level: number;
  submission_date: string;
  remarks: string;
  sleep_hours: number;
  water_intake: number;
  wellness_index: number;
  ai_assessment: string;
  actionable_tips?: string[];
  disclaimer?: string;
  temperature_f?: number | null;
  fever_status?: FeverStatus;
  symptoms?: string[];
  entry_source?: "survey" | "daily_tracker" | "stress_log";
  updated_at?: string;
}

export interface StressFactor {
  factor_id: string;
  factor_name: string;
  description: string;
  created_at: string;
}

export interface ReportFactor {
  report_id: string;
  factor_id: string;
}

export type RoutineMode = "fever_recovery" | "exam_balance";

export interface RoutineBlock {
  id: string;
  timeWindow: string;
  activity: string;
  detail: string;
  category: "rest" | "hydration" | "nutrition" | "study" | "check";
  completed?: boolean;
}

export interface SavedRoutine {
  routine_id: string;
  student_id: string;
  mode: RoutineMode;
  title: string;
  focus_summary: string;
  pinned: boolean;
  created_at: string;
  blocks: RoutineBlock[];
  disclaimer: string;
}

export interface SurveyMessage {
  id: string;
  role: "assistant" | "student";
  text: string;
  timestamp: string;
}

export interface ExtractedSurveyMetrics {
  sleep_hours: number | null;
  water_intake: number | null;
  stress_score: number | null;
}

export interface SurveyFinalAnalysis {
  sleep_hours: number;
  water_intake: number;
  stress_score: number;
  wellness_index: number;
  student_opinion: string;
  ai_assessment: string;
  actionable_tips: string[];
  disclaimer: string;
}

export type ActiveTab =
  | "survey"
  | "consultation"
  | "tracker"
  | "guide"
  | "routine"
  | "telemetry"
  | "analytics"
  | "students"
  | "admin"
  | "relational";

export interface StudentHealthDatabase {
  departments: Department[];
  users: UserAccount[];
  students: Student[];
  stress_reports: StressReport[];
  stress_factors: StressFactor[];
  report_factors: ReportFactor[];
  saved_routines: SavedRoutine[];
}
