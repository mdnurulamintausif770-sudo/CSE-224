import { useMemo, useState } from "react";
import { ClipboardList, Edit3, Eye, Plus, Search, Trash2, X } from "lucide-react";
import type { ActiveRole, Department, StressReport, Student } from "../types";

interface StudentsDirectoryProps {
  activeRole: ActiveRole;
  departments: Department[];
  students: Student[];
  reports: StressReport[];
  onAddStudent: (input: {
    name: string;
    email?: string;
    semester?: string;
    dept_id?: string | null;
    dept_name?: string;
    class_section: string;
    roll_no: string;
    age: number;
  }) => {
    ok: boolean;
    error?: string;
    student?: Student;
  };
  onUpdateStudent: (
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
  ) => { ok: boolean; error?: string };
  onDeleteStudent: (studentId: string) => void;
  onInspectStudent: (studentId: string) => void;
  onStartSurvey: (studentId: string) => void;
}

export function StudentsDirectory({
  activeRole,
  departments,
  students,
  reports,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onInspectStudent,
  onStartSurvey,
}: StudentsDirectoryProps) {
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [semester, setSemester] = useState("Sem 1");
  const [deptName, setDeptName] = useState("");
  const [classSection, setClassSection] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [age, setAge] = useState("19");
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editSemester, setEditSemester] = useState("");
  const [editDeptName, setEditDeptName] = useState("");
  const [editSection, setEditSection] = useState("");
  const [editRollNo, setEditRollNo] = useState("");
  const [editAge, setEditAge] = useState("19");
  const [editError, setEditError] = useState<string | null>(null);

  const deptMap = useMemo(() => {
    const map = new Map<string, Department>();
    for (const d of departments) map.set(d.dept_id, d);
    return map;
  }, [departments]);

  const statsByStudent = useMemo(() => {
    const map = new Map<
      string,
      { count: number; latestDate: string | null; avgStress: string | null; avgIndex: number | null }
    >();
    const grouped = new Map<string, StressReport[]>();
    for (const rpt of reports) {
      const list = grouped.get(rpt.student_id) ?? [];
      list.push(rpt);
      grouped.set(rpt.student_id, list);
    }
    for (const s of students) {
      const list = grouped.get(s.student_id) ?? [];
      if (list.length === 0) {
        map.set(s.student_id, { count: 0, latestDate: null, avgStress: null, avgIndex: null });
      } else {
        const sorted = [...list].sort((a, b) =>
          b.submission_date.localeCompare(a.submission_date)
        );
        const avgIdx = Math.round(
          list.reduce((a, l) => a + l.wellness_index, 0) / list.length
        );
        const avgStr = (
          list.reduce((a, l) => a + l.stress_level, 0) / list.length
        ).toFixed(1);
        map.set(s.student_id, {
          count: list.length,
          latestDate: sorted[0].submission_date,
          avgStress: avgStr,
          avgIndex: avgIdx,
        });
      }
    }
    return map;
  }, [students, reports]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => {
      const dept = s.dept_id ? deptMap.get(s.dept_id) : undefined;
      return (
        s.student_id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.semester.toLowerCase().includes(q) ||
        s.class_section.toLowerCase().includes(q) ||
        s.roll_no.toLowerCase().includes(q) ||
        (dept?.dept_name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [students, search, deptMap]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsedAge = Number(age);
    if (!name.trim()) {
      setFormError("Student name is required.");
      return;
    }
    if (!deptName.trim()) {
      setFormError("Department name is required.");
      return;
    }
    if (!classSection.trim()) {
      setFormError("Class section is required (e.g., CS-3A).");
      return;
    }
    if (!rollNo.trim()) {
      setFormError("Roll number is required.");
      return;
    }
    if (!Number.isInteger(parsedAge) || parsedAge < 12 || parsedAge > 45) {
      setFormError("Age must be a whole number between 12 and 45.");
      return;
    }

    const res = onAddStudent({
      name: name.trim(),
      email: email.trim(),
      semester: semester.trim() || "Sem 1",
      dept_name: deptName.trim(),
      class_section: classSection.trim().toUpperCase(),
      roll_no: rollNo.trim(),
      age: parsedAge,
    });
    if (!res.ok) {
      setFormError(res.error ?? "Unable to insert student.");
      return;
    }

    setName("");
    setEmail("");
    setSemester("Sem 1");
    setDeptName("");
    setClassSection("");
    setRollNo("");
    setAge("19");
    setShowAddForm(false);
  }

  function openEditStudent(s: Student) {
    const existingDept = s.dept_id ? deptMap.get(s.dept_id) : undefined;
    setEditingStudent(s);
    setEditName(s.name);
    setEditEmail(s.email);
    setEditSemester(s.semester);
    setEditDeptName(existingDept?.dept_name ?? "");
    setEditSection(s.class_section);
    setEditRollNo(s.roll_no);
    setEditAge(String(s.age));
    setEditError(null);
  }

  function handleSaveStudentEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStudent) return;
    setEditError(null);
    const parsedAge = Number(editAge);
    if (!editDeptName.trim()) {
      setEditError("Department name is required.");
      return;
    }
    if (!Number.isInteger(parsedAge) || parsedAge < 12 || parsedAge > 45) {
      setEditError("Age must be between 12 and 45.");
      return;
    }
    const res = onUpdateStudent(editingStudent.student_id, {
      name: editName.trim(),
      email: editEmail.trim(),
      semester: editSemester.trim() || "Sem 1",
      dept_name: editDeptName.trim(),
      class_section: editSection.trim().toUpperCase(),
      roll_no: editRollNo.trim(),
      age: parsedAge,
    });
    if (!res.ok) {
      setEditError(res.error ?? "Unable to update student.");
      return;
    }
    setEditingStudent(null);
  }

  return (
    <div className="space-y-6">
      <section className="tab-surface-card rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b tab-divider flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-50">students Table (3NF)</h2>
            <p className="mt-0.5 text-xs text-slate-300/70">
              Primary entity (PK: student_id, FK: dept_id, user_id). Deleting a student cascades to linked stress_reports and report_factors.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search
                className="w-4 h-4 text-violet-300/60 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ID, name, dept, semester..."
                aria-label="Search students"
                className="pl-9 pr-3 py-2 text-xs tab-input rounded-md w-60"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setShowAddForm((prev) => !prev);
                setFormError(null);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-md tab-cta-btn whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>{showAddForm ? "Close Form" : "Add Student"}</span>
            </button>
          </div>
        </div>

        {showAddForm && (
          <form
            onSubmit={handleSubmit}
            className="px-5 py-5 bg-[#0F0820] border-b tab-divider"
          >
            <div className="text-sm font-semibold text-slate-50 mb-3">
              Insert New Student Entity
            </div>

            {formError && (
              <div
                role="alert"
                className="mb-4 px-3 py-2 text-xs font-medium text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md"
              >
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label htmlFor="stu-name" className="block text-xs font-medium text-slate-200/80 mb-1">
                  name
                </label>
                <input
                  id="stu-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter full name"
                  className="w-full px-3 py-2 text-xs tab-input rounded-md"
                />
              </div>

              <div>
                <label htmlFor="stu-email" className="block text-xs font-medium text-slate-200/80 mb-1">
                  email
                </label>
                <input
                  id="stu-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@campus.edu"
                  className="w-full px-3 py-2 text-xs tab-input rounded-md"
                />
              </div>

              <div>
                <label htmlFor="stu-semester" className="block text-xs font-medium text-slate-200/80 mb-1">
                  semester
                </label>
                <input
                  id="stu-semester"
                  type="text"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  placeholder="e.g. Sem 4"
                  className="w-full px-3 py-2 text-xs tab-input rounded-md"
                />
              </div>

              <div>
                <label htmlFor="stu-dept-name" className="block text-xs font-medium text-slate-200/80 mb-1">
                  department
                </label>
                <input
                  id="stu-dept-name"
                  type="text"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="Enter your department name"
                  className="w-full px-3 py-2 text-xs tab-input rounded-md"
                />
              </div>

              <div>
                <label htmlFor="stu-section" className="block text-xs font-medium text-slate-200/80 mb-1">
                  class_section
                </label>
                <input
                  id="stu-section"
                  type="text"
                  value={classSection}
                  onChange={(e) => setClassSection(e.target.value)}
                  placeholder="e.g. CS-3B"
                  className="w-full px-3 py-2 text-xs tab-input rounded-md"
                />
              </div>

              <div>
                <label htmlFor="stu-roll" className="block text-xs font-medium text-slate-200/80 mb-1">
                  roll_no
                </label>
                <input
                  id="stu-roll"
                  type="text"
                  value={rollNo}
                  onChange={(e) => setRollNo(e.target.value)}
                  placeholder="e.g. 2026-085"
                  className="w-full px-3 py-2 text-xs tab-input rounded-md"
                />
              </div>

              <div>
                <label htmlFor="stu-age" className="block text-xs font-medium text-slate-200/80 mb-1">
                  age
                </label>
                <input
                  id="stu-age"
                  type="number"
                  min={12}
                  max={45}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full px-3 py-2 text-xs tab-input rounded-md tabular-nums"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setFormError(null);
                }}
                className="px-4 py-2 text-xs font-medium tab-outline-btn rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold tab-cta-btn rounded-md"
              >
                Save Student Record
              </button>
            </div>
          </form>
        )}

        {students.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="text-sm font-semibold text-slate-50">No student profiles registered</h3>
            <p className="mt-1 text-sm text-slate-300/70">
              Add a student profile or begin an AI Health Survey to create your first record.
            </p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="text-sm font-semibold text-slate-50">No matching students</h3>
            <p className="mt-1 text-sm text-slate-300/70">
              Adjust your search query to locate a student record.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#0F0820] border-b tab-divider text-xs font-medium text-slate-300/75">
                  <th className="py-3 px-4 whitespace-nowrap">student_id (PK)</th>
                  <th className="py-3 px-4 whitespace-nowrap">name &amp; email</th>
                  <th className="py-3 px-4 whitespace-nowrap">dept_id (FK)</th>
                  <th className="py-3 px-4 whitespace-nowrap">semester</th>
                  <th className="py-3 px-4 whitespace-nowrap">section / roll</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Reports</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Avg Stress</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Avg Index</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-500/15 text-sm">
                {filteredStudents.map((student) => {
                  const dept = student.dept_id ? deptMap.get(student.dept_id) : undefined;
                  const stats = statsByStudent.get(student.student_id) ?? {
                    count: 0,
                    latestDate: null,
                    avgStress: null,
                    avgIndex: null,
                  };
                  return (
                    <tr key={student.student_id} className="hover:bg-[#1B0F36] transition-colors">
                      <td className="py-3 px-4 font-mono text-xs font-medium text-violet-300 whitespace-nowrap">
                        {student.student_id}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-xs font-medium text-slate-50">{student.name}</div>
                        <div className="text-[11px] font-mono text-slate-300/65">
                          {student.email || "—"}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-200/80 whitespace-nowrap">
                        {dept
                          ? `${dept.dept_name} (${dept.dept_id})`
                          : student.dept_name ?? "Not entered"}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-200/80 whitespace-nowrap">
                        {student.semester}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-300/75 whitespace-nowrap tabular-nums">
                        {student.class_section} · {student.roll_no}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-100 whitespace-nowrap tabular-nums">
                        {stats.count}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-100 whitespace-nowrap tabular-nums">
                        {stats.avgStress !== null ? `${stats.avgStress}/10` : "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-fuchsia-300 whitespace-nowrap tabular-nums">
                        {stats.avgIndex !== null ? `${stats.avgIndex}/100` : "—"}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {pendingDeleteId === student.student_id ? (
                          <div className="inline-flex items-center gap-2">
                            <span className="text-xs text-rose-300">
                              {stats.count > 0 ? `Cascade ${stats.count} rpt?` : "Delete?"}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteStudent(student.student_id);
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
                              onClick={() => onInspectStudent(student.student_id)}
                              className="p-1.5 text-slate-300/75 hover:text-violet-200 hover:bg-violet-500/15 rounded"
                              title="Inspect student & linked reports"
                              aria-label={`Inspect ${student.name}`}
                            >
                              <Eye className="w-4 h-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditStudent(student)}
                              className="p-1.5 text-slate-300/75 hover:text-fuchsia-300 hover:bg-fuchsia-500/15 rounded"
                              title="Edit student profile"
                              aria-label={`Edit ${student.name}`}
                            >
                              <Edit3 className="w-4 h-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onStartSurvey(student.student_id)}
                              className="p-1.5 text-slate-300/75 hover:text-violet-200 hover:bg-violet-500/15 rounded"
                              title="Start health survey for student"
                              aria-label={`Start survey for ${student.name}`}
                            >
                              <ClipboardList className="w-4 h-4" aria-hidden="true" />
                            </button>
                            {activeRole === "Admin" && (
                              <button
                                type="button"
                                onClick={() => setPendingDeleteId(student.student_id)}
                                className="p-1.5 text-slate-300/75 hover:text-rose-400 hover:bg-rose-500/10 rounded"
                                title="Delete student (Admin)"
                                aria-label={`Delete ${student.name}`}
                              >
                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                              </button>
                            )}
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

      {editingStudent && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
        >
          <div className="bg-[#120926] border border-violet-500/35 rounded-lg w-full max-w-lg overflow-hidden shadow-[0_0_48px_rgba(168,85,247,0.2)]">
            <div className="px-5 py-4 border-b tab-divider flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-50">
                Edit Student · {editingStudent.student_id}
              </h3>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                aria-label="Close edit student modal"
                className="p-1.5 text-slate-300/70 hover:text-slate-50 rounded"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleSaveStudentEdit} className="p-5 space-y-4">
              {editError && (
                <div className="px-3 py-2 text-xs text-rose-200 bg-rose-500/15 border border-rose-500/35 rounded">
                  {editError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300/80 mb-1">name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 text-xs tab-input rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300/80 mb-1">email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs tab-input rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300/80 mb-1">semester</label>
                  <input
                    type="text"
                    value={editSemester}
                    onChange={(e) => setEditSemester(e.target.value)}
                    className="w-full px-3 py-2 text-xs tab-input rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300/80 mb-1">department</label>
                  <input
                    type="text"
                    value={editDeptName}
                    onChange={(e) => setEditDeptName(e.target.value)}
                    placeholder="Enter your department name"
                    className="w-full px-3 py-2 text-xs tab-input rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300/80 mb-1">class_section</label>
                  <input
                    type="text"
                    value={editSection}
                    onChange={(e) => setEditSection(e.target.value)}
                    className="w-full px-3 py-2 text-xs tab-input rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300/80 mb-1">roll_no</label>
                  <input
                    type="text"
                    value={editRollNo}
                    onChange={(e) => setEditRollNo(e.target.value)}
                    className="w-full px-3 py-2 text-xs tab-input rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300/80 mb-1">age</label>
                  <input
                    type="number"
                    min={12}
                    max={45}
                    value={editAge}
                    onChange={(e) => setEditAge(e.target.value)}
                    className="w-full px-3 py-2 text-xs tab-input rounded-md tabular-nums"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 text-xs font-medium tab-outline-btn rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold tab-cta-btn rounded-md"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
