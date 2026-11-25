import { X } from "lucide-react";
import { STANDARD_WELLNESS_DISCLAIMER } from "../data/seedData";
import type {
  Department,
  ReportFactor,
  StressFactor,
  StressReport,
  Student,
} from "../types";
import { getStressBand } from "../utils/dbStorage";

interface RecordInspectorModalProps {
  inspectedStudent: Student | null;
  inspectedReport: StressReport | null;
  studentReports: StressReport[];
  linkedStudent: Student | null;
  departments: Department[];
  stressFactors: StressFactor[];
  reportFactors: ReportFactor[];
  onClose: () => void;
  onSelectReport: (report: StressReport) => void;
  onSelectStudent: (studentId: string) => void;
  onStartSurveyForStudent: (studentId: string) => void;
}

export function RecordInspectorModal({
  inspectedStudent,
  inspectedReport,
  studentReports,
  linkedStudent,
  departments,
  stressFactors,
  reportFactors,
  onClose,
  onSelectReport,
  onSelectStudent,
  onStartSurveyForStudent,
}: RecordInspectorModalProps) {
  if (!inspectedStudent && !inspectedReport) return null;

  const factorMap = new Map<string, StressFactor>();
  for (const f of stressFactors) factorMap.set(f.factor_id, f);

  const deptMap = new Map<string, Department>();
  for (const d of departments) deptMap.set(d.dept_id, d);

  const reportLinkedFactors = inspectedReport
    ? reportFactors
        .filter((rf) => rf.report_id === inspectedReport.report_id)
        .map((rf) => factorMap.get(rf.factor_id))
        .filter((f): f is StressFactor => Boolean(f))
    : [];

  const inspectedStudentDept =
    inspectedStudent?.dept_id ? deptMap.get(inspectedStudent.dept_id) : undefined;
  const linkedStudentDept =
    linkedStudent?.dept_id ? deptMap.get(linkedStudent.dept_id) : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
    >
      <div className="bg-[#120926] border border-violet-500/35 rounded-lg w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden shadow-[0_0_48px_rgba(168,85,247,0.2)]">
        <div className="px-6 py-4 border-b border-violet-500/20 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-violet-50">
              {inspectedReport
                ? `stress_reports Record · ${inspectedReport.report_id}`
                : `students Entity · ${inspectedStudent?.student_id}`}
            </h2>
            <p className="mt-0.5 text-xs text-violet-200/70">
              {inspectedReport
                ? "Structured stress telemetry, M:N stress factors, remarks, and AI wellness guidance"
                : "Student entity, department foreign key, and linked stress_reports history"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="p-1.5 text-violet-200/70 hover:text-violet-50 hover:bg-[#1D113D] rounded-md transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {inspectedReport && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-[#090514] border border-violet-500/20 rounded-md">
                  <div className="text-xs text-violet-200/65 font-mono">submission_date</div>
                  <div className="mt-1 text-sm font-mono font-medium text-violet-50 tabular-nums">
                    {inspectedReport.submission_date}
                  </div>
                </div>
                <div className="p-3 bg-[#090514] border border-violet-500/20 rounded-md">
                  <div className="text-xs text-violet-200/65 font-mono">sleep_hours</div>
                  <div className="mt-1 text-sm font-mono font-medium text-violet-50 tabular-nums">
                    {inspectedReport.sleep_hours.toFixed(1)} hrs
                  </div>
                </div>
                <div className="p-3 bg-[#090514] border border-violet-500/20 rounded-md">
                  <div className="text-xs text-violet-200/65 font-mono">stress_level</div>
                  <div
                    className={`mt-1 text-sm font-mono font-semibold tabular-nums ${
                      inspectedReport.stress_level >= 8 ? "text-rose-300" : "text-violet-50"
                    }`}
                  >
                    {inspectedReport.stress_level} / 10 ({getStressBand(inspectedReport.stress_level)})
                  </div>
                </div>
                <div className="p-3 bg-[#090514] border border-fuchsia-500/30 rounded-md">
                  <div className="text-xs text-violet-200/65 font-mono">wellness_index</div>
                  <div className="mt-1 text-sm font-mono font-semibold text-fuchsia-300 tabular-nums">
                    {inspectedReport.wellness_index} / 100
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 py-3 border-y border-violet-500/20 text-xs">
                <div>
                  <span className="text-violet-200/65">Foreign Key: </span>
                  <button
                    type="button"
                    onClick={() => onSelectStudent(inspectedReport.student_id)}
                    className="font-mono font-medium text-violet-300 hover:underline"
                  >
                    {inspectedReport.student_id}
                  </button>
                  {linkedStudent && (
                    <span className="text-violet-100">
                      {" "}
                      — {linkedStudent.name} ({linkedStudent.semester} · {linkedStudent.class_section}
                      {linkedStudentDept ? ` · ${linkedStudentDept.dept_name}` : ""})
                    </span>
                  )}
                </div>
                <div className="font-mono text-violet-200/80 tabular-nums">
                  water_intake: {inspectedReport.water_intake} gl
                  {inspectedReport.updated_at ? ` · revised ${inspectedReport.updated_at}` : ""}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-violet-300 mb-1.5 font-mono">
                  report_factors (M:N Stress Factors)
                </h3>
                {reportLinkedFactors.length === 0 ? (
                  <p className="text-xs text-violet-200/65">No contributing stress factors linked to this report.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {reportLinkedFactors.map((f) => (
                      <span
                        key={f.factor_id}
                        className="px-2.5 py-1 text-xs font-medium bg-[#090514] border border-fuchsia-400/35 text-fuchsia-200 rounded"
                      >
                        {f.factor_name} ({f.factor_id})
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-xs font-semibold text-violet-300 mb-1.5 font-mono">
                  remarks
                </h3>
                <p className="text-sm text-violet-100 leading-relaxed bg-[#090514] border border-violet-500/20 rounded-md p-3 whitespace-pre-line">
                  {inspectedReport.remarks}
                </p>
              </div>

              {inspectedReport.ai_assessment && (
                <div>
                  <h3 className="text-xs font-semibold text-violet-200/80 mb-1.5 font-mono">
                    ai_assessment
                  </h3>
                  <p className="text-sm text-violet-50 leading-relaxed whitespace-pre-line">
                    {inspectedReport.ai_assessment}
                  </p>
                </div>
              )}

              {inspectedReport.actionable_tips && inspectedReport.actionable_tips.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-violet-200/80 mb-2">
                    Practical Coping &amp; Care Steps
                  </h3>
                  <ul className="space-y-1.5 text-sm text-violet-100/90 list-disc pl-5">
                    {inspectedReport.actionable_tips.map((tip, i) => (
                      <li key={i}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="px-4 py-3 bg-[#090514] border border-violet-400/25 rounded-md text-xs text-violet-200/70 leading-relaxed">
                {inspectedReport.disclaimer ?? STANDARD_WELLNESS_DISCLAIMER}
              </div>
            </>
          )}

          {inspectedStudent && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-[#090514] border border-violet-500/20 rounded-md">
                  <div className="text-xs text-violet-200/65 font-mono">name</div>
                  <div className="mt-1 text-sm font-medium text-violet-50">{inspectedStudent.name}</div>
                </div>
                <div className="p-3 bg-[#090514] border border-violet-500/20 rounded-md">
                  <div className="text-xs text-violet-200/65 font-mono">email</div>
                  <div className="mt-1 text-xs font-mono text-violet-100 truncate">
                    {inspectedStudent.email || "—"}
                  </div>
                </div>
                <div className="p-3 bg-[#090514] border border-violet-500/20 rounded-md">
                  <div className="text-xs text-violet-200/65 font-mono">semester</div>
                  <div className="mt-1 text-sm font-medium text-violet-50">{inspectedStudent.semester}</div>
                </div>
                <div className="p-3 bg-[#090514] border border-violet-500/20 rounded-md">
                  <div className="text-xs text-violet-200/65 font-mono">department</div>
                  <div className="mt-1 text-xs font-mono text-violet-100">
                    {inspectedStudentDept
                      ? `${inspectedStudentDept.dept_name} (${inspectedStudentDept.dept_id})`
                      : inspectedStudent.dept_name ?? inspectedStudent.dept_id ?? "Not entered"}
                  </div>
                </div>
                <div className="p-3 bg-[#090514] border border-violet-500/20 rounded-md">
                  <div className="text-xs text-violet-200/65 font-mono">class_section / roll_no</div>
                  <div className="mt-1 text-xs font-mono text-violet-50 tabular-nums">
                    {inspectedStudent.class_section} · {inspectedStudent.roll_no}
                  </div>
                </div>
                <div className="p-3 bg-[#090514] border border-violet-500/20 rounded-md">
                  <div className="text-xs text-violet-200/65 font-mono">user_id (FK)</div>
                  <div className="mt-1 text-xs font-mono text-violet-100">
                    {inspectedStudent.user_id ?? "Not linked"}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-violet-50">
                    Linked stress_reports ({studentReports.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => onStartSurveyForStudent(inspectedStudent.student_id)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-950 bg-violet-400 hover:bg-violet-300 rounded-md transition-colors"
                  >
                    Start Health Survey
                  </button>
                </div>

                {studentReports.length === 0 ? (
                  <div className="py-8 text-center text-sm text-violet-200/70 border border-violet-500/20 rounded-md">
                    No stress reports recorded for this student yet.
                  </div>
                ) : (
                  <div className="border border-violet-500/20 rounded-md overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#0F0820] border-b border-violet-500/15 text-violet-200/70">
                          <th className="py-2.5 px-3">report_id</th>
                          <th className="py-2.5 px-3">submission_date</th>
                          <th className="py-2.5 px-3 text-right">Sleep</th>
                          <th className="py-2.5 px-3 text-right">Stress</th>
                          <th className="py-2.5 px-3 text-right">Index</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-violet-500/15">
                        {studentReports.map((rpt) => (
                          <tr
                            key={rpt.report_id}
                            onClick={() => onSelectReport(rpt)}
                            className="hover:bg-[#1B0F36] cursor-pointer"
                          >
                            <td className="py-2.5 px-3 font-mono font-medium text-violet-300">
                              {rpt.report_id}
                            </td>
                            <td className="py-2.5 px-3 font-mono tabular-nums text-violet-200/80">
                              {rpt.submission_date}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                              {rpt.sleep_hours.toFixed(1)}h
                            </td>
                            <td
                              className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                                rpt.stress_level >= 8 ? "text-rose-300 font-semibold" : ""
                              }`}
                            >
                              {rpt.stress_level}/10
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-fuchsia-300 tabular-nums">
                              {rpt.wellness_index}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
