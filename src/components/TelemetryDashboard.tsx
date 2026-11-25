import { useMemo, useState } from "react";
import { ArrowUpDown, Edit3, Eye, Search, Trash2, X } from "lucide-react";
import type {
  ActiveRole,
  Department,
  FeverStatus,
  ReportFactor,
  StressFactor,
  StressReport,
  Student,
} from "../types";
import { getStressBand } from "../utils/dbStorage";

interface TelemetryDashboardProps {
  activeRole: ActiveRole;
  selectedStudentId: string;
  departments: Department[];
  students: Student[];
  reports: StressReport[];
  stressFactors: StressFactor[];
  reportFactors: ReportFactor[];
  onInspectReport: (report: StressReport) => void;
  onInspectStudent: (studentId: string) => void;
  onUpdateReport: (
    reportId: string,
    updates: {
      stress_level: number;
      submission_date: string;
      remarks: string;
      sleep_hours?: number;
      water_intake?: number;
      fever_status?: FeverStatus;
      factorIds?: string[];
    }
  ) => { ok: boolean; error?: string };
  onDeleteReport: (reportId: string) => void;
  onStartSurvey: (studentId?: string) => void;
}

type SortField = "submission_date" | "wellness_index" | "sleep_hours" | "stress_level";
type StressBandFilter = "All" | "Low" | "Moderate" | "High";

