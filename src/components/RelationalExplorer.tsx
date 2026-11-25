import { useMemo, useRef, useState } from "react";
import {
  Building2,
  Download,
  Edit3,
  Plus,
  RotateCcw,
  Shield,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";
import { SUGGESTED_FACTOR_TEMPLATES } from "../data/seedData";
import type {
  ActiveRole,
  Department,
  ReportFactor,
  StressFactor,
  StressReport,
  Student,
  StudentHealthDatabase,
  UserAccount,
  UserRole,
} from "../types";
import { downloadFile, escapeCsvCell, hashPassword } from "../utils/dbStorage";

interface RelationalExplorerProps {
  activeRole: ActiveRole;
  db: StudentHealthDatabase;
  onInspectStudent: (studentId: string) => void;
  onInspectReport: (report: StressReport) => void;
  onAddDepartment: (input: { dept_name: string; building: string }) => {
    ok: boolean;
    error?: string;
  };
  onUpdateDepartment: (
    deptId: string,
    input: { dept_name: string; building: string }
  ) => { ok: boolean; error?: string };
  onDeleteDepartment: (
    deptId: string,
    cascadeUnlink?: boolean
  ) => { ok: boolean; error?: string; linkedCount?: number };
  onAddUser: (input: {
    username: string;
    password_hash: string;
    role: UserRole;
    student_id?: string | null;
  }) => { ok: boolean; error?: string };
  onUpdateUser: (
    userId: string,
    input: {
      username: string;
      role: UserRole;
      student_id?: string | null;
      password_hash?: string;
    }
  ) => { ok: boolean; error?: string };
  onDeleteUser: (userId: string) => void;
  onAddFactor: (input: { factor_name: string; description: string }) => {
    ok: boolean;
    error?: string;
  };
  onDeleteFactor: (
    factorId: string,
    cascade?: boolean
  ) => { ok: boolean; error?: string; refCount?: number };
  onRestoreBackup: (jsonText: string) => { ok: boolean; error?: string };
  onClearDatabase: () => void;
}

type ExplorerPanel = "query" | "departments" | "users" | "factors";
type PresetId =
  | "all_joined"
  | "low_sleep"
  | "high_stress"
  | "high_wellness"
  | "semester_summary";

export function RelationalExplorer({
  activeRole,
  db,
  onInspectStudent,
  onInspectReport,
  onAddDepartment,
  onUpdateDepartment,
  onDeleteDepartment,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  onAddFactor,
  onDeleteFactor,
  onRestoreBackup,
  onClearDatabase,
}: RelationalExplorerProps) {
  const [panel, setPanel] = useState<ExplorerPanel>("query");
  const [preset, setPreset] = useState<PresetId>("all_joined");
  const [sectionFilter, setSectionFilter] = useState("ALL");
  const [minStress, setMinStress] = useState("");
  const [maxSleep, setMaxSleep] = useState("");
  const [minWellness, setMinWellness] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Department CRUD state
  const [deptName, setDeptName] = useState("");
  const [deptBuilding, setDeptBuilding] = useState("");
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptError, setDeptError] = useState<string | null>(null);
  const [confirmCascadeDeptId, setConfirmCascadeDeptId] = useState<string | null>(null);

  // User CRUD state
  const [username, setUsername] = useState("");
  const [rawPassword, setRawPassword] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("Student");
  const [linkedStudentId, setLinkedStudentId] = useState("");
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [isHashing, setIsHashing] = useState(false);

  // Stress Factor CRUD state
  const [factorName, setFactorName] = useState("");
  const [factorDesc, setFactorDesc] = useState("");
  const [factorError, setFactorError] = useState<string | null>(null);
  const [confirmCascadeFactorId, setConfirmCascadeFactorId] = useState<string | null>(null);

  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    for (const s of db.students) map.set(s.student_id, s);
    return map;
  }, [db.students]);

  const deptMap = useMemo(() => {
    const map = new Map<string, Department>();
    for (const d of db.departments) map.set(d.dept_id, d);
    return map;
  }, [db.departments]);

  const factorMap = useMemo(() => {
    const map = new Map<string, StressFactor>();
    for (const f of db.stress_factors) map.set(f.factor_id, f);
    return map;
  }, [db.stress_factors]);

  const factorsByReport = useMemo(() => {
    const map = new Map<string, StressFactor[]>();
    for (const rf of db.report_factors) {
      const f = factorMap.get(rf.factor_id);
      if (!f) continue;
      const list = map.get(rf.report_id) ?? [];
      list.push(f);
      map.set(rf.report_id, list);
    }
    return map;
  }, [db.report_factors, factorMap]);

  const sections = useMemo(
    () => ["ALL", ...Array.from(new Set(db.students.map((s) => s.class_section))).sort()],
    [db.students]
  );

  function applyPreset(id: PresetId) {
    setPreset(id);
    if (id === "all_joined") {
      setSectionFilter("ALL");
      setMinStress("");
      setMaxSleep("");
      setMinWellness("");
    } else if (id === "low_sleep") {
      setSectionFilter("ALL");
      setMinStress("");
      setMaxSleep("6.5");
      setMinWellness("");
    } else if (id === "high_stress") {
      setSectionFilter("ALL");
      setMinStress("8");
      setMaxSleep("");
      setMinWellness("");
    } else if (id === "high_wellness") {
      setSectionFilter("ALL");
      setMinStress("");
      setMaxSleep("");
      setMinWellness("80");
    }
  }

  const joinedResults = useMemo(() => {
    const minStressNum = minStress.trim() !== "" ? Number(minStress) : null;
    const maxSleepNum = maxSleep.trim() !== "" ? Number(maxSleep) : null;
    const minWellnessNum = minWellness.trim() !== "" ? Number(minWellness) : null;

    return db.stress_reports
      .map((report) => ({
        report,
        student: studentMap.get(report.student_id),
      }))
      .filter(({ report, student }) => {
        if (sectionFilter !== "ALL" && student?.class_section !== sectionFilter) return false;
        if (
          minStressNum !== null &&
          Number.isFinite(minStressNum) &&
          report.stress_level < minStressNum
        ) {
          return false;
        }
        if (
          maxSleepNum !== null &&
          Number.isFinite(maxSleepNum) &&
          report.sleep_hours >= maxSleepNum
        ) {
          return false;
        }
        if (
          minWellnessNum !== null &&
          Number.isFinite(minWellnessNum) &&
          report.wellness_index < minWellnessNum
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.report.submission_date.localeCompare(a.report.submission_date));
  }, [db.stress_reports, studentMap, sectionFilter, minStress, maxSleep, minWellness]);

  const semesterAggregates = useMemo(() => {
    const bySem = new Map<string, { studentIds: Set<string>; reports: StressReport[] }>();
    for (const s of db.students) {
      const sem = s.semester || "Sem 1";
      if (!bySem.has(sem)) bySem.set(sem, { studentIds: new Set(), reports: [] });
      bySem.get(sem)!.studentIds.add(s.student_id);
    }
    for (const rpt of db.stress_reports) {
      const stu = studentMap.get(rpt.student_id);
      const sem = stu?.semester || "Sem 1";
      if (!bySem.has(sem)) bySem.set(sem, { studentIds: new Set(), reports: [] });
      bySem.get(sem)!.reports.push(rpt);
    }
    return Array.from(bySem.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([semester, data]) => {
        const count = data.reports.length;
        return {
          semester,
          studentCount: data.studentIds.size,
          reportCount: count,
          avgSleep:
            count > 0
              ? (data.reports.reduce((acc, l) => acc + l.sleep_hours, 0) / count).toFixed(1)
              : "—",
          avgStress:
            count > 0
              ? (data.reports.reduce((acc, l) => acc + l.stress_level, 0) / count).toFixed(1)
              : "—",
          avgWellness:
            count > 0
              ? Math.round(data.reports.reduce((acc, l) => acc + l.wellness_index, 0) / count)
              : null,
        };
      });
  }, [db.students, db.stress_reports, studentMap]);

  const sqlPreview = useMemo(() => {
    if (preset === "semester_summary") {
      return `SELECT s.semester, COUNT(DISTINCT s.student_id) AS students, COUNT(sr.report_id) AS reports, ROUND(AVG(sr.sleep_hours), 1) AS avg_sleep, ROUND(AVG(sr.stress_level), 1) AS avg_stress, ROUND(AVG(sr.wellness_index), 0) AS avg_wellness\nFROM students s\nLEFT JOIN stress_reports sr ON s.student_id = sr.student_id\nGROUP BY s.semester\nORDER BY s.semester ASC;`;
    }
    const clauses: string[] = [];
    if (sectionFilter !== "ALL") clauses.push(`s.class_section = '${sectionFilter}'`);
    if (minStress.trim() !== "" && Number.isFinite(Number(minStress))) {
      clauses.push(`sr.stress_level >= ${Number(minStress)}`);
    }
    if (maxSleep.trim() !== "" && Number.isFinite(Number(maxSleep))) {
      clauses.push(`sr.sleep_hours < ${Number(maxSleep)}`);
    }
    if (minWellness.trim() !== "" && Number.isFinite(Number(minWellness))) {
      clauses.push(`sr.wellness_index >= ${Number(minWellness)}`);
    }
    const whereSql = clauses.length > 0 ? `\nWHERE ${clauses.join(" AND ")}` : "";
    return `SELECT sr.report_id, sr.student_id, s.name, d.dept_name, s.semester, sr.submission_date, sr.stress_level, sr.sleep_hours, sr.wellness_index\nFROM stress_reports sr\nINNER JOIN students s ON sr.student_id = s.student_id\nLEFT JOIN departments d ON s.dept_id = d.dept_id${whereSql}\nORDER BY sr.submission_date DESC;`;
  }, [preset, sectionFilter, minStress, maxSleep, minWellness]);

  function handleExportCsv() {
    const headers = [
      "report_id",
      "student_id",
      "name",
      "email",
      "semester",
      "dept_name",
      "class_section",
      "roll_no",
      "submission_date",
      "stress_level",
      "sleep_hours",
      "water_intake",
      "wellness_index",
      "stress_factors",
      "remarks",
      "ai_assessment",
    ];
    const rows = joinedResults.map(({ report, student }) => {
      const dept = student?.dept_id ? deptMap.get(student.dept_id) : undefined;
      const facs = (factorsByReport.get(report.report_id) ?? [])
        .map((f) => f.factor_name)
        .join("; ");
      return [
        report.report_id,
        report.student_id,
        student?.name ?? "",
        student?.email ?? "",
        student?.semester ?? "",
        dept?.dept_name ?? "",
        student?.class_section ?? "",
        student?.roll_no ?? "",
        report.submission_date,
        report.stress_level,
        report.sleep_hours,
        report.water_intake,
        report.wellness_index,
        facs,
        report.remarks,
        report.ai_assessment,
      ]
        .map(escapeCsvCell)
        .join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    downloadFile("stress_reports_export.csv", csv, "text/csv;charset=utf-8;");
    setBackupNotice("Exported joined CSV of stress_reports.");
  }

  function handleExportJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      schemaVersion: "3NF-6-table-v4",
      departments: db.departments,
      users: db.users,
      students: db.students,
      stress_reports: db.stress_reports,
      stress_factors: db.stress_factors,
      report_factors: db.report_factors,
      saved_routines: db.saved_routines,
    };
    downloadFile(
      "health_ai_3nf_backup.json",
      JSON.stringify(payload, null, 2),
      "application/json"
    );
    setBackupNotice("Exported full 6-table JSON backup.");
  }

  async function handleFileRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const res = onRestoreBackup(text);
      if (!res.ok) {
        setBackupNotice(res.error ?? "Failed to restore backup.");
      } else {
        setBackupNotice(`Restored 6-table database backup from ${file.name}.`);
      }
    } catch {
      setBackupNotice("Could not read selected backup file.");
    }
  }

  async function handleDepartmentSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDeptError(null);
    if (editingDept) {
      const res = onUpdateDepartment(editingDept.dept_id, {
        dept_name: deptName,
        building: deptBuilding,
      });
      if (!res.ok) {
        setDeptError(res.error ?? "Unable to update department.");
        return;
      }
      setEditingDept(null);
    } else {
      const res = onAddDepartment({ dept_name: deptName, building: deptBuilding });
      if (!res.ok) {
        setDeptError(res.error ?? "Unable to create department.");
        return;
      }
    }
    setDeptName("");
    setDeptBuilding("");
  }

  async function handleUserSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUserError(null);
    if (!username.trim()) {
      setUserError("Username is required.");
      return;
    }
    if (!editingUser && rawPassword.trim().length < 4) {
      setUserError("Password must be at least 4 characters (stored as SHA-256 hash).");
      return;
    }

    setIsHashing(true);
    try {
      const hashed = rawPassword.trim()
        ? await hashPassword(rawPassword.trim())
        : undefined;

      if (editingUser) {
        const res = onUpdateUser(editingUser.user_id, {
          username: username.trim(),
          role: userRole,
          student_id: linkedStudentId || null,
          password_hash: hashed,
        });
        if (!res.ok) {
          setUserError(res.error ?? "Unable to update user.");
          return;
        }
        setEditingUser(null);
      } else {
        const res = onAddUser({
          username: username.trim(),
          password_hash: hashed ?? (await hashPassword(rawPassword.trim())),
          role: userRole,
          student_id: linkedStudentId || null,
        });
        if (!res.ok) {
          setUserError(res.error ?? "Unable to create user.");
          return;
        }
      }
      setUsername("");
      setRawPassword("");
      setUserRole("Student");
      setLinkedStudentId("");
    } finally {
      setIsHashing(false);
    }
  }

  function handleFactorSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFactorError(null);
    const res = onAddFactor({ factor_name: factorName, description: factorDesc });
    if (!res.ok) {
      setFactorError(res.error ?? "Unable to add stress factor.");
      return;
    }
    setFactorName("");
    setFactorDesc("");
  }

  function handleSeedStandardFactors() {
    setFactorError(null);
    for (const tpl of SUGGESTED_FACTOR_TEMPLATES) {
      onAddFactor(tpl);
    }
  }

  const isAdmin = activeRole === "Admin";

  return (
    <div className="space-y-6">
      {/* 6-Table 3NF Relational Schema Overview */}
      <section className="tab-surface-card rounded-lg px-5 py-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b tab-divider">
          <div>
            <h2 className="text-base font-semibold text-slate-50">
              6-Table Normalized Schema (3NF) &amp; Backup / Restore
            </h2>
            <p className="mt-0.5 text-xs text-slate-300/70">
              Primary keys, foreign keys, hashed user credentials, and M:N report_factors bridge in localStorage.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium tab-outline-btn rounded-md whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 tab-accent-text" aria-hidden="true" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium tab-outline-btn rounded-md whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-fuchsia-400" aria-hidden="true" />
              <span>Backup JSON</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => void handleFileRestore(e)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium tab-outline-btn rounded-md whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
              <span>Restore JSON</span>
            </button>

            {confirmReset ? (
              <div className="inline-flex items-center gap-2 ml-1">
                <button
                  type="button"
                  onClick={() => {
                    onClearDatabase();
                    setConfirmReset(false);
                    setBackupNotice("Cleared all 6 normalized tables.");
                  }}
                  className="px-3 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-500 rounded-md whitespace-nowrap"
                >
                  Confirm Clear
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-2 text-xs font-medium tab-outline-btn rounded-md whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium tab-outline-btn hover:border-rose-400/50 rounded-md whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Clear All</span>
              </button>
            )}
          </div>
        </div>

        {backupNotice && (
          <div
            role="status"
            className="px-4 py-2.5 bg-[#090514] border tab-divider rounded-md text-xs tab-accent-text flex items-center justify-between gap-2"
          >
            <span>{backupNotice}</span>
            <button
              type="button"
              onClick={() => setBackupNotice(null)}
              className="text-slate-400 hover:text-slate-100"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 bg-[#090514] border tab-divider rounded-md">
            <div className="flex items-center justify-between font-mono font-semibold text-violet-300">
              <span>1. departments</span>
              <span className="tabular-nums">{db.departments.length} rows</span>
            </div>
            <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-slate-200/80">
              <li>PK dept_id · dept_name · building</li>
            </ul>
          </div>

          <div className="p-3.5 bg-[#090514] border tab-divider rounded-md">
            <div className="flex items-center justify-between font-mono font-semibold text-violet-300">
              <span>2. users</span>
              <span className="tabular-nums">{db.users.length} rows</span>
            </div>
            <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-slate-200/80">
              <li>PK user_id · FK student_id · username · password_hash · role</li>
            </ul>
          </div>

          <div className="p-3.5 bg-[#090514] border tab-divider rounded-md">
            <div className="flex items-center justify-between font-mono font-semibold text-violet-300">
              <span>3. students</span>
              <span className="tabular-nums">{db.students.length} rows</span>
            </div>
            <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-slate-200/80">
              <li>PK student_id · FK dept_id, user_id · name · email · semester</li>
            </ul>
          </div>

          <div className="p-3.5 bg-[#090514] border tab-divider rounded-md">
            <div className="flex items-center justify-between font-mono font-semibold text-fuchsia-300">
              <span>4. stress_reports</span>
              <span className="tabular-nums">{db.stress_reports.length} rows</span>
            </div>
            <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-slate-200/80">
              <li>PK report_id · FK student_id · stress_level · submission_date · remarks</li>
            </ul>
          </div>

          <div className="p-3.5 bg-[#090514] border tab-divider rounded-md">
            <div className="flex items-center justify-between font-mono font-semibold text-fuchsia-300">
              <span>5. stress_factors</span>
              <span className="tabular-nums">{db.stress_factors.length} rows</span>
            </div>
            <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-slate-200/80">
              <li>PK factor_id · factor_name · description</li>
            </ul>
          </div>

          <div className="p-3.5 bg-[#090514] border tab-divider rounded-md">
            <div className="flex items-center justify-between font-mono font-semibold text-fuchsia-300">
              <span>6. report_factors (M:N)</span>
              <span className="tabular-nums">{db.report_factors.length} rows</span>
            </div>
            <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-slate-200/80">
              <li>PK/FK (report_id, factor_id) composite bridge</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: "query", label: "SQL Query Console" },
            { id: "departments", label: `Departments (${db.departments.length})` },
            { id: "users", label: `Users & Roles (${db.users.length})` },
            { id: "factors", label: `Stress Factors (${db.stress_factors.length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setPanel(tab.id)}
            className={`px-3.5 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
              panel === tab.id ? "tab-chip-active" : "tab-outline-btn"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel 1: Safe Read-Only SQL Query Console */}
      {panel === "query" && (
        <section className="tab-surface-card rounded-lg px-5 py-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-50">
              Safe Read-Only Relational Query Console
            </h3>
            <p className="mt-0.5 text-xs text-slate-300/70">
              Execute preset analytical queries or filter joined tables safely.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: "all_joined", label: "All Joined Reports" },
                { id: "low_sleep", label: "Sleep < 6.5 hrs" },
                { id: "high_stress", label: "High Stress (>= 8/10)" },
                { id: "high_wellness", label: "Wellness Index >= 80" },
                { id: "semester_summary", label: "Semester Aggregates (GROUP BY)" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => applyPreset(item.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                  preset === item.id ? "tab-chip-active" : "tab-outline-btn"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {preset !== "semester_summary" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              <div>
                <label className="block text-xs text-slate-300/70 mb-1">class_section</label>
                <select
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  className="w-full px-3 py-2 text-xs tab-input rounded-md"
                >
                  {sections.map((s) => (
                    <option key={s} value={s} className="bg-[#090514]">
                      {s === "ALL" ? "Any Section" : s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-300/70 mb-1">stress_level &gt;=</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={minStress}
                  onChange={(e) => setMinStress(e.target.value)}
                  placeholder="e.g. 8"
                  className="w-full px-3 py-2 text-xs tab-input rounded-md tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300/70 mb-1">sleep_hours &lt;</label>
                <input
                  type="number"
                  step="0.5"
                  value={maxSleep}
                  onChange={(e) => setMaxSleep(e.target.value)}
                  placeholder="e.g. 6.5"
                  className="w-full px-3 py-2 text-xs tab-input rounded-md tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300/70 mb-1">wellness_index &gt;=</label>
                <input
                  type="number"
                  value={minWellness}
                  onChange={(e) => setMinWellness(e.target.value)}
                  placeholder="e.g. 80"
                  className="w-full px-3 py-2 text-xs tab-input rounded-md tabular-nums"
                />
              </div>
            </div>
          )}

          <pre className="p-4 bg-[#090514] border tab-divider rounded-md text-xs font-mono text-violet-200 overflow-x-auto leading-relaxed">
            {sqlPreview}
          </pre>

          {preset === "semester_summary" ? (
            <div className="overflow-x-auto border tab-divider rounded-md">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0F0820] border-b tab-divider text-xs font-medium text-slate-300/75">
                    <th className="py-2.5 px-4">semester</th>
                    <th className="py-2.5 px-4 text-right">Students</th>
                    <th className="py-2.5 px-4 text-right">Reports</th>
                    <th className="py-2.5 px-4 text-right">Avg Sleep</th>
                    <th className="py-2.5 px-4 text-right">Avg Stress</th>
                    <th className="py-2.5 px-4 text-right">Avg Wellness</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-violet-500/15 text-xs">
                  {semesterAggregates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 px-4 text-center text-slate-300/65">
                        No semester aggregates available yet.
                      </td>
                    </tr>
                  ) : (
                    semesterAggregates.map((row) => (
                      <tr key={row.semester} className="hover:bg-[#1B0F36]">
                        <td className="py-2.5 px-4 font-mono font-medium text-slate-50">
                          {row.semester}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {row.studentCount}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {row.reportCount}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {row.avgSleep === "—" ? "—" : `${row.avgSleep} hrs`}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {row.avgStress === "—" ? "—" : `${row.avgStress} / 10`}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-semibold text-fuchsia-300 tabular-nums">
                          {row.avgWellness !== null ? `${row.avgWellness} / 100` : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto border tab-divider rounded-md">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0F0820] border-b tab-divider text-xs font-medium text-slate-300/75">
                    <th className="py-2.5 px-4">report_id</th>
                    <th className="py-2.5 px-4">student_id</th>
                    <th className="py-2.5 px-4">name</th>
                    <th className="py-2.5 px-4">dept_name</th>
                    <th className="py-2.5 px-4">submission_date</th>
                    <th className="py-2.5 px-4 text-right">sleep_hours</th>
                    <th className="py-2.5 px-4 text-right">stress_level</th>
                    <th className="py-2.5 px-4 text-right">wellness_index</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-violet-500/15 text-xs">
                  {joinedResults.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 px-4 text-center text-slate-300/65">
                        Query returned 0 rows.
                      </td>
                    </tr>
                  ) : (
                    joinedResults.map(({ report, student }) => {
                      const dept = student?.dept_id ? deptMap.get(student.dept_id) : undefined;
                      return (
                        <tr key={report.report_id} className="hover:bg-[#1B0F36]">
                          <td className="py-2.5 px-4 font-mono">
                            <button
                              type="button"
                              onClick={() => onInspectReport(report)}
                              className="text-violet-300 hover:underline"
                            >
                              {report.report_id}
                            </button>
                          </td>
                          <td className="py-2.5 px-4 font-mono">
                            <button
                              type="button"
                              onClick={() => onInspectStudent(report.student_id)}
                              className="text-violet-300 hover:underline"
                            >
                              {report.student_id}
                            </button>
                          </td>
                          <td className="py-2.5 px-4 text-slate-50">{student?.name ?? "—"}</td>
                          <td className="py-2.5 px-4 text-slate-300/80">
                            {dept?.dept_name ?? "—"}
                          </td>
                          <td className="py-2.5 px-4 font-mono tabular-nums text-slate-300/70">
                            {report.submission_date}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                            {report.sleep_hours.toFixed(1)}
                          </td>
                          <td
                            className={`py-2.5 px-4 text-right font-mono tabular-nums ${
                              report.stress_level >= 8 ? "text-rose-300 font-semibold" : ""
                            }`}
                          >
                            {report.stress_level}/10
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-semibold text-fuchsia-300 tabular-nums">
                            {report.wellness_index}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Panel 2: Departments Management (Admin) */}
      {panel === "departments" && (
        <section className="tab-surface-card rounded-lg p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b tab-divider">
            <div>
              <h3 className="text-base font-semibold text-slate-50 flex items-center gap-2">
                <Building2 className="w-4 h-4 tab-accent-text" aria-hidden="true" />
                <span>departments Table (PK: dept_id)</span>
              </h3>
              <p className="mt-0.5 text-xs text-slate-300/70">
                Manage academic departments referenced by students.dept_id.
              </p>
            </div>
            {!isAdmin && (
              <span className="text-xs text-amber-200/85">
                Switch sidebar role to Admin to create, edit, or delete departments.
              </span>
            )}
          </div>

          {isAdmin && (
            <form onSubmit={(e) => void handleDepartmentSubmit(e)} className="space-y-3">
              {deptError && (
                <div className="px-3 py-2 text-xs text-rose-200 bg-rose-500/15 border border-rose-500/35 rounded">
                  {deptError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="dept_name (e.g. Computer Science)"
                  className="px-3 py-2 text-xs tab-input rounded-md"
                />
                <input
                  type="text"
                  value={deptBuilding}
                  onChange={(e) => setDeptBuilding(e.target.value)}
                  placeholder="building (e.g. Science Block A)"
                  className="px-3 py-2 text-xs tab-input rounded-md"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold tab-cta-btn rounded-md"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{editingDept ? "Update Dept" : "Add Department"}</span>
                  </button>
                  {editingDept && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDept(null);
                        setDeptName("");
                        setDeptBuilding("");
                      }}
                      className="px-3 py-2 text-xs tab-outline-btn rounded-md"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </form>
          )}

          <div className="overflow-x-auto border tab-divider rounded-md">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#0F0820] border-b tab-divider text-slate-300/75">
                  <th className="py-2.5 px-4">dept_id (PK)</th>
                  <th className="py-2.5 px-4">dept_name</th>
                  <th className="py-2.5 px-4">building</th>
                  <th className="py-2.5 px-4 text-right">Linked Students</th>
                  {isAdmin && <th className="py-2.5 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-500/15">
                {db.departments.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="py-8 text-center text-slate-300/65">
                      No departments created yet.
                    </td>
                  </tr>
                ) : (
                  db.departments.map((d) => {
                    const count = db.students.filter((s) => s.dept_id === d.dept_id).length;
                    return (
                      <tr key={d.dept_id} className="hover:bg-[#1B0F36]">
                        <td className="py-2.5 px-4 font-mono text-violet-300">{d.dept_id}</td>
                        <td className="py-2.5 px-4 font-medium text-slate-50">{d.dept_name}</td>
                        <td className="py-2.5 px-4 text-slate-200/80">{d.building}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{count}</td>
                        {isAdmin && (
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            {confirmCascadeDeptId === d.dept_id ? (
                              <div className="inline-flex items-center gap-2">
                                <span className="text-amber-300">Unlink {count} student(s)?</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteDepartment(d.dept_id, true);
                                    setConfirmCascadeDeptId(null);
                                  }}
                                  className="px-2 py-1 text-white bg-rose-600 rounded"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmCascadeDeptId(null)}
                                  className="px-2 py-1 tab-outline-btn rounded"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDept(d);
                                    setDeptName(d.dept_name);
                                    setDeptBuilding(d.building);
                                    setDeptError(null);
                                  }}
                                  className="p-1.5 text-slate-300 hover:text-fuchsia-300 rounded"
                                  aria-label={`Edit ${d.dept_name}`}
                                >
                                  <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const res = onDeleteDepartment(d.dept_id, false);
                                    if (!res.ok) {
                                      setDeptError(res.error ?? null);
                                      setConfirmCascadeDeptId(d.dept_id);
                                    }
                                  }}
                                  className="p-1.5 text-slate-300 hover:text-rose-400 rounded"
                                  aria-label={`Delete ${d.dept_name}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Panel 3: Users & Roles (Admin) */}
      {panel === "users" && (
        <section className="tab-surface-card rounded-lg p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b tab-divider">
            <div>
              <h3 className="text-base font-semibold text-slate-50 flex items-center gap-2">
                <Shield className="w-4 h-4 tab-accent-text" aria-hidden="true" />
                <span>users Table (PK: user_id · SHA-256 password_hash)</span>
              </h3>
              <p className="mt-0.5 text-xs text-slate-300/70">
                Passwords are salted &amp; hashed with SHA-256 before saving; plain-text passwords are never stored or displayed.
              </p>
            </div>
            {!isAdmin && (
              <span className="text-xs text-amber-200/85">
                Switch sidebar role to Admin to manage user accounts.
              </span>
            )}
          </div>

          {isAdmin && (
            <form onSubmit={(e) => void handleUserSubmit(e)} className="space-y-3">
              {userError && (
                <div className="px-3 py-2 text-xs text-rose-200 bg-rose-500/15 border border-rose-500/35 rounded">
                  {userError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  className="px-3 py-2 text-xs tab-input rounded-md"
                />
                <input
                  type="password"
                  value={rawPassword}
                  onChange={(e) => setRawPassword(e.target.value)}
                  placeholder={editingUser ? "new password (optional)" : "password (hashed)"}
                  className="px-3 py-2 text-xs tab-input rounded-md"
                />
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value as UserRole)}
                  className="px-3 py-2 text-xs tab-input rounded-md"
                >
                  <option value="Student" className="bg-[#090514]">Student</option>
                  <option value="Admin" className="bg-[#090514]">Admin</option>
                </select>
                <select
                  value={linkedStudentId}
                  onChange={(e) => setLinkedStudentId(e.target.value)}
                  className="px-3 py-2 text-xs tab-input rounded-md"
                >
                  <option value="" className="bg-[#090514]">No student link (1:1)</option>
                  {db.students.map((s) => (
                    <option key={s.student_id} value={s.student_id} className="bg-[#090514]">
                      {s.student_id} — {s.name}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isHashing}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold tab-cta-btn rounded-md disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{editingUser ? "Update User" : "Add User"}</span>
                  </button>
                  {editingUser && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUser(null);
                        setUsername("");
                        setRawPassword("");
                      }}
                      className="px-3 py-2 text-xs tab-outline-btn rounded-md"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </form>
          )}

          <div className="overflow-x-auto border tab-divider rounded-md">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#0F0820] border-b tab-divider text-slate-300/75">
                  <th className="py-2.5 px-4">user_id (PK)</th>
                  <th className="py-2.5 px-4">username</th>
                  <th className="py-2.5 px-4">role</th>
                  <th className="py-2.5 px-4">student_id (FK)</th>
                  <th className="py-2.5 px-4">password_hash (Salted SHA-256)</th>
                  {isAdmin && <th className="py-2.5 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-500/15">
                {db.users.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="py-8 text-center text-slate-300/65">
                      No user accounts created yet.
                    </td>
                  </tr>
                ) : (
                  db.users.map((u) => (
                    <tr key={u.user_id} className="hover:bg-[#1B0F36]">
                      <td className="py-2.5 px-4 font-mono text-violet-300">{u.user_id}</td>
                      <td className="py-2.5 px-4 font-medium text-slate-50">{u.username}</td>
                      <td className="py-2.5 px-4 text-slate-200">{u.role}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-300/80">
                        {u.student_id ?? "—"}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400 max-w-[240px] truncate">
                        sha256$•••••••• (Protected)
                      </td>
                      {isAdmin && (
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUser(u);
                                setUsername(u.username);
                                setRawPassword("");
                                setUserRole(u.role);
                                setLinkedStudentId(u.student_id ?? "");
                                setUserError(null);
                              }}
                              className="p-1.5 text-slate-300 hover:text-fuchsia-300 rounded"
                              aria-label={`Edit ${u.username}`}
                            >
                              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteUser(u.user_id)}
                              className="p-1.5 text-slate-300 hover:text-rose-400 rounded"
                              aria-label={`Delete ${u.username}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Panel 4: Stress Factors & M:N report_factors */}
      {panel === "factors" && (
        <section className="tab-surface-card rounded-lg p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b tab-divider">
            <div>
              <h3 className="text-base font-semibold text-slate-50 flex items-center gap-2">
                <Tag className="w-4 h-4 tab-accent-text" aria-hidden="true" />
                <span>stress_factors &amp; report_factors (M:N Bridge)</span>
              </h3>
              <p className="mt-0.5 text-xs text-slate-300/70">
                Create stress factor definitions or load standard factor presets cleanly on demand.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSeedStandardFactors}
              className="px-3 py-1.5 text-xs font-medium tab-outline-btn rounded-md"
            >
              + Add Standard Factors (Exams, Workload, Sleep, Financial, Personal)
            </button>
          </div>

          <form onSubmit={handleFactorSubmit} className="space-y-3">
            {factorError && (
              <div className="px-3 py-2 text-xs text-rose-200 bg-rose-500/15 border border-rose-500/35 rounded">
                {factorError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={factorName}
                onChange={(e) => setFactorName(e.target.value)}
                placeholder="factor_name (e.g. Exams)"
                className="px-3 py-2 text-xs tab-input rounded-md"
              />
              <input
                type="text"
                value={factorDesc}
                onChange={(e) => setFactorDesc(e.target.value)}
                placeholder="description"
                className="px-3 py-2 text-xs tab-input rounded-md"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold tab-cta-btn rounded-md"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Stress Factor</span>
              </button>
            </div>
          </form>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="overflow-x-auto border tab-divider rounded-md">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0F0820] border-b tab-divider text-slate-300/75">
                    <th className="py-2.5 px-3">factor_id (PK)</th>
                    <th className="py-2.5 px-3">factor_name</th>
                    <th className="py-2.5 px-3 text-right">Links</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-violet-500/15">
                  {db.stress_factors.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-300/65">
                        No stress factors created yet.
                      </td>
                    </tr>
                  ) : (
                    db.stress_factors.map((f) => {
                      const refCount = db.report_factors.filter(
                        (rf) => rf.factor_id === f.factor_id
                      ).length;
                      return (
                        <tr key={f.factor_id} className="hover:bg-[#1B0F36]">
                          <td className="py-2.5 px-3 font-mono text-violet-300">{f.factor_id}</td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-slate-50">{f.factor_name}</div>
                            <div className="text-[11px] text-slate-300/65">{f.description}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {refCount}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            {confirmCascadeFactorId === f.factor_id ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteFactor(f.factor_id, true);
                                    setConfirmCascadeFactorId(null);
                                  }}
                                  className="px-2 py-1 text-white bg-rose-600 rounded"
                                >
                                  Cascade
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmCascadeFactorId(null)}
                                  className="px-2 py-1 tab-outline-btn rounded"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  const res = onDeleteFactor(f.factor_id, false);
                                  if (!res.ok) {
                                    setFactorError(res.error ?? null);
                                    setConfirmCascadeFactorId(f.factor_id);
                                  }
                                }}
                                className="p-1.5 text-slate-300 hover:text-rose-400 rounded"
                                aria-label={`Delete factor ${f.factor_name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto border tab-divider rounded-md">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0F0820] border-b tab-divider text-slate-300/75">
                    <th className="py-2.5 px-3">report_id (PK, FK)</th>
                    <th className="py-2.5 px-3">factor_id (PK, FK)</th>
                    <th className="py-2.5 px-3">Factor Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-violet-500/15">
                  {db.report_factors.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-slate-300/65">
                        No report_factors M:N bridge entries yet.
                      </td>
                    </tr>
                  ) : (
                    db.report_factors.map((rf: ReportFactor) => (
                      <tr
                        key={`${rf.report_id}-${rf.factor_id}`}
                        className="hover:bg-[#1B0F36]"
                      >
                        <td className="py-2.5 px-3 font-mono text-fuchsia-300">{rf.report_id}</td>
                        <td className="py-2.5 px-3 font-mono text-violet-300">{rf.factor_id}</td>
                        <td className="py-2.5 px-3 text-slate-100">
                          {factorMap.get(rf.factor_id)?.factor_name ?? "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
