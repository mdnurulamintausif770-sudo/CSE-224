import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Eye,
  Stethoscope,
  TrendingUp,
} from "lucide-react";
import type {
  ActiveRole,
  Department,
  ReportFactor,
  StressFactor,
  StressReport,
  Student,
} from "../types";

interface AnalyticsInsightsProps {
  activeRole: ActiveRole;
  departments: Department[];
  students: Student[];
  reports: StressReport[];
  stressFactors: StressFactor[];
  reportFactors: ReportFactor[];
  selectedStudentId: string;
  onSelectStudentId: (id: string) => void;
  onInspectReport: (report: StressReport) => void;
  onInspectStudent: (studentId: string) => void;
  onConsultStudent: (studentId: string) => void;
  onNavigateSurvey: () => void;
}

type GroupingMode = "semester" | "weekly" | "monthly";

function getIsoWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr.slice(0, 7) || "Unknown";
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function AnalyticsInsights({
  activeRole,
  departments,
  students,
  reports,
  stressFactors,
  reportFactors,
  selectedStudentId,
  onSelectStudentId,
  onInspectReport,
  onInspectStudent,
  onConsultStudent,
  onNavigateSurvey,
}: AnalyticsInsightsProps) {
  const [groupingMode, setGroupingMode] = useState<GroupingMode>("semester");
  const [historyStudentId, setHistoryStudentId] = useState<string>(
    selectedStudentId || students[0]?.student_id || ""
  );

  const effectiveHistoryStudentId = useMemo(() => {
    if (historyStudentId && students.some((s) => s.student_id === historyStudentId)) {
      return historyStudentId;
    }
    if (selectedStudentId && students.some((s) => s.student_id === selectedStudentId)) {
      return selectedStudentId;
    }
    return students[0]?.student_id ?? "";
  }, [historyStudentId, selectedStudentId, students]);

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

  // 1. Individual student chronological stress history
  const studentChronologicalHistory = useMemo(() => {
    if (!effectiveHistoryStudentId) return [];
    return reports
      .filter((r) => r.student_id === effectiveHistoryStudentId)
      .sort(
        (a, b) =>
          a.submission_date.localeCompare(b.submission_date) ||
          a.report_id.localeCompare(b.report_id)
      );
  }, [reports, effectiveHistoryStudentId]);

  const studentHistoryStats = useMemo(() => {
    if (studentChronologicalHistory.length === 0) {
      return { avgStress: "—", minStress: "—", maxStress: "—", deltaLabel: "No baseline yet" };
    }
    const levels = studentChronologicalHistory.map((r) => r.stress_level);
    const avg = (levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(1);
    const min = Math.min(...levels);
    const max = Math.max(...levels);
    let deltaLabel = "Single entry logged";
    if (studentChronologicalHistory.length >= 2) {
      const prev = studentChronologicalHistory[studentChronologicalHistory.length - 2].stress_level;
      const latest = studentChronologicalHistory[studentChronologicalHistory.length - 1].stress_level;
      const diff = latest - prev;
      deltaLabel =
        diff > 0
          ? `+${diff} vs prior entry`
          : diff < 0
            ? `${diff} vs prior entry (improved)`
            : "Unchanged vs prior entry";
    }
    return { avgStress: `${avg}/10`, minStress: `${min}/10`, maxStress: `${max}/10`, deltaLabel };
  }, [studentChronologicalHistory]);

  // 2. Top recurring stress factors (COUNT & GROUP BY)
  const topFactors = useMemo(() => {
    const reportById = new Map<string, StressReport>();
    for (const r of reports) reportById.set(r.report_id, r);

    const counts = new Map<string, { factor: StressFactor; count: number; totalStress: number }>();
    for (const f of stressFactors) {
      counts.set(f.factor_id, { factor: f, count: 0, totalStress: 0 });
    }
    for (const rf of reportFactors) {
      const entry = counts.get(rf.factor_id);
      const rpt = reportById.get(rf.report_id);
      if (entry && rpt) {
        entry.count += 1;
        entry.totalStress += rpt.stress_level;
      }
    }

    const totalLinks = reportFactors.length || 1;
    return Array.from(counts.values())
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || a.factor.factor_name.localeCompare(b.factor.factor_name))
      .map((item) => ({
        factor: item.factor,
        count: item.count,
        sharePct: Math.round((item.count / totalLinks) * 100),
        avgStress: (item.totalStress / item.count).toFixed(1),
      }));
  }, [stressFactors, reportFactors, reports]);

  // 3. High-stress alerts (stress_level >= 8)
  const highStressAlerts = useMemo(() => {
    return reports
      .filter((r) => r.stress_level >= 8)
      .sort(
        (a, b) =>
          b.stress_level - a.stress_level ||
          b.submission_date.localeCompare(a.submission_date)
      );
  }, [reports]);

  // 4. Average stress grouped by semester / weekly / monthly
  const groupedSummaries = useMemo(() => {
    const buckets = new Map<
      string,
      { label: string; count: number; sumStress: number; maxStress: number; sumWellness: number }
    >();

    for (const r of reports) {
      const stu = studentMap.get(r.student_id);
      const key =
        groupingMode === "semester"
          ? stu?.semester || "Unspecified"
          : groupingMode === "weekly"
            ? getIsoWeekKey(r.submission_date)
            : r.submission_date.slice(0, 7) || "Unknown";

      const bucket = buckets.get(key) ?? {
        label: key,
        count: 0,
        sumStress: 0,
        maxStress: 0,
        sumWellness: 0,
      };
      bucket.count += 1;
      bucket.sumStress += r.stress_level;
      bucket.maxStress = Math.max(bucket.maxStress, r.stress_level);
      bucket.sumWellness += r.wellness_index;
      buckets.set(key, bucket);
    }

    return Array.from(buckets.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((b) => ({
        label: b.label,
        count: b.count,
        avgStress: (b.sumStress / b.count).toFixed(1),
        maxStress: b.maxStress,
        avgWellness: Math.round(b.sumWellness / b.count),
      }));
  }, [reports, studentMap, groupingMode]);

  const activeHistoryStudent = studentMap.get(effectiveHistoryStudentId) ?? null;

  return (
    <div className="space-y-6">
      {/* Top KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="tab-surface-card rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-300/75">Total Stress Reports</div>
          <div className="mt-1.5 text-2xl font-semibold text-slate-50 tabular-nums">
            {reports.length}
          </div>
          <div className="mt-1 text-xs text-slate-300/65">
            Active Role: {activeRole === "Counselor" ? "Counselor / Staff" : activeRole}
          </div>
        </div>

        <div className="tab-surface-card rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-300/75">High-Stress Alerts (&ge; 8/10)</div>
          <div
            className={`mt-1.5 text-2xl font-semibold tabular-nums ${
              highStressAlerts.length > 0 ? "text-rose-300" : "text-slate-50"
            }`}
          >
            {highStressAlerts.length}
          </div>
          <div className="mt-1 text-xs text-slate-300/65">
            Entries requiring counselor / wellness follow-up
          </div>
        </div>

        <div className="tab-surface-card rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-300/75">Top Stress Factor</div>
          <div className="mt-1.5 text-lg font-semibold tab-accent-text truncate">
            {topFactors[0]?.factor.factor_name ?? "—"}
          </div>
          <div className="mt-1 text-xs text-slate-300/65 tabular-nums">
            {topFactors[0]
              ? `${topFactors[0].count} linked report(s) · avg ${topFactors[0].avgStress}/10`
              : "No factor links recorded yet"}
          </div>
        </div>

        <div className="tab-surface-card rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-300/75">Tracked Students</div>
          <div className="mt-1.5 text-2xl font-semibold text-slate-50 tabular-nums">
            {students.length}
          </div>
          <div className="mt-1 text-xs text-slate-300/65 tabular-nums">
            {reportFactors.length} M:N report_factors links
          </div>
        </div>
      </div>

      {reports.length === 0 ? (
        <section className="tab-surface-card rounded-lg p-10 text-center space-y-3">
          <BarChart3 className="w-7 h-7 tab-accent-text mx-auto opacity-80" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-50">No analytics data recorded yet</h2>
          <p className="text-xs sm:text-sm text-slate-300/75 max-w-lg mx-auto">
            All 6 normalized tables start empty. Log a student health survey or daily check-in with stress factors to populate chronological history, factor counts, high-stress alerts, and period averages.
          </p>
          <button
            type="button"
            onClick={onNavigateSurvey}
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-md tab-cta-btn"
          >
            Start Health Survey
          </button>
        </section>
      ) : (
        <>
          {/* Report 1: Individual Student Chronological Stress History */}
          <section className="tab-surface-card rounded-lg p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b tab-divider">
              <div>
                <h2 className="text-base font-semibold text-slate-50 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 tab-accent-text" aria-hidden="true" />
                  <span>1. Individual Student Chronological Stress History</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-300/70">
                  Compare personal stress trajectory over time (<span className="font-mono">ORDER BY submission_date ASC</span>).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  aria-label="Select student for chronological history"
                  value={effectiveHistoryStudentId}
                  onChange={(e) => {
                    setHistoryStudentId(e.target.value);
                    onSelectStudentId(e.target.value);
                  }}
                  className="px-3 py-2 text-xs tab-input rounded-md"
                >
                  {students.map((s) => (
                    <option key={s.student_id} value={s.student_id} className="bg-[#090514]">
                      {s.student_id} — {s.name} ({s.semester})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {activeHistoryStudent && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-[#090514] border tab-divider rounded-md">
                  <div className="text-slate-300/65">Student</div>
                  <div className="mt-0.5 font-medium text-slate-100 truncate">
                    {activeHistoryStudent.name}
                  </div>
                </div>
                <div className="p-3 bg-[#090514] border tab-divider rounded-md">
                  <div className="text-slate-300/65">Mean Stress</div>
                  <div className="mt-0.5 font-mono font-semibold tab-accent-text tabular-nums">
                    {studentHistoryStats.avgStress}
                  </div>
                </div>
                <div className="p-3 bg-[#090514] border tab-divider rounded-md">
                  <div className="text-slate-300/65">Range (Min / Max)</div>
                  <div className="mt-0.5 font-mono text-slate-100 tabular-nums">
                    {studentHistoryStats.minStress} – {studentHistoryStats.maxStress}
                  </div>
                </div>
                <div className="p-3 bg-[#090514] border tab-divider rounded-md">
                  <div className="text-slate-300/65">Latest Shift</div>
                  <div className="mt-0.5 font-mono text-slate-100 truncate">
                    {studentHistoryStats.deltaLabel}
                  </div>
                </div>
              </div>
            )}

            {studentChronologicalHistory.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-300/70 border border-dashed tab-divider rounded-md">
                No stress reports logged for {activeHistoryStudent?.name ?? "this student"} yet.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-[#090514] border tab-divider rounded-md">
                  <div className="flex items-end gap-2 sm:gap-3 h-36 pt-4">
                    {studentChronologicalHistory.map((rpt) => {
                      const heightPct = Math.max(15, Math.min(100, rpt.stress_level * 10));
                      const barClass =
                        rpt.stress_level >= 8
                          ? "bg-rose-400/90"
                          : rpt.stress_level >= 5
                            ? "bg-amber-400/85"
                            : "bg-emerald-400/85";
                      return (
                        <button
                          key={rpt.report_id}
                          type="button"
                          onClick={() => onInspectReport(rpt)}
                          title={`${rpt.submission_date} · Stress ${rpt.stress_level}/10 · ${rpt.remarks}`}
                          className="flex-1 min-w-[28px] max-w-[60px] h-full flex flex-col justify-end items-center gap-1.5 group focus:outline-none"
                        >
                          <span className="text-[10px] font-mono text-slate-200 tabular-nums">
                            {rpt.stress_level}/10
                          </span>
                          <div className="w-full flex-1 flex items-end justify-center">
                            <div
                              style={{ height: `${heightPct}%` }}
                              className={`w-full max-w-[28px] rounded-t-md opacity-85 group-hover:opacity-100 transition-opacity ${barClass}`}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 tabular-nums truncate w-full text-center">
                            {rpt.submission_date.slice(5)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="overflow-x-auto border tab-divider rounded-md">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#0F0820] border-b tab-divider text-slate-300/75">
                        <th className="py-2.5 px-3">submission_date</th>
                        <th className="py-2.5 px-3">report_id</th>
                        <th className="py-2.5 px-3 text-right">stress_level</th>
                        <th className="py-2.5 px-3">Factors</th>
                        <th className="py-2.5 px-3">remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-violet-500/15">
                      {studentChronologicalHistory.map((rpt) => {
                        const facs = factorsByReport.get(rpt.report_id) ?? [];
                        return (
                          <tr
                            key={rpt.report_id}
                            onClick={() => onInspectReport(rpt)}
                            className="hover:bg-[#1B0F36] cursor-pointer"
                          >
                            <td className="py-2.5 px-3 font-mono tabular-nums text-slate-200">
                              {rpt.submission_date}
                            </td>
                            <td className="py-2.5 px-3 font-mono tab-accent-text">
                              {rpt.report_id}
                            </td>
                            <td
                              className={`py-2.5 px-3 text-right font-mono font-semibold tabular-nums ${
                                rpt.stress_level >= 8 ? "text-rose-300" : "text-slate-100"
                              }`}
                            >
                              {rpt.stress_level}/10
                            </td>
                            <td className="py-2.5 px-3 text-slate-300/85">
                              {facs.length > 0 ? facs.map((f) => f.factor_name).join(", ") : "—"}
                            </td>
                            <td className="py-2.5 px-3 text-slate-200/80 max-w-xs truncate">
                              {rpt.remarks}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Report 2: Top Recurring Stress Factors */}
            <section className="tab-surface-card rounded-lg p-5 space-y-4">
              <div className="pb-3 border-b tab-divider">
                <h2 className="text-base font-semibold text-slate-50">
                  2. Top Recurring Stress Factors (COUNT &amp; GROUP BY)
                </h2>
                <p className="mt-0.5 text-xs text-slate-300/70 font-mono">
                  SELECT sf.factor_name, COUNT(rf.report_id) FROM report_factors rf JOIN stress_factors sf ... GROUP BY sf.factor_id
                </p>
              </div>

              {topFactors.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-300/70 border border-dashed tab-divider rounded-md">
                  No stress factors have been linked to reports yet. Select contributing factors when logging a survey or daily check-in.
                </div>
              ) : (
                <div className="space-y-3">
                  {topFactors.map((item) => (
                    <div key={item.factor.factor_id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-slate-100">
                          {item.factor.factor_name}
                        </span>
                        <span className="font-mono text-slate-300/85 tabular-nums">
                          {item.count} report(s) · {item.sharePct}% · avg {item.avgStress}/10
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[#090514] border tab-divider overflow-hidden">
                        <div
                          style={{ width: `${Math.max(8, item.sharePct)}%` }}
                          className="h-full bg-fuchsia-400/85 rounded-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Report 4: Average Stress by Semester / Weekly / Monthly */}
            <section className="tab-surface-card rounded-lg p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b tab-divider">
                <div>
                  <h2 className="text-base font-semibold text-slate-50 flex items-center gap-2">
                    <Calendar className="w-4 h-4 tab-accent-text" aria-hidden="true" />
                    <span>4. Average Stress by Period</span>
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-300/70">
                    Aggregated mean &amp; peak stress across semester or time buckets.
                  </p>
                </div>

                <div className="inline-flex items-center p-0.5 bg-[#090514] border tab-divider rounded-md">
                  {(
                    [
                      { id: "semester", label: "Semester" },
                      { id: "weekly", label: "Weekly" },
                      { id: "monthly", label: "Monthly" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setGroupingMode(m.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                        groupingMode === m.id
                          ? "tab-chip-active border"
                          : "text-slate-300/70 border border-transparent hover:text-slate-100"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto border tab-divider rounded-md">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0F0820] border-b tab-divider text-slate-300/75">
                      <th className="py-2.5 px-3">
                        {groupingMode === "semester"
                          ? "semester"
                          : groupingMode === "weekly"
                            ? "ISO Week"
                            : "Month"}
                      </th>
                      <th className="py-2.5 px-3 text-right">Reports</th>
                      <th className="py-2.5 px-3 text-right">Avg Stress</th>
                      <th className="py-2.5 px-3 text-right">Peak Stress</th>
                      <th className="py-2.5 px-3 text-right">Avg Wellness</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-violet-500/15">
                    {groupedSummaries.map((row) => (
                      <tr key={row.label} className="hover:bg-[#1B0F36]">
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-100">
                          {row.label}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{row.count}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold tab-accent-text tabular-nums">
                          {row.avgStress} / 10
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                            row.maxStress >= 8 ? "text-rose-300 font-semibold" : ""
                          }`}
                        >
                          {row.maxStress} / 10
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {row.avgWellness} / 100
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Report 3: High-Stress Alerts (stress_level >= 8) */}
          <section className="tab-surface-card rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b tab-divider flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-rose-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-300" aria-hidden="true" />
                  <span>3. High-Stress Alerts (stress_level &ge; 8 / 10)</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-300/70">
                  WHERE sr.stress_level &ge; 8 ORDER BY sr.stress_level DESC, sr.submission_date DESC
                </p>
              </div>
              <span className="font-mono text-xs text-rose-200 tabular-nums">
                {highStressAlerts.length} alert(s)
              </span>
            </div>

            {highStressAlerts.length === 0 ? (
              <div className="px-6 py-10 text-center text-xs text-slate-300/70">
                No reports currently have stress_level &ge; 8/10.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0F0820] border-b tab-divider text-slate-300/75">
                      <th className="py-2.5 px-4">report_id</th>
                      <th className="py-2.5 px-4">Student &amp; Dept</th>
                      <th className="py-2.5 px-4">submission_date</th>
                      <th className="py-2.5 px-4 text-right">stress_level</th>
                      <th className="py-2.5 px-4">Contributing Factors</th>
                      <th className="py-2.5 px-4">remarks</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-violet-500/15">
                    {highStressAlerts.map((rpt) => {
                      const stu = studentMap.get(rpt.student_id);
                      const dept = stu?.dept_id ? deptMap.get(stu.dept_id) : undefined;
                      const facs = factorsByReport.get(rpt.report_id) ?? [];
                      return (
                        <tr key={rpt.report_id} className="hover:bg-[#1B0F36] align-top">
                          <td className="py-3 px-4 font-mono text-violet-300 whitespace-nowrap">
                            {rpt.report_id}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => onInspectStudent(rpt.student_id)}
                              className="font-medium text-slate-100 hover:underline text-left"
                            >
                              {stu?.name ?? rpt.student_id}
                            </button>
                            <div className="text-[11px] text-slate-300/65">
                              {stu?.student_id} · {stu?.semester ?? "—"}
                              {dept ? ` · ${dept.dept_name}` : ""}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums text-slate-300/80 whitespace-nowrap">
                            {rpt.submission_date}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-rose-300 tabular-nums whitespace-nowrap">
                            {rpt.stress_level} / 10
                          </td>
                          <td className="py-3 px-4 text-slate-200">
                            {facs.length > 0 ? facs.map((f) => f.factor_name).join(", ") : "—"}
                          </td>
                          <td className="py-3 px-4 text-slate-200/85 max-w-xs">
                            <p className="line-clamp-2">{rpt.remarks}</p>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onInspectReport(rpt)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] tab-outline-btn rounded"
                              >
                                <Eye className="w-3 h-3" aria-hidden="true" />
                                <span>Inspect</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onConsultStudent(rpt.student_id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] text-sky-200 bg-[#090514] border border-sky-400/35 hover:border-sky-300/70 rounded"
                              >
                                <Stethoscope className="w-3 h-3" aria-hidden="true" />
                                <span>Advisor</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
