import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ClipboardList, Cpu, Lock, Menu, Shield } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { AdminPanel } from "./components/AdminPanel";
import { AnalyticsInsights } from "./components/AnalyticsInsights";
import { CosmicBackground } from "./components/CosmicBackground";
import { DailyHealthTracker } from "./components/DailyHealthTracker";
import { OrbLauncher } from "./components/OrbLauncher";
import { RecordInspectorModal } from "./components/RecordInspectorModal";
import { RecoveryRoutineTab } from "./components/RecoveryRoutineTab";
import { RelationalExplorer } from "./components/RelationalExplorer";
import { Sidebar } from "./components/Sidebar";
import { StudentsDirectory } from "./components/StudentsDirectory";
import { SymptomGuideTab } from "./components/SymptomGuideTab";
import { TelemetryDashboard } from "./components/TelemetryDashboard";
import { TextSurveyConsole } from "./components/TextSurveyConsole";
import { WelcomeOverlay } from "./components/WelcomeOverlay";
import type {
  ActiveRole,
  ActiveTab,
  AdminSettings,
  FeverStatus,
  RoutineBlock,
  RoutineMode,
  SavedRoutine,
  StressFactor,
  StressReport,
  Student,
  StudentHealthDatabase,
  UserAccount,
  UserRole,
} from "./types";
import {
  clearDatabase,
  deleteDepartment,
  deleteStressFactor,
  deleteStressReport,
  deleteStudent,
  deleteUser,
  generateNextRoutineId,
  getAdminCount,
  insertDepartment,
  insertStressFactor,
  insertStressReport,
  insertStudent,
  insertUser,
  loadAdminSettings,
  loadDatabase,
  resetAdminSettings,
  saveAdminSettings,
  saveDatabase,
  updateDepartment,
  updateStressReport,
  updateStudent,
  updateUser,
  validateAndRestoreBackup,
} from "./utils/dbStorage";
import type { PendingStudentProfile } from "./utils/surveyHelpers";
import { getTabTheme } from "./utils/tabTheme";

