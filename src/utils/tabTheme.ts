import type { ActiveTab } from "../types";

export type TabThemeKey =
  | "survey"
  | "consultation"
  | "tracker"
  | "guide"
  | "routine"
  | "dbms";

export interface TabThemeConfig {
  id: ActiveTab;
  themeKey: TabThemeKey;
  title: string;
  subtitle: string;
  paletteName: string;
  primaryHex: string;
  secondaryHex: string;
  dotClass: string;
}

export const TAB_THEMES: Record<ActiveTab, TabThemeConfig> = {
  survey: {
    id: "survey",
    themeKey: "survey",
    title: "Survey & Entry",
    subtitle: "Student Details & Adaptive Health Intake",
    paletteName: "Futuristic Purple",
    primaryHex: "#a855f7",
    secondaryHex: "#c084fc",
    dotClass: "bg-[#a855f7]",
  },
  consultation: {
    id: "consultation",
    themeKey: "consultation",
    title: "Doctor Chat",
    subtitle: "Multilingual Doctor-Style Advisor & Dictation",
    paletteName: "Futuristic Light Blue / Cyan",
    primaryHex: "#38bdf8",
    secondaryHex: "#7dd3fc",
    dotClass: "bg-[#38bdf8]",
  },
  tracker: {
    id: "tracker",
    themeKey: "tracker",
    title: "Daily Health & Fever Tracker",
    subtitle: "Temperature Logs, Recovery Trends & AI Trend Analysis",
    paletteName: "Futuristic Teal / Aqua",
    primaryHex: "#2dd4bf",
    secondaryHex: "#5eead4",
    dotClass: "bg-[#2dd4bf]",
  },
  guide: {
    id: "guide",
    themeKey: "guide",
    title: "Symptom & First-Aid Guide",
    subtitle: "Interactive Care Checklists & Multilingual AI Helper",
    paletteName: "Futuristic Emerald / Mint",
    primaryHex: "#34d399",
    secondaryHex: "#6ee7b7",
    dotClass: "bg-[#34d399]",
  },
  routine: {
    id: "routine",
    themeKey: "routine",
    title: "Wellness & Recovery Routine",
    subtitle: "AI-Tailored Daily Schedule & Pinned Care Plans",
    paletteName: "Futuristic Soft Violet-Blue",
    primaryHex: "#818cf8",
    secondaryHex: "#a5b4fc",
    dotClass: "bg-[#818cf8]",
  },
  telemetry: {
    id: "telemetry",
    themeKey: "dbms",
    title: "Stress Reports",
    subtitle: "Filter, Edit & Inspect stress_reports + Factors",
    paletteName: "Futuristic Magenta-Purple",
    primaryHex: "#e879f9",
    secondaryHex: "#c084fc",
    dotClass: "bg-[#e879f9]",
  },
  analytics: {
    id: "analytics",
    themeKey: "dbms",
    title: "Analytics & Alerts",
    subtitle: "Chronological Trends, Factor Counts & High-Stress Alerts",
    paletteName: "Futuristic Magenta-Purple",
    primaryHex: "#e879f9",
    secondaryHex: "#c084fc",
    dotClass: "bg-[#e879f9]",
  },
  students: {
    id: "students",
    themeKey: "dbms",
    title: "Students Directory",
    subtitle: "Primary Entity Management (students)",
    paletteName: "Futuristic Magenta-Purple",
    primaryHex: "#e879f9",
    secondaryHex: "#c084fc",
    dotClass: "bg-[#e879f9]",
  },
  admin: {
    id: "admin",
    themeKey: "dbms",
    title: "Admin Panel",
    subtitle: "Student Problem Inspector & Chronological Submissions",
    paletteName: "Futuristic Magenta-Purple",
    primaryHex: "#e879f9",
    secondaryHex: "#c084fc",
    dotClass: "bg-[#e879f9]",
  },
  relational: {
    id: "relational",
    themeKey: "dbms",
    title: "Schema & Export",
    subtitle: "Relational Queries, JSON & CSV Export",
    paletteName: "Futuristic Magenta-Purple",
    primaryHex: "#e879f9",
    secondaryHex: "#c084fc",
    dotClass: "bg-[#e879f9]",
  },
};

export function getTabTheme(tab: ActiveTab): TabThemeConfig {
  return TAB_THEMES[tab];
}
