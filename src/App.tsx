import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Cpu, Menu, Shield } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
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
import type {
  ActiveRole,
  ActiveTab,
  FeverStatus,
  RoutineBlock,
  RoutineMode,
  SavedRoutine,
  StressFactor,
  StressReport,
  Student,
  StudentHealthDatabase,
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
  insertDepartment,
  insertStressFactor,
  insertStressReport,
  insertStudent,
  insertUser,
  loadDatabase,
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

  useEffect(() => {
    saveDatabase(db);
  }, [db]);

  useEffect(() => {
    if (!statusNotice) return;
    const timer = window.setTimeout(() => setStatusNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [statusNotice]);

  const activeTheme = useMemo(() => getTabTheme(activeTab), [activeTab]);

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

  // --- User Account CRUD ---
  function handleAddUser(input: {
    username: string;
    password_hash: string;
    role: UserRole;
    student_id?: string | null;
  }) {
    try {
      const res = insertUser(db, input);
      if (!res.ok) return { ok: false, error: res.error };
      setDb(res.db);
      setStatusNotice(`Created user ${res.user?.user_id} (${res.user?.username}, ${res.user?.role}).`);
      return { ok: true };
    } catch {
      return { ok: false, error: "Unable to create user account." };
    }
  }

  function handleUpdateUser(
    userId: string,
    input: {
      username: string;
      role: UserRole;
      student_id?: string | null;
      password_hash?: string;
    }
  ) {
    try {
      const res = updateUser(db, userId, input);
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
      const res = deleteUser(db, userId);
      setDb(res.db);
      setStatusNotice(`Removed user account ${userId}.`);
    } catch {
      setStatusNotice("Unable to remove user account.");
    }
  }

  // --- Student CRUD ---
  function handleAddStudent(input: {
    name: string;
    email?: string;
    semester?: string;
    dept_id?: string | null;
    class_section: string;
    roll_no: string;
    age: number;
  }) {
    try {
      const res = insertStudent(db, input);
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
      class_section: string;
      roll_no: string;
      age: number;
    }
  ) {
    try {
      const res = updateStudent(db, studentId, input);
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
        const stuRes = insertStudent(workingDb, {
          name: studentProfile.full_name,
          email: studentProfile.email,
          semester: studentProfile.semester,
          dept_id: studentProfile.dept_id ?? null,
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
    setSelectedStudentId("");
    setInspectedReport(null);
    setInspectedStudentId(null);
    setStatusNotice("Cleared all 6 relational tables and saved routines.");
  }

  // --- Navigation Helpers ---
  function handleLaunchFromOrb() {
    setPreferNewIntake(true);
    setSurveySessionKey((k) => k + 1);
    setActiveTab("survey");
    setShowOrbEntry(false);
  }

  function handleOpenDatabaseFromOrb() {
    setActiveTab("telemetry");
    setShowOrbEntry(false);
  }

  function handleStartSurvey(studentId?: string) {
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
    setSelectedStudentId(studentId);
    setPreferNewIntake(false);
    setSurveySessionKey((k) => k + 1);
    setActiveTab("consultation");
    setShowOrbEntry(false);
  }

  return (
    <AnimatePresence mode="wait">
      {showOrbEntry ? (
        <OrbLauncher
          key="orb-launcher"
          onLaunchSurvey={handleLaunchFromOrb}
          onOpenDatabase={handleOpenDatabaseFromOrb}
          hasExistingRecords={db.students.length > 0 || db.stress_reports.length > 0}
          surveyCount={db.stress_reports.length}
        />
      ) : (
        <motion.div
          key="workspace-shell"
          data-tab-theme={activeTheme.themeKey}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="relative min-h-screen flex tab-cosmos-bg tab-theme-transition text-violet-50 overflow-x-hidden"
        >
          <CosmicBackground />

          <Sidebar
            activeTab={activeTab}
            onSelectTab={(tab) => {
              if (tab === "survey") {
                setPreferNewIntake(db.students.length === 0);
              }
              setActiveTab(tab);
            }}
            activeRole={activeRole}
            onSelectRole={(role) => {
              setActiveRole(role);
              setStatusNotice(`Switched active role view to ${role}.`);
            }}
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
            <header className="tab-header-shell backdrop-blur-sm px-4 sm:px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-30">
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
                    {activeTheme.title} — {activeTheme.subtitle}
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
                  <span className="font-medium text-slate-100">{activeRole}</span>
                </div>

                {activeStudent && (
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

                <span className="opacity-35" aria-hidden="true">|</span>

                <div className="font-mono tabular-nums whitespace-nowrap text-slate-200">
                  {db.students.length} Students · {db.stress_reports.length} Reports
                </div>
              </div>

              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() => handleStartSurvey()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-md tab-cta-btn whitespace-nowrap shrink-0"
                >
                  <ClipboardList className="w-4 h-4" aria-hidden="true" />
                  <span>Start Survey</span>
                </button>
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

              {(activeTab === "survey" || activeTab === "consultation") && (
                <TextSurveyConsole
                  key={`${surveySessionKey}-${activeTab}`}
                  viewMode={activeTab === "consultation" ? "consultation" : "entry"}
                  departments={db.departments}
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

              {activeTab === "tracker" && (
                <DailyHealthTracker
                  activeRole={activeRole}
                  departments={db.departments}
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

              {activeTab === "guide" && (
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

              {activeTab === "routine" && (
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

              {activeTab === "telemetry" && (
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

              {activeTab === "analytics" && (
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

              {activeTab === "students" && (
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

              {activeTab === "relational" && (
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
  );
}