export default function App() {
  const [db, setDb] = useState<StudentHealthDatabase>(() => loadDatabase());
  const [showOrbEntry, setShowOrbEntry] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("survey");
  const [activeRole, setActiveRole] = useState<ActiveRole>("Student");
  const [preferNewIntake, setPreferNewIntake] = useState(true);
  const [surveySessionKey, setSurveySessionKey] = useState(0);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => {
    const initial = loadDatabase();
    return initial.students[0]?.student_id ?? "";
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [inspectedReport, setInspectedReport] = useState<StressReport | null>(null);
  const [inspectedStudentId, setInspectedStudentId] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [authenticatedAdmin, setAuthenticatedAdmin] = useState<UserAccount | null>(null);
  const [showWelcomeOverlay, setShowWelcomeOverlay] = useState(false);
  const handleWelcomeComplete = useCallback(() => {
    setShowWelcomeOverlay(false);
  }, []);
  const [adminSettings, setAdminSettings] = useState<AdminSettings>(() =>
    loadAdminSettings(getAdminCount(loadDatabase()))
  );

  useEffect(() => {
    saveDatabase(db);
  }, [db]);

  useEffect(() => {
    if (!authenticatedAdmin) return;
    const stillValid = db.users.find(
      (u) => u.user_id === authenticatedAdmin.user_id && u.role === "Admin"
    );
    if (!stillValid) {
      setAuthenticatedAdmin(null);
    } else if (
      stillValid.username !== authenticatedAdmin.username ||
      stillValid.display_name !== authenticatedAdmin.display_name ||
      stillValid.password_hash !== authenticatedAdmin.password_hash
    ) {
      setAuthenticatedAdmin(stillValid);
    }
  }, [db.users, authenticatedAdmin]);

  useEffect(() => {
    if (!statusNotice) return;
    const timer = window.setTimeout(() => setStatusNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [statusNotice]);

  const STUDENT_TAB_SET = useMemo(
    () => new Set<ActiveTab>(["survey", "consultation", "tracker", "guide", "routine"]),
    []
  );
  const ADMIN_TAB_SET = useMemo(
    () => new Set<ActiveTab>(["admin", "telemetry", "analytics", "students", "relational"]),
    []
  );

  const effectiveTab: ActiveTab = useMemo(() => {
    if (activeRole === "Admin") {
      if (!authenticatedAdmin) return "admin";
      return ADMIN_TAB_SET.has(activeTab) ? activeTab : "admin";
    }
    return STUDENT_TAB_SET.has(activeTab) ? activeTab : "survey";
  }, [activeRole, authenticatedAdmin, activeTab, ADMIN_TAB_SET, STUDENT_TAB_SET]);

  const activeTheme = useMemo(() => getTabTheme(effectiveTab), [effectiveTab]);

  const activeStudent = useMemo(
    () => db.students.find((s) => s.student_id === selectedStudentId) ?? null,
    [db.students, selectedStudentId]
  );

  const inspectedStudent = useMemo(
    () => db.students.find((s) => s.student_id === inspectedStudentId) ?? null,
    [db.students, inspectedStudentId]
  );

  const inspectedStudentReports = useMemo(() => {
    if (!inspectedStudentId) return [];
    return db.stress_reports
      .filter((r) => r.student_id === inspectedStudentId)
      .sort((a, b) => b.submission_date.localeCompare(a.submission_date));
  }, [db.stress_reports, inspectedStudentId]);

  const linkedReportStudent = useMemo(() => {
    if (!inspectedReport) return null;
    return db.students.find((s) => s.student_id === inspectedReport.student_id) ?? null;
  }, [db.students, inspectedReport]);

  function resolveOrCreateDepartment(
    workingDb: StudentHealthDatabase,
    deptName?: string
  ): { db: StudentHealthDatabase; deptId: string | null } {
    const clean = deptName?.trim() ?? "";
    if (!clean) return { db: workingDb, deptId: null };
    const existing = workingDb.departments.find(
      (d) => d.dept_name.toLowerCase() === clean.toLowerCase()
    );
    if (existing) {
      return { db: workingDb, deptId: existing.dept_id };
    }
    const created = insertDepartment(workingDb, {
      dept_name: clean,
      building: "Main Campus",
    });
    if (created.ok && created.department) {
      return { db: created.db, deptId: created.department.dept_id };
    }
    return { db: workingDb, deptId: null };
  }

  // --- Department CRUD ---
  function handleAddDepartment(input: { dept_name: string; building: string }) {
    try {
      const res = insertDepartment(db, input);
      if (!res.ok) return { ok: false, error: res.error };
      setDb(res.db);
      setStatusNotice(`Added department ${res.department?.dept_id} (${res.department?.dept_name}).`);
      return { ok: true };
    } catch {
      return { ok: false, error: "Unable to add department." };
    }
  }

  function handleUpdateDepartment(deptId: string, input: { dept_name: string; building: string }) {
    try {
      const res = updateDepartment(db, deptId, input);
      if (!res.ok) return { ok: false, error: res.error };
      setDb(res.db);
      setStatusNotice(`Updated department ${deptId}.`);
      return { ok: true };
    } catch {
      return { ok: false, error: "Unable to update department." };
    }
  }

  function handleDeleteDepartment(deptId: string, cascadeUnlink = false) {
    try {
      const res = deleteDepartment(db, deptId, cascadeUnlink);
      if (!res.ok) {
        return { ok: false, error: res.error, linkedCount: res.linkedCount };
      }
      setDb(res.db);
      setStatusNotice(
        `Deleted department ${deptId}${
          res.linkedCount > 0 ? ` (unlinked ${res.linkedCount} student profile(s))` : ""
        }.`
      );
      return { ok: true, linkedCount: res.linkedCount };
    } catch {
      return { ok: false, error: "Unable to delete department." };
    }
  }

  // --- Admin Settings & Account Management ---
  function handleUpdateAdminSettings(next: Partial<AdminSettings>) {
    try {
      const currentAdminCount = getAdminCount(db);
      if (
        typeof next.maxAdmins === "number" &&
        Math.round(next.maxAdmins) < Math.max(1, currentAdminCount)
      ) {
        return {
          ok: false,
          error: `Admin limit cannot be lower than current registered admins (${currentAdminCount}).`,
          settings: adminSettings,
        };
      }
      const saved = saveAdminSettings({ ...adminSettings, ...next }, currentAdminCount);
      setAdminSettings(saved);
      setStatusNotice(
        `Saved admin settings (limit ${saved.maxAdmins} admins, lock after ${saved.maxLoginAttempts} failed attempt${saved.maxLoginAttempts === 1 ? "" : "s"}).`
      );
      return { ok: true, settings: saved };
    } catch {
      return { ok: false, error: "Unable to save admin settings.", settings: adminSettings };
    }
  }

  // --- User Account CRUD ---
  function handleAddUser(input: {
    username: string;
    display_name?: string;
    password_hash: string;
    role: UserRole;
    student_id?: string | null;
  }) {
    try {
      const res = insertUser(db, input, adminSettings.maxAdmins);
      if (!res.ok) return { ok: false, error: res.error };
      setDb(res.db);
      setStatusNotice(`Created user ${res.user?.user_id} (${res.user?.username}, ${res.user?.role}).`);
      return { ok: true };
    } catch {
      return { ok: false, error: "Unable to create user account." };
    }
  }

  function handleRegisterAdmin(input: {
    username: string;
    display_name: string;
    password_hash: string;
  }) {
    try {
      const res = insertUser(
        db,
        {
          username: input.username,
          display_name: input.display_name,
          password_hash: input.password_hash,
          role: "Admin",
          student_id: null,
        },
        adminSettings.maxAdmins
      );
      if (!res.ok || !res.user) {
        return { ok: false, error: res.error };
      }
      setDb(res.db);
      setStatusNotice(`Registered admin account ${res.user.username}.`);
      return { ok: true, user: res.user };
    } catch {
      return { ok: false, error: "Unable to register admin account." };
    }
  }

  function handleUpdateAdminAccount(
    userId: string,
    input: {
      username: string;
      display_name?: string;
      password_hash?: string;
    }
  ) {
    try {
      const res = updateUser(
        db,
        userId,
        {
          username: input.username,
          display_name: input.display_name,
          role: "Admin",
          student_id: null,
          password_hash: input.password_hash,
        },
        adminSettings.maxAdmins
      );
      if (!res.ok) return { ok: false, error: res.error };
      setDb(res.db);
      setStatusNotice(`Updated admin account ${input.username}.`);
      return { ok: true };
    } catch {
      return { ok: false, error: "Unable to update admin account." };
    }
  }

  function handleUpdateUser(
    userId: string,
    input: {
      username: string;
      display_name?: string;
      role: UserRole;
      student_id?: string | null;
      password_hash?: string;
    }
  ) {
    try {
      const res = updateUser(db, userId, input, adminSettings.maxAdmins);
      if (!res.ok) return { ok: false, error: res.error };
      setDb(res.db);
      setStatusNotice(`Updated user ${userId}.`);
      return { ok: true };
    } catch {
      return { ok: false, error: "Unable to update user account." };
    }
  }

  function handleDeleteUser(userId: string) {
    try {
      const isSelfAdmin = authenticatedAdmin?.user_id === userId;
      const res = deleteUser(db, userId);
      if (!res.ok) {
        setStatusNotice(res.error ?? "Unable to remove user account.");
        return { ok: false, error: res.error };
      }
      setDb(res.db);
      if (isSelfAdmin) {
        setAuthenticatedAdmin(null);
        setActiveTab("admin");
        setStatusNotice("Admin account removed and Admin Panel locked.");
      } else {
        setStatusNotice(`Removed user account ${userId}.`);
      }
      return { ok: true };
    } catch {
      setStatusNotice("Unable to remove user account.");
      return { ok: false, error: "Unable to remove user account." };
    }
  }

  // --- Student CRUD ---
  function handleAddStudent(input: {
    name: string;
    email?: string;
    semester?: string;
    dept_id?: string | null;
    dept_name?: string;
    class_section: string;
    roll_no: string;
    age: number;
  }) {
    try {
      const deptResolved = input.dept_name?.trim()
        ? resolveOrCreateDepartment(db, input.dept_name)
        : { db, deptId: input.dept_id ?? null };
      const res = insertStudent(deptResolved.db, {
        ...input,
        dept_id: deptResolved.deptId,
      });
      if (!res.ok || !res.student) return { ok: false, error: res.error };
      setDb(res.db);
      if (!selectedStudentId) {
        setSelectedStudentId(res.student.student_id);
      }
      setStatusNotice(`Registered student ${res.student.student_id} (${res.student.full_name}).`);
      return { ok: true, student: res.student };
    } catch {
      return { ok: false, error: "Unable to register student." };
    }
  }

  function handleUpdateStudent(
    studentId: string,
    input: {
      name: string;
      email?: string;
      semester?: string;
      dept_id?: string | null;
      dept_name?: string;
      class_section: string;
      roll_no: string;
      age: number;
    }
  ) {
    try {
      const deptResolved = input.dept_name?.trim()
        ? resolveOrCreateDepartment(db, input.dept_name)
        : { db, deptId: input.dept_id ?? null };
      const res = updateStudent(deptResolved.db, studentId, {
        ...input,
        dept_id: deptResolved.deptId,
      });
      if (!res.ok) return { ok: false, error: res.error };
      setDb(res.db);
      setStatusNotice(`Updated student ${studentId}.`);
      return { ok: true };
    } catch {
      return { ok: false, error: "Unable to update student." };
    }
  }

  function handleDeleteStudent(studentId: string) {
    try {
      const target = db.students.find((s) => s.student_id === studentId);
      const res = deleteStudent(db, studentId);
      setDb(res.db);

      if (selectedStudentId === studentId) {
        const fallback = res.db.students[0];
        setSelectedStudentId(fallback?.student_id ?? "");
      }
      if (inspectedStudentId === studentId) {
        setInspectedStudentId(null);
      }
      if (inspectedReport?.student_id === studentId) {
        setInspectedReport(null);
      }

      setStatusNotice(
        `Deleted ${target?.full_name ?? studentId}${
          res.cascadedReports > 0
            ? ` and cascaded ${res.cascadedReports} linked stress report(s)`
            : ""
        }.`
      );
    } catch {
      setStatusNotice("Unable to delete student record.");
    }
  }

  // --- Stress Factor CRUD ---
  function handleAddFactor(input: {
    factor_name: string;
    description: string;
  }): { ok: boolean; error?: string; factor?: StressFactor } {
    try {
      const res = insertStressFactor(db, input);
      if (!res.ok || !res.factor) return { ok: false, error: res.error };
      setDb(res.db);
      setStatusNotice(`Added stress factor ${res.factor.factor_id} (${res.factor.factor_name}).`);
      return { ok: true, factor: res.factor };
    } catch {
      return { ok: false, error: "Unable to add stress factor." };
    }
  }

  function handleDeleteFactor(factorId: string, cascade = false) {
    try {
      const res = deleteStressFactor(db, factorId, cascade);
      if (!res.ok) return { ok: false, error: res.error, refCount: res.refCount };
      setDb(res.db);
      setStatusNotice(
        `Deleted stress factor ${factorId}${
          res.refCount > 0 ? ` (removed ${res.refCount} bridge link(s))` : ""
        }.`
      );
      return { ok: true, refCount: res.refCount };
    } catch {
      return { ok: false, error: "Unable to delete stress factor." };
    }
  }

  // --- Stress Report + Student Atomic Commit / Revise / Delete ---
  function handleCommitSurveyWithStudent(payload: {
    studentProfile: PendingStudentProfile;
    reportInput: Omit<StressReport, "report_id" | "student_id"> & { factorIds?: string[] };
  }): { ok: boolean; error?: string; student?: Student; report?: StressReport } {
    try {
      const { studentProfile, reportInput } = payload;
      let workingDb = db;
      let targetStudent: Student | undefined;

      if (studentProfile.existingStudentId) {
        targetStudent = workingDb.students.find(
          (s) => s.student_id === studentProfile.existingStudentId
        );
      }

      if (!targetStudent) {
        const deptResolved = studentProfile.dept_name?.trim()
          ? resolveOrCreateDepartment(workingDb, studentProfile.dept_name)
          : { db: workingDb, deptId: studentProfile.dept_id ?? null };
        workingDb = deptResolved.db;

        const stuRes = insertStudent(workingDb, {
          name: studentProfile.full_name,
          email: studentProfile.email,
          semester: studentProfile.semester,
          dept_id: deptResolved.deptId,
          class_section: studentProfile.class_section,
          roll_no: studentProfile.roll_no,
          age: studentProfile.age,
        });
        if (!stuRes.ok || !stuRes.student) {
          return { ok: false, error: stuRes.error ?? "Unable to register student." };
        }
        workingDb = stuRes.db;
        targetStudent = stuRes.student;
      }

      const rptRes = insertStressReport(workingDb, {
        ...reportInput,
        student_id: targetStudent.student_id,
      });
      if (!rptRes.ok || !rptRes.report) {
        return { ok: false, error: rptRes.error ?? "Unable to insert stress report." };
      }

      setDb(rptRes.db);
      setSelectedStudentId(targetStudent.student_id);
      setStatusNotice(
        `Saved ${rptRes.report.report_id} for ${targetStudent.full_name} (${targetStudent.student_id}).`
      );

      return { ok: true, student: targetStudent, report: rptRes.report };
    } catch {
      return { ok: false, error: "Unexpected error while saving stress report." };
    }
  }

  function handleUpdateReport(
    reportId: string,
    updates: {
      stress_level: number;
      submission_date: string;
      remarks: string;
      sleep_hours?: number;
      water_intake?: number;
      temperature_f?: number | null;
      fever_status?: FeverStatus;
      factorIds?: string[];
    }
  ) {
    try {
      const res = updateStressReport(db, reportId, updates);
      if (!res.ok || !res.report) return { ok: false, error: res.error };
      setDb(res.db);
      if (inspectedReport?.report_id === reportId) {
        setInspectedReport(res.report);
      }
      setStatusNotice(`Updated ${reportId} in stress_reports.`);
      return { ok: true };
    } catch {
      return { ok: false, error: "Unable to revise stress report." };
    }
  }

  function handleDeleteReport(reportId: string) {
    try {
      const res = deleteStressReport(db, reportId);
      setDb(res.db);
      if (inspectedReport?.report_id === reportId) {
        setInspectedReport(null);
      }
      setStatusNotice(`Deleted report ${reportId} from stress_reports.`);
    } catch {
      setStatusNotice("Unable to delete report.");
    }
  }

  // --- Saved Recovery Routines ---
  function handleSaveRoutine(payload: {
    studentId: string;
    mode: RoutineMode;
    title: string;
    focus_summary: string;
    blocks: RoutineBlock[];
    disclaimer: string;
  }): SavedRoutine {
    const routine: SavedRoutine = {
      routine_id: generateNextRoutineId(db.saved_routines),
      student_id: payload.studentId,
      mode: payload.mode,
      title: payload.title,
      focus_summary: payload.focus_summary,
      pinned: true,
      created_at: new Date().toISOString().slice(0, 10),
      blocks: payload.blocks,
      disclaimer: payload.disclaimer,
    };
    setDb((prev) => ({
      ...prev,
      saved_routines: [routine, ...prev.saved_routines],
    }));
    setStatusNotice(`Saved and pinned routine ${routine.routine_id}.`);
    return routine;
  }

  function handleTogglePinRoutine(routineId: string) {
    setDb((prev) => ({
      ...prev,
      saved_routines: prev.saved_routines.map((r) =>
        r.routine_id === routineId ? { ...r, pinned: !r.pinned } : r
      ),
    }));
  }

  function handleToggleRoutineBlock(routineId: string, blockId: string) {
    setDb((prev) => ({
      ...prev,
      saved_routines: prev.saved_routines.map((r) =>
        r.routine_id === routineId
          ? {
              ...r,
              blocks: r.blocks.map((b) =>
                b.id === blockId ? { ...b, completed: !b.completed } : b
              ),
            }
          : r
      ),
    }));
  }

  function handleDeleteRoutine(routineId: string) {
    setDb((prev) => ({
      ...prev,
      saved_routines: prev.saved_routines.filter((r) => r.routine_id !== routineId),
    }));
    setStatusNotice(`Removed routine ${routineId}.`);
  }

  // --- Backup Restore & Clear ---
  function handleRestoreBackup(jsonText: string) {
    try {
      const res = validateAndRestoreBackup(jsonText);
      if (!res.ok || !res.db) {
        return { ok: false, error: res.error };
      }
      setDb(res.db);
      setAuthenticatedAdmin(null);
      setAdminSettings(saveAdminSettings(adminSettings, getAdminCount(res.db)));
      setSelectedStudentId(res.db.students[0]?.student_id ?? "");
      setInspectedReport(null);
      setInspectedStudentId(null);
      setStatusNotice(
        `Restored backup (${res.db.students.length} students, ${res.db.stress_reports.length} reports, ${res.db.stress_factors.length} factors).`
      );
      return { ok: true };
    } catch {
      return { ok: false, error: "Unable to restore backup JSON." };
    }
  }

  function handleClearDatabase() {
    const empty = clearDatabase();
    setDb(empty);
    setAuthenticatedAdmin(null);
    setAdminSettings(resetAdminSettings());
    setSelectedStudentId("");
    setInspectedReport(null);
    setInspectedStudentId(null);
    setStatusNotice("Cleared all 6 relational tables and saved routines.");
  }

  // --- Navigation & Strict Role Switching Helpers ---
  function handleSelectRole(role: ActiveRole) {
    setInspectedReport(null);
    setInspectedStudentId(null);
    if (role === "Admin") {
      setActiveRole("Admin");
      setActiveTab("admin");
      setStatusNotice(
        authenticatedAdmin
          ? "Switched to Admin Dashboard."
          : "Admin Security Portal active. Sign up or log in to unlock."
      );
    } else {
      setActiveRole("Student");
      setAuthenticatedAdmin(null);
      setActiveTab("survey");
      setStatusNotice("Switched to Student workspace.");
    }
  }

  function handleLaunchFromOrb() {
    setActiveRole("Student");
    setAuthenticatedAdmin(null);
    setPreferNewIntake(true);
    setSurveySessionKey((k) => k + 1);
    setActiveTab("survey");
    setShowOrbEntry(false);
    setShowWelcomeOverlay(true);
  }

  function handleOpenAdminPortalFromOrb() {
    setActiveRole("Admin");
    setActiveTab("admin");
    setShowOrbEntry(false);
  }

  function handleStartSurvey(studentId?: string) {
    setActiveRole("Student");
    setAuthenticatedAdmin(null);
    if (studentId) {
      setSelectedStudentId(studentId);
      setPreferNewIntake(false);
    } else {
      setPreferNewIntake(true);
    }
    setSurveySessionKey((k) => k + 1);
    setInspectedReport(null);
    setInspectedStudentId(null);
    setActiveTab("survey");
    setShowOrbEntry(false);
  }

  function handleOpenDoctorConsultation(studentId: string) {
    setActiveRole("Student");
    setAuthenticatedAdmin(null);
    setSelectedStudentId(studentId);
    setPreferNewIntake(false);
    setSurveySessionKey((k) => k + 1);
    setActiveTab("consultation");
    setShowOrbEntry(false);
  }

  return (
    <>
      {showWelcomeOverlay && !showOrbEntry && (
        <WelcomeOverlay onComplete={handleWelcomeComplete} />
      )}

      <AnimatePresence mode="wait">
        {showOrbEntry ? (
          <OrbLauncher
            key="orb-launcher"
            onLaunchSurvey={handleLaunchFromOrb}
            onOpenAdminPortal={handleOpenAdminPortalFromOrb}
          />
        ) : (
        <motion.div
          key="workspace-shell"
          data-tab-theme={activeTheme.themeKey}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="relative min-h-screen flex purple-cosmos-bg tab-theme-transition text-violet-50 overflow-x-hidden"
        >
          <CosmicBackground />

          <Sidebar
            activeTab={effectiveTab}
            onSelectTab={(tab) => {
              if (activeRole === "Student" && !STUDENT_TAB_SET.has(tab)) return;
              if (activeRole === "Admin" && (!authenticatedAdmin || !ADMIN_TAB_SET.has(tab))) {
                setActiveTab("admin");
                return;
              }
              if (tab === "survey") {
                setPreferNewIntake(db.students.length === 0);
              }
              setActiveTab(tab);
            }}
            activeRole={activeRole}
            onSelectRole={handleSelectRole}
            isAdminAuthenticated={authenticatedAdmin !== null}
            onOpenOrb={() => {
              setShowOrbEntry(true);
            }}
            studentCount={db.students.length}
            reportCount={db.stress_reports.length}
            factorCount={db.stress_factors.length}
            mobileOpen={mobileMenuOpen}
            onCloseMobile={() => setMobileMenuOpen(false)}
          />

          <div className="relative z-10 flex-1 flex flex-col min-w-0">
            <header className="tab-header-bar backdrop-blur-sm px-4 sm:px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-30">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  aria-label="Open navigation menu"
                  className="lg:hidden p-2 text-slate-200 hover:text-slate-50 border tab-divider rounded-md"
                >
                  <Menu className="w-4 h-4" aria-hidden="true" />
                </button>

                <div className="min-w-0">
                  <h1 className="font-display text-sm sm:text-base font-semibold text-slate-50 truncate">
                    Health AI Monitoring System
                  </h1>
                  <p className="text-[11px] tab-accent-text truncate">
                    {activeRole === "Admin" && !authenticatedAdmin
                      ? "Admin Security Portal — Authentication Required"
                      : `${activeTheme.title} — ${activeTheme.subtitle}`}
                  </p>
                </div>
              </div>

              <div className="hidden xl:flex items-center gap-4 text-xs text-slate-300/75 min-w-0">
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <Cpu className="w-3.5 h-3.5 tab-accent-text" aria-hidden="true" />
                  <span>Multilingual Health AI</span>
                </div>

                <span className="opacity-35" aria-hidden="true">|</span>

                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <Shield className="w-3.5 h-3.5 tab-accent-text" aria-hidden="true" />
                  <span className="font-medium text-slate-100">
                    {activeRole === "Admin"
                      ? authenticatedAdmin
                        ? "Admin (Unlocked)"
                        : "Admin (Locked)"
                      : "Student"}
                  </span>
                </div>

                {activeRole === "Student" && activeStudent && (
                  <>
                    <span className="opacity-35" aria-hidden="true">|</span>
                    <div className="whitespace-nowrap truncate max-w-[200px]">
                      <span>Active: </span>
                      <span className="text-slate-100 font-medium">
                        {activeStudent.student_id} · {activeStudent.full_name}
                      </span>
                    </div>
                  </>
                )}

                {(activeRole === "Student" || authenticatedAdmin !== null) && (
                  <>
                    <span className="opacity-35" aria-hidden="true">|</span>
                    <div className="font-mono tabular-nums whitespace-nowrap text-slate-200">
                      {db.students.length} Students · {db.stress_reports.length} Reports
                    </div>
                  </>
                )}
              </div>

              <div className="shrink-0 flex items-center gap-2">
                {activeRole === "Student" ? (
                  <button
                    type="button"
                    onClick={() => handleStartSurvey()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-md tab-cta-btn whitespace-nowrap shrink-0"
                  >
                    <ClipboardList className="w-4 h-4" aria-hidden="true" />
                    <span>Start Survey</span>
                  </button>
                ) : (
                  <>
                    {authenticatedAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthenticatedAdmin(null);
                          setActiveTab("admin");
                          setStatusNotice("Admin Panel locked.");
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md bg-rose-500/15 border border-rose-400/40 text-rose-100 hover:bg-rose-500/25 transition-colors whitespace-nowrap"
                      >
                        <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Lock Admin</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSelectRole("Student")}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md tab-outline-btn whitespace-nowrap shrink-0"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Student Mode</span>
                    </button>
                  </>
                )}
              </div>
            </header>

            <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-24 max-w-[1360px] w-full mx-auto space-y-5">
              {statusNotice && (
                <div
                  role="status"
                  className="px-4 py-2.5 bg-[#120926] border tab-divider rounded-md text-xs tab-accent-text flex items-center justify-between gap-4"
                >
                  <span>{statusNotice}</span>
                  <button
                    type="button"
                    onClick={() => setStatusNotice(null)}
                    className="text-slate-300/75 hover:text-slate-50 font-medium"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {activeRole === "Student" &&
                (effectiveTab === "survey" || effectiveTab === "consultation") && (
                  <TextSurveyConsole
                    key={`${surveySessionKey}-${effectiveTab}`}
                    viewMode={effectiveTab === "consultation" ? "consultation" : "entry"}
                    students={db.students}
                    reports={db.stress_reports}
                    stressFactors={db.stress_factors}
                    reportFactors={db.report_factors}
                    selectedStudentId={selectedStudentId}
                    onSelectStudentId={setSelectedStudentId}
                    onAddFactor={handleAddFactor}
                    onCommitSurveyWithStudent={handleCommitSurveyWithStudent}
                    onNavigateTab={(tab) => setActiveTab(tab)}
                    preferNewStudentIntake={preferNewIntake}
                  />
                )}

              {activeRole === "Student" && effectiveTab === "tracker" && (
                <DailyHealthTracker
                  activeRole={activeRole}
                  students={db.students}
                  reports={db.stress_reports}
                  stressFactors={db.stress_factors}
                  reportFactors={db.report_factors}
                  selectedStudentId={selectedStudentId}
                  onSelectStudentId={setSelectedStudentId}
                  onAddFactor={handleAddFactor}
                  onCommitCheckIn={handleCommitSurveyWithStudent}
                  onUpdateReport={handleUpdateReport}
                  onDeleteEntry={handleDeleteReport}
                  onInspectEntry={(rpt) => {
                    setInspectedStudentId(null);
                    setInspectedReport(rpt);
                  }}
                  onConsultDoctor={handleOpenDoctorConsultation}
                />
              )}

              {activeRole === "Student" && effectiveTab === "guide" && (
                <SymptomGuideTab
                  activeStudent={activeStudent}
                  onOpenDoctorChat={() => {
                    if (activeStudent) {
                      handleOpenDoctorConsultation(activeStudent.student_id);
                    } else {
                      setActiveTab("consultation");
                    }
                  }}
                />
              )}

              {activeRole === "Student" && effectiveTab === "routine" && (
                <RecoveryRoutineTab
                  students={db.students}
                  reports={db.stress_reports}
                  savedRoutines={db.saved_routines}
                  selectedStudentId={selectedStudentId}
                  onSelectStudentId={setSelectedStudentId}
                  onSaveRoutine={handleSaveRoutine}
                  onTogglePinRoutine={handleTogglePinRoutine}
                  onToggleRoutineBlock={handleToggleRoutineBlock}
                  onDeleteRoutine={handleDeleteRoutine}
                />
              )}

              {activeRole === "Admin" && (!authenticatedAdmin || effectiveTab === "admin") && (
                <AdminPanel
                  students={db.students}
                  reports={db.stress_reports}
                  departments={db.departments}
                  stressFactors={db.stress_factors}
                  reportFactors={db.report_factors}
                  users={db.users}
                  authenticatedAdmin={authenticatedAdmin}
                  adminSettings={adminSettings}
                  onUpdateAdminSettings={handleUpdateAdminSettings}
                  onRegisterAdmin={handleRegisterAdmin}
                  onUpdateAdminAccount={handleUpdateAdminAccount}
                  onDeleteAdminAccount={handleDeleteUser}
                  onLoginAdmin={(admin) => {
                    setAuthenticatedAdmin(admin);
                    setActiveTab("admin");
                    setStatusNotice(
                      `Admin session unlocked for ${admin.display_name || admin.username}.`
                    );
                  }}
                  onLogoutAdmin={() => {
                    setAuthenticatedAdmin(null);
                    setActiveTab("admin");
                    setStatusNotice("Admin Panel locked.");
                  }}
                  onSwitchToStudent={() => handleSelectRole("Student")}
                />
              )}

              {activeRole === "Admin" && authenticatedAdmin && effectiveTab === "telemetry" && (
                <TelemetryDashboard
                  activeRole={activeRole}
                  selectedStudentId={selectedStudentId}
                  departments={db.departments}
                  students={db.students}
                  reports={db.stress_reports}
                  stressFactors={db.stress_factors}
                  reportFactors={db.report_factors}
                  onInspectReport={(rpt) => {
                    setInspectedStudentId(null);
                    setInspectedReport(rpt);
                  }}
                  onInspectStudent={(studentId) => {
                    setInspectedReport(null);
                    setInspectedStudentId(studentId);
                  }}
                  onUpdateReport={handleUpdateReport}
                  onDeleteReport={handleDeleteReport}
                  onStartSurvey={handleStartSurvey}
                />
              )}

              {activeRole === "Admin" && authenticatedAdmin && effectiveTab === "analytics" && (
                <AnalyticsInsights
                  activeRole={activeRole}
                  departments={db.departments}
                  students={db.students}
                  reports={db.stress_reports}
                  stressFactors={db.stress_factors}
                  reportFactors={db.report_factors}
                  selectedStudentId={selectedStudentId}
                  onSelectStudentId={setSelectedStudentId}
                  onInspectReport={(rpt) => {
                    setInspectedStudentId(null);
                    setInspectedReport(rpt);
                  }}
                  onInspectStudent={(studentId) => {
                    setInspectedReport(null);
                    setInspectedStudentId(studentId);
                  }}
                  onConsultStudent={handleOpenDoctorConsultation}
                  onNavigateSurvey={() => handleStartSurvey()}
                />
              )}

              {activeRole === "Admin" && authenticatedAdmin && effectiveTab === "students" && (
                <StudentsDirectory
                  activeRole={activeRole}
                  departments={db.departments}
                  students={db.students}
                  reports={db.stress_reports}
                  onAddStudent={handleAddStudent}
                  onUpdateStudent={handleUpdateStudent}
                  onDeleteStudent={handleDeleteStudent}
                  onInspectStudent={(studentId) => {
                    setInspectedReport(null);
                    setInspectedStudentId(studentId);
                  }}
                  onStartSurvey={handleStartSurvey}
                />
              )}

              {activeRole === "Admin" && authenticatedAdmin && effectiveTab === "relational" && (
                <RelationalExplorer
                  activeRole={activeRole}
                  db={db}
                  onInspectStudent={(studentId) => {
                    setInspectedReport(null);
                    setInspectedStudentId(studentId);
                  }}
                  onInspectReport={(rpt) => {
                    setInspectedStudentId(null);
                    setInspectedReport(rpt);
                  }}
                  onAddDepartment={handleAddDepartment}
                  onUpdateDepartment={handleUpdateDepartment}
                  onDeleteDepartment={handleDeleteDepartment}
                  onAddUser={handleAddUser}
                  onUpdateUser={handleUpdateUser}
                  onDeleteUser={handleDeleteUser}
                  onAddFactor={handleAddFactor}
                  onDeleteFactor={handleDeleteFactor}
                  onRestoreBackup={handleRestoreBackup}
                  onClearDatabase={handleClearDatabase}
                />
              )}
            </main>
          </div>

          <RecordInspectorModal
            inspectedStudent={inspectedStudent}
            inspectedReport={inspectedReport}
            studentReports={inspectedStudentReports}
            linkedStudent={linkedReportStudent}
            departments={db.departments}
            stressFactors={db.stress_factors}
            reportFactors={db.report_factors}
            onClose={() => {
              setInspectedReport(null);
              setInspectedStudentId(null);
            }}
            onSelectReport={(rpt) => {
              setInspectedStudentId(null);
              setInspectedReport(rpt);
            }}
            onSelectStudent={(studentId) => {
              setInspectedReport(null);
              setInspectedStudentId(studentId);
            }}
            onStartSurveyForStudent={handleStartSurvey}
          />
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