export function TelemetryDashboard({
  activeRole,
  selectedStudentId,
  departments,
  students,
  reports,
  stressFactors,
  reportFactors,
  onInspectReport,
  onInspectStudent,
  onUpdateReport,
  onDeleteReport,
  onStartSurvey,
}: TelemetryDashboardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [studentIdFilter, setStudentIdFilter] = useState("ALL");
  const [factorFilter, setFactorFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [highStressOnly, setHighStressOnly] = useState(false);
  const [stressBand, setStressBand] = useState<StressBandFilter>("All");
  const [sectionFilter, setSectionFilter] = useState("All");
  const [sortField, setSortField] = useState<SortField>("submission_date");
  const [sortDesc, setSortDesc] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Edit / Revise modal state
  const [editingReport, setEditingReport] = useState<StressReport | null>(null);
  const [editStress, setEditStress] = useState("5");
  const [editDate, setEditDate] = useState("");
  const [editSleep, setEditSleep] = useState("7");
  const [editWater, setEditWater] = useState("6");
  const [editRemarks, setEditRemarks] = useState("");
  const [editFactorIds, setEditFactorIds] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    for (const s of students) map.set(s.student_id, s);
    return map;
  }, [students]);

  const deptMap = useMemo(() => {
    const map = new Map<string, Department>();
    for (const d of departments) map.set(d.dept_id, d);
    return map;
  }, [departments]);

  const factorMap = useMemo(() => {
    const map = new Map<string, StressFactor>();
    for (const f of stressFactors) map.set(f.factor_id, f);
    return map;
  }, [stressFactors]);

  const factorsByReport = useMemo(() => {
    const map = new Map<string, StressFactor[]>();
    for (const rf of reportFactors) {
      const f = factorMap.get(rf.factor_id);
      if (!f) continue;
      const list = map.get(rf.report_id) ?? [];
      list.push(f);
      map.set(rf.report_id, list);
    }
    return map;
  }, [reportFactors, factorMap]);

  const classSections = useMemo(() => {
    const list = Array.from(new Set(students.map((s) => s.class_section))).sort();
    return ["All", ...list];
  }, [students]);

  const metrics = useMemo(() => {
    if (reports.length === 0) {
      return {
        avgSleep: "—",
        avgWellness: "—",
        avgStress: "—",
        highStressCount: 0,
      };
    }
    const avgSleep = reports.reduce((a, s) => a + s.sleep_hours, 0) / reports.length;
    const avgWellness = Math.round(
      reports.reduce((a, s) => a + s.wellness_index, 0) / reports.length
    );
    const avgStress = (
      reports.reduce((a, s) => a + s.stress_level, 0) / reports.length
    ).toFixed(1);
    const highStressCount = reports.filter((s) => s.stress_level >= 8).length;

    return {
      avgSleep: `${avgSleep.toFixed(1)} hrs`,
      avgWellness: `${avgWellness} / 100`,
      avgStress: `${avgStress} / 10`,
      highStressCount,
    };
  }, [reports]);

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reports
      .filter((rpt) => {
        const student = studentMap.get(rpt.student_id);
        const linkedFactors = factorsByReport.get(rpt.report_id) ?? [];
        const band = getStressBand(rpt.stress_level);

        if (studentIdFilter !== "ALL" && rpt.student_id !== studentIdFilter) return false;
        if (sectionFilter !== "ALL" && student?.class_section !== sectionFilter) return false;
        if (stressBand !== "All" && band !== stressBand) return false;
        if (highStressOnly && rpt.stress_level < 8) return false;
        if (dateFrom && rpt.submission_date < dateFrom) return false;
        if (dateTo && rpt.submission_date > dateTo) return false;
        if (
          factorFilter !== "ALL" &&
          !linkedFactors.some((f) => f.factor_id === factorFilter)
        ) {
          return false;
        }
        if (!q) return true;
        return (
          rpt.report_id.toLowerCase().includes(q) ||
          rpt.student_id.toLowerCase().includes(q) ||
          (student?.name.toLowerCase().includes(q) ?? false) ||
          (student?.class_section.toLowerCase().includes(q) ?? false) ||
          rpt.remarks.toLowerCase().includes(q) ||
          rpt.ai_assessment.toLowerCase().includes(q) ||
          linkedFactors.some((f) => f.factor_name.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortField === "submission_date") {
          diff =
            a.submission_date.localeCompare(b.submission_date) ||
            a.report_id.localeCompare(b.report_id);
        } else {
          diff = a[sortField] - b[sortField];
        }
        return sortDesc ? -diff : diff;
      });
  }, [
    reports,
    studentMap,
    factorsByReport,
    searchQuery,
    studentIdFilter,
    factorFilter,
    dateFrom,
    dateTo,
    highStressOnly,
    stressBand,
    sectionFilter,
    sortField,
    sortDesc,
  ]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDesc((prev) => !prev);
    } else {
      setSortField(field);
      setSortDesc(true);
    }
  }

  function openEditModal(rpt: StressReport) {
    const linked = (factorsByReport.get(rpt.report_id) ?? []).map((f) => f.factor_id);
    setEditingReport(rpt);
    setEditStress(String(rpt.stress_level));
    setEditDate(rpt.submission_date);
    setEditSleep(String(rpt.sleep_hours));
    setEditWater(String(rpt.water_intake));
    setEditRemarks(rpt.remarks);
    setEditFactorIds(linked);
    setEditError(null);
  }

  function handleSaveRevision(e: React.FormEvent) {
    e.preventDefault();
    if (!editingReport) return;
    setEditError(null);

    const stressNum = Number(editStress);
    const sleepNum = Number(editSleep);
    const waterNum = Number(editWater);

    if (!Number.isFinite(stressNum) || stressNum < 1 || stressNum > 10) {
      setEditError("Stress level must be between 1 and 10.");
      return;
    }
    if (!editRemarks.trim()) {
      setEditError("Remarks cannot be empty.");
      return;
    }

    const res = onUpdateReport(editingReport.report_id, {
      stress_level: Math.round(stressNum),
      submission_date: editDate || editingReport.submission_date,
      remarks: editRemarks.trim(),
      sleep_hours: Number.isFinite(sleepNum) ? sleepNum : editingReport.sleep_hours,
      water_intake: Number.isFinite(waterNum) ? waterNum : editingReport.water_intake,
      factorIds: editFactorIds,
    });

    if (!res.ok) {
      setEditError(res.error ?? "Unable to revise stress report.");
      return;
    }
    setEditingReport(null);
  }

  function toggleEditFactor(factorId: string) {
    setEditFactorIds((prev) =>
      prev.includes(factorId) ? prev.filter((id) => id !== factorId) : [...prev, factorId]
    );
  }

  const canReviseReport = (rpt: StressReport) => {
    if (activeRole === "Admin" || activeRole === "Counselor") return true;
    // Student can revise their own entries (matching selectedStudentId, or any if none selected)
    return !selectedStudentId || rpt.student_id === selectedStudentId;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="tab-surface-card rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-300/75">students Table</div>
          <div className="mt-1.5 text-2xl font-semibold text-slate-50 tabular-nums">
            {students.length}
          </div>
          <div className="mt-1 text-xs text-slate-300/65">
            {departments.length} department(s) linked
          </div>
        </div>

        <div className="tab-surface-card rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-300/75">stress_reports Table</div>
          <div className="mt-1.5 text-2xl font-semibold text-slate-50 tabular-nums">
            {reports.length}
          </div>
          <div className="mt-1 text-xs text-rose-300/85 tabular-nums">
            {metrics.highStressCount} high-stress alerts (&ge; 8/10)
          </div>
        </div>

        <div className="tab-surface-card rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-300/75">Mean Sleep &amp; Stress</div>
          <div className="mt-1.5 text-2xl font-semibold text-fuchsia-300 tabular-nums">
            {metrics.avgSleep}
          </div>
          <div className="mt-1 text-xs text-slate-300/65 tabular-nums">
            Avg stress level: {metrics.avgStress}
          </div>
        </div>

        <div className="tab-surface-card rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-300/75">Mean Wellness Index</div>
          <div className="mt-1.5 text-2xl font-semibold text-violet-300 tabular-nums">
            {metrics.avgWellness}
          </div>
          <div className="mt-1 text-xs text-slate-300/65 tabular-nums">
            {stressFactors.length} stress factors · {reportFactors.length} M:N links
          </div>
        </div>
      </div>

      {/* Role-aware context bar */}
      {activeRole === "Student" && selectedStudentId && (
        <div className="px-4 py-2.5 bg-[#120926] border tab-divider rounded-lg text-xs text-slate-200 flex flex-wrap items-center justify-between gap-2">
          <span>
            Student View: You can revise your own submitted reports ({studentMap.get(selectedStudentId)?.name ?? selectedStudentId}) and compare history over time.
          </span>
          <button
            type="button"
            onClick={() =>
              setStudentIdFilter((prev) =>
                prev === selectedStudentId ? "ALL" : selectedStudentId
              )
            }
            className="px-3 py-1 text-xs font-medium tab-outline-btn rounded"
          >
            {studentIdFilter === selectedStudentId ? "Show All Students" : "Filter My Entries Only"}
          </button>
        </div>
      )}

      <section className="tab-surface-card rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b tab-divider space-y-4">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-50">
                stress_reports Relational Ledger
              </h2>
              <p className="mt-0.5 text-xs text-slate-300/70">
                Joined view of stress_reports (PK: report_id, FK: student_id) with M:N report_factors and AI guidance.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className="w-4 h-4 text-violet-300/60 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search ID, student, factor, remarks..."
                  aria-label="Search stress reports"
                  className="pl-9 pr-3 py-2 text-xs tab-input rounded-md w-64"
                />
              </div>

              <button
                type="button"
                onClick={() => setHighStressOnly((prev) => !prev)}
                className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                  highStressOnly
                    ? "bg-rose-500/20 text-rose-200 border-rose-400/50"
                    : "tab-outline-btn"
                }`}
              >
                High-Stress Only (&ge; 8)
              </button>
            </div>
          </div>

          {/* Multi-criteria Counselor / Student Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 pt-1">
            <select
              value={studentIdFilter}
              onChange={(e) => setStudentIdFilter(e.target.value)}
              aria-label="Filter by student ID"
              className="px-2.5 py-2 text-xs tab-input rounded-md"
            >
              <option value="ALL" className="bg-[#090514]">All Students</option>
              {students.map((s) => (
                <option key={s.student_id} value={s.student_id} className="bg-[#090514]">
                  {s.student_id} · {s.name}
                </option>
              ))}
            </select>

            <select
              value={factorFilter}
              onChange={(e) => setFactorFilter(e.target.value)}
              aria-label="Filter by stress factor"
              className="px-2.5 py-2 text-xs tab-input rounded-md"
            >
              <option value="ALL" className="bg-[#090514]">All Stress Factors</option>
              {stressFactors.map((f) => (
                <option key={f.factor_id} value={f.factor_id} className="bg-[#090514]">
                  {f.factor_name}
                </option>
              ))}
            </select>

            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              aria-label="Filter by class section"
              className="px-2.5 py-2 text-xs tab-input rounded-md"
            >
              {classSections.map((sec) => (
                <option key={sec} value={sec} className="bg-[#090514]">
                  {sec === "All" ? "All Sections" : `Section ${sec}`}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="Filter from date"
              className="px-2.5 py-2 text-xs tab-input rounded-md tabular-nums"
              title="From submission date"
            />

            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="Filter to date"
              className="px-2.5 py-2 text-xs tab-input rounded-md tabular-nums"
              title="To submission date"
            />

            <div
              role="group"
              aria-label="Filter by stress band"
              className="inline-flex items-center p-0.5 bg-[#090514] border tab-divider rounded-md"
            >
              {(["All", "Low", "Moderate", "High"] as const).map((band) => (
                <button
                  key={band}
                  type="button"
                  onClick={() => setStressBand(band)}
                  className={`flex-1 px-2 py-1.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                    stressBand === band
                      ? "tab-chip-active border"
                      : "text-slate-300/65 border border-transparent hover:text-slate-50"
                  }`}
                >
                  {band}
                </button>
              ))}
            </div>
          </div>
        </div>

        {reports.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <h3 className="text-sm font-semibold text-slate-50">No stress reports recorded</h3>
            <p className="mt-1 text-sm text-slate-300/70 max-w-md mx-auto">
              Start an AI Health Survey or log a Daily Health Check-In to record stress levels, contributing factors, and guidance.
            </p>
            <button
              type="button"
              onClick={() => onStartSurvey()}
              className="mt-4 inline-flex items-center px-4 py-2 text-sm font-semibold rounded-md tab-cta-btn whitespace-nowrap"
            >
              Start Health Survey
            </button>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="text-sm font-semibold text-slate-50">No matching stress reports</h3>
            <p className="mt-1 text-sm text-slate-300/70">
              Adjust student, factor, date range, or stress level filters to view records.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setStudentIdFilter("ALL");
                setFactorFilter("ALL");
                setDateFrom("");
                setDateTo("");
                setHighStressOnly(false);
                setStressBand("All");
                setSectionFilter("All");
              }}
              className="mt-3 px-3 py-1.5 text-xs font-medium tab-outline-btn rounded-md"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#0F0820] border-b tab-divider text-xs font-medium text-slate-300/75">
                  <th className="py-3 px-4 whitespace-nowrap">report_id (PK)</th>
                  <th className="py-3 px-4 whitespace-nowrap">student_id (FK) &amp; Profile</th>
                  <th className="py-3 px-4 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort("submission_date")}
                      className="inline-flex items-center gap-1 hover:text-slate-50"
                    >
                      <span>submission_date</span>
                      <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort("sleep_hours")}
                      className="inline-flex items-center gap-1 hover:text-slate-50"
                    >
                      <span>Sleep</span>
                      <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="py-3 px-4 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort("stress_level")}
                      className="inline-flex items-center gap-1 hover:text-slate-50"
                    >
                      <span>stress_level</span>
                      <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="py-3 px-4 whitespace-nowrap">report_factors</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort("wellness_index")}
                      className="inline-flex items-center gap-1 hover:text-slate-50"
                    >
                      <span>Wellness</span>
                      <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="py-3 px-4 min-w-[200px]">remarks</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-500/15 text-sm">
                {filteredReports.map((rpt) => {
                  const student = studentMap.get(rpt.student_id);
                  const dept = student?.dept_id ? deptMap.get(student.dept_id) : undefined;
                  const linkedFactors = factorsByReport.get(rpt.report_id) ?? [];
                  const band = getStressBand(rpt.stress_level);
                  const stressColor =
                    rpt.stress_level >= 8
                      ? "text-rose-300 font-semibold"
                      : band === "Moderate"
                        ? "text-amber-300"
                        : "text-emerald-300";

                  return (
                    <tr
                      key={rpt.report_id}
                      className="hover:bg-[#1B0F36] transition-colors align-top"
                    >
                      <td className="py-3 px-4 font-mono text-xs text-violet-200 whitespace-nowrap tabular-nums">
                        {rpt.report_id}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onInspectStudent(rpt.student_id)}
                          className="font-mono text-xs font-medium text-violet-300 hover:underline rounded"
                        >
                          {rpt.student_id}
                        </button>
                        <div className="text-xs font-medium text-slate-50 mt-0.5">
                          {student?.name ?? "Unknown Student"}
                        </div>
                        <div className="text-xs text-slate-300/65">
                          {student?.semester ?? "—"} · {student?.class_section ?? "—"}
                          {dept ? ` · ${dept.dept_name}` : ""}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-300/75 whitespace-nowrap tabular-nums">
                        {rpt.submission_date}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-100 whitespace-nowrap tabular-nums">
                        {rpt.sleep_hours.toFixed(1)}h
                      </td>
                      <td className={`py-3 px-4 text-xs whitespace-nowrap tabular-nums ${stressColor}`}>
                        {rpt.stress_level}/10 · {band}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-200/85 max-w-[180px]">
                        {linkedFactors.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {linkedFactors.map((f) => (
                              <span
                                key={f.factor_id}
                                className="px-1.5 py-0.5 text-[10px] bg-[#090514] border tab-divider rounded text-fuchsia-200"
                              >
                                {f.factor_name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-fuchsia-300 whitespace-nowrap tabular-nums">
                        {rpt.wellness_index}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-100/90 leading-relaxed max-w-xs">
                        <p className="line-clamp-2">{rpt.remarks}</p>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {pendingDeleteId === rpt.report_id ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteReport(rpt.report_id);
                                setPendingDeleteId(null);
                              }}
                              className="px-2 py-1 text-xs font-medium text-white bg-rose-600 hover:bg-rose-500 rounded"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(null)}
                              className="px-2 py-1 text-xs font-medium tab-outline-btn rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onInspectReport(rpt)}
                              aria-label={`Inspect report ${rpt.report_id}`}
                              className="p-1.5 text-slate-300/75 hover:text-violet-200 hover:bg-violet-500/15 rounded"
                              title="Inspect full report"
                            >
                              <Eye className="w-4 h-4" aria-hidden="true" />
                            </button>
                            {canReviseReport(rpt) && (
                              <button
                                type="button"
                                onClick={() => openEditModal(rpt)}
                                aria-label={`Edit report ${rpt.report_id}`}
                                className="p-1.5 text-slate-300/75 hover:text-fuchsia-300 hover:bg-fuchsia-500/15 rounded"
                                title="Edit / Revise report"
                              >
                                <Edit3 className="w-4 h-4" aria-hidden="true" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(rpt.report_id)}
                              aria-label={`Delete report ${rpt.report_id}`}
                              className="p-1.5 text-slate-300/75 hover:text-rose-400 hover:bg-rose-500/10 rounded"
                              title="Delete report"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Edit / Revise Stress Report Modal */}
      {editingReport && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
        >
          <div className="bg-[#120926] border border-violet-500/35 rounded-lg w-full max-w-lg overflow-hidden shadow-[0_0_48px_rgba(168,85,247,0.2)]">
            <div className="px-5 py-4 border-b tab-divider flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-50">
                  Revise Report · {editingReport.report_id}
                </h3>
                <p className="text-xs text-slate-300/70">
                  Update stress level, remarks, and M:N stress factors.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingReport(null)}
                aria-label="Close edit dialog"
                className="p-1.5 text-slate-300/70 hover:text-slate-50 rounded"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveRevision} className="p-5 space-y-4">
              {editError && (
                <div className="px-3 py-2 text-xs text-rose-200 bg-rose-500/15 border border-rose-500/35 rounded">
                  {editError}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-slate-300/80 mb-1">stress_level (1-10)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={editStress}
                    onChange={(e) => setEditStress(e.target.value)}
                    className="w-full px-3 py-2 text-xs tab-input rounded-md tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300/80 mb-1">submission_date</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs tab-input rounded-md tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300/80 mb-1">sleep_hours</label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={18}
                    value={editSleep}
                    onChange={(e) => setEditSleep(e.target.value)}
                    className="w-full px-3 py-2 text-xs tab-input rounded-md tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300/80 mb-1">water_intake</label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={editWater}
                    onChange={(e) => setEditWater(e.target.value)}
                    className="w-full px-3 py-2 text-xs tab-input rounded-md tabular-nums"
                  />
                </div>
              </div>

              {stressFactors.length > 0 && (
                <div>
                  <span className="block text-xs text-slate-300/80 mb-1.5">
                    Contributing Stress Factors (report_factors)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {stressFactors.map((f) => {
                      const selected = editFactorIds.includes(f.factor_id);
                      return (
                        <button
                          key={f.factor_id}
                          type="button"
                          onClick={() => toggleEditFactor(f.factor_id)}
                          className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                            selected ? "tab-chip-active" : "tab-outline-btn"
                          }`}
                        >
                          {f.factor_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-300/80 mb-1">remarks</label>
                <textarea
                  rows={3}
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  className="w-full px-3 py-2 text-xs tab-input rounded-md"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingReport(null)}
                  className="px-4 py-2 text-xs font-medium tab-outline-btn rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold tab-cta-btn rounded-md"
                >
                  Save Revision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
