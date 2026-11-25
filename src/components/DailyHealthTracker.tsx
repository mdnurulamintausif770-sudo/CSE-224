import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Droplets,
  Edit3,
  Eye,
  Minus,
  Moon,
  Plus,
  Sparkles,
  Stethoscope,
  Tag,
  Thermometer,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { STANDARD_WELLNESS_DISCLAIMER, SUGGESTED_FACTOR_TEMPLATES } from "../data/seedData";
import type {
  ActiveRole,
  Department,
  FeverStatus,
  ReportFactor,
  StressFactor,
  StressReport,
  Student,
} from "../types";
import {
  buildDailyTrackerAssessment,
  calculateDailyWellnessScore,
  inferFeverStatusFromTemp,
} from "../utils/dbStorage";
import { safeFetchJson } from "../utils/safeFetch";
import type { PendingStudentProfile } from "../utils/surveyHelpers";

interface DailyHealthTrackerProps {
  activeRole: ActiveRole;
  departments: Department[];
  students: Student[];
  reports: StressReport[];
  stressFactors: StressFactor[];
  reportFactors: ReportFactor[];
  selectedStudentId: string;
  onSelectStudentId: (id: string) => void;
  onAddFactor: (input: { factor_name: string; description: string }) => {
    ok: boolean;
    error?: string;
    factor?: StressFactor;
  };
  onCommitCheckIn: (payload: {
    studentProfile: PendingStudentProfile;
    reportInput: Omit<StressReport, "report_id" | "student_id"> & { factorIds?: string[] };
  }) => { ok: boolean; error?: string; student?: Student; report?: StressReport };
  onUpdateReport: (
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
  ) => { ok: boolean; error?: string };
  onDeleteEntry: (reportId: string) => void;
  onInspectEntry: (report: StressReport) => void;
  onConsultDoctor: (studentId: string) => void;
}

interface TrendAnalysisResult {
  observation: string;
  recommendations: string[];
  safetyNote: string;
  source: "live" | "local";
}

const FEVER_OPTIONS: Array<{
  value: FeverStatus;
  label: string;
  rangeHint: string;
}> = [
  { value: "None", label: "None", rangeHint: "< 99.5°F" },
  { value: "Mild", label: "Mild", rangeHint: "99.5–100.4°F" },
  { value: "Moderate", label: "Moderate", rangeHint: "100.5–102.2°F" },
  { value: "High", label: "High", rangeHint: "102.3°F+" },
];

const SYMPTOM_CHIPS = [
  "Fever",
  "Headache",
  "Body Ache",
  "Cough / Cold",
  "Sore Throat",
  "Fatigue",
  "Stomach Discomfort",
  "Dizziness",
];

function getFeverBadgeStyle(status: FeverStatus | undefined): string {
  switch (status) {
    case "High":
      return "bg-rose-500/20 text-rose-200 border-rose-400/45";
    case "Moderate":
      return "bg-amber-500/20 text-amber-200 border-amber-400/45";
    case "Mild":
      return "bg-sky-500/20 text-sky-200 border-sky-400/45";
    default:
      return "bg-teal-500/18 text-teal-200 border-teal-400/40";
  }
}

function buildLocalTrendFallback(entries: StressReport[], studentLabel: string): TrendAnalysisResult {
  const latest = entries[0];
  const avgSleep = entries.reduce((acc, e) => acc + e.sleep_hours, 0) / entries.length;
  const avgWater = entries.reduce((acc, e) => acc + e.water_intake, 0) / entries.length;
  const avgStress = entries.reduce((acc, e) => acc + e.stress_level, 0) / entries.length;
  const avgWellness = Math.round(
    entries.reduce((acc, e) => acc + e.wellness_index, 0) / entries.length
  );
  const feverEntries = entries.filter(
    (e) => e.fever_status && e.fever_status !== "None"
  ).length;

  let trendSentence = `Across ${entries.length} logged check-in(s) for ${studentLabel}, average wellness is ${avgWellness}/100, mean stress ${avgStress.toFixed(1)}/10, with ${avgSleep.toFixed(1)}h sleep and ${avgWater.toFixed(1)} glasses of water daily.`;
  if (entries.length >= 2) {
    const delta = latest.wellness_index - entries[1].wellness_index;
    if (delta >= 4) {
      trendSentence += ` The most recent entry improved by +${delta} points compared with the prior log.`;
    } else if (delta <= -4) {
      trendSentence += ` The latest wellness score dipped by ${Math.abs(delta)} points, so extra rest and symptom monitoring are advised.`;
    } else {
      trendSentence += " Recent entries remain steady.";
    }
  }

  const recs: string[] = [];
  if (feverEntries > 0 || (latest.fever_status && latest.fever_status !== "None")) {
    recs.push(
      "Log body temperature at consistent morning and evening intervals until fever stays normal for 24 hours."
    );
    recs.push("Prioritize rest, light meals, and steady oral fluids.");
  }
  if (avgStress >= 7) {
    recs.push("Elevated stress detected—break tasks into 45-minute study blocks and speak with a counselor or advisor.");
  }
  if (avgSleep < 7) {
    recs.push("Target 7.5–8.5 hours of sleep per night to support faster recovery.");
  }
  if (avgWater < 6) {
    recs.push("Increase daily water intake toward 7–8 glasses spaced across the day.");
  }
  if (recs.length === 0) {
    recs.push("Maintain your current hydration and sleep cadence, and keep logging daily.");
  }

  return {
    observation: trendSentence,
    recommendations: recs,
    safetyNote: STANDARD_WELLNESS_DISCLAIMER,
    source: "local",
  };
}

export function DailyHealthTracker({
  activeRole,
  departments,
  students,
  reports,
  stressFactors,
  reportFactors,
  selectedStudentId,
  onSelectStudentId,
  onAddFactor,
  onCommitCheckIn,
  onUpdateReport,
  onDeleteEntry,
  onInspectEntry,
  onConsultDoctor,
}: DailyHealthTrackerProps) {
  const [intakeMode, setIntakeMode] = useState<"existing" | "new">(() =>
    students.length > 0 ? "existing" : "new"
  );
  const [draftFullName, setDraftFullName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftSemester, setDraftSemester] = useState("Sem 1");
  const [draftDeptId, setDraftDeptId] = useState("");
  const [draftClassSection, setDraftClassSection] = useState("");
  const [draftRollNo, setDraftRollNo] = useState("");
  const [draftAge, setDraftAge] = useState("19");

  const [submissionDate, setSubmissionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [feverStatus, setFeverStatus] = useState<FeverStatus>("None");
  const [tempFInput, setTempFInput] = useState("");
  const [sleepHours, setSleepHours] = useState("7.5");
  const [waterIntake, setWaterIntake] = useState("6");
  const [stressLevel, setStressLevel] = useState("4");
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [selectedFactorIds, setSelectedFactorIds] = useState<string[]>([]);
  const [newFactorName, setNewFactorName] = useState("");
  const [notes, setNotes] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [filterStudentId, setFilterStudentId] = useState<string>("ALL");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [editingEntry, setEditingEntry] = useState<StressReport | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editStress, setEditStress] = useState("5");
  const [editSleep, setEditSleep] = useState("7");
  const [editWater, setEditWater] = useState("6");
  const [editFever, setEditFever] = useState<FeverStatus>("None");
  const [editTempF, setEditTempF] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [editFactorIds, setEditFactorIds] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  const [isAnalyzingTrend, setIsAnalyzingTrend] = useState(false);
  const [trendAnalysis, setTrendAnalysis] = useState<TrendAnalysisResult | null>(null);

  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    for (const s of students) map.set(s.student_id, s);
    return map;
  }, [students]);

  const factorMap = useMemo(() => {
    const map = new Map<string, StressFactor>();
    for (const f of stressFactors) map.set(f.factor_id, f);
    return map;
  }, [stressFactors]);

  const reportFactorNamesMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const rf of reportFactors) {
      const f = factorMap.get(rf.factor_id);
      if (!f) continue;
      const list = map.get(rf.report_id) ?? [];
      list.push(f.factor_name);
      map.set(rf.report_id, list);
    }
    return map;
  }, [reportFactors, factorMap]);

  const effectiveIntakeMode = students.length === 0 ? "new" : intakeMode;

  const parsedTempF = useMemo(() => {
    if (!tempFInput.trim()) return null;
    const val = Number(tempFInput);
    if (!Number.isFinite(val) || val < 92 || val > 108) return null;
    return Math.round(val * 10) / 10;
  }, [tempFInput]);

  function handleTemperatureChange(val: string) {
    setTempFInput(val);
    const num = Number(val);
    if (val.trim() && Number.isFinite(num) && num >= 94 && num <= 108) {
      setFeverStatus(inferFeverStatusFromTemp(num));
    }
  }

  function toggleSymptom(symptom: string) {
    setSelectedSymptoms((prev) =>
      prev.includes(symptom) ? prev.filter((item) => item !== symptom) : [...prev, symptom]
    );
  }

  function toggleFactor(factorId: string) {
    setSelectedFactorIds((prev) =>
      prev.includes(factorId) ? prev.filter((id) => id !== factorId) : [...prev, factorId]
    );
  }

  function handleQuickCreateFactor() {
    const clean = newFactorName.trim();
    if (!clean) return;
    const res = onAddFactor({
      factor_name: clean,
      description: `${clean} reported in daily tracker.`,
    });
    if (!res.ok) {
      setFormError(res.error ?? "Unable to create stress factor.");
      return;
    }
    if (res.factor) {
      setSelectedFactorIds((prev) =>
        prev.includes(res.factor!.factor_id) ? prev : [...prev, res.factor!.factor_id]
      );
    }
    setNewFactorName("");
    setFormError(null);
  }

  function handleLoadStandardFactors() {
    for (const tpl of SUGGESTED_FACTOR_TEMPLATES) {
      const exists = stressFactors.some(
        (f) => f.factor_name.toLowerCase() === tpl.factor_name.toLowerCase()
      );
      if (!exists) {
        onAddFactor(tpl);
      }
    }
  }

  function handleSubmitCheckIn(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaveSuccess(null);

    let studentProfile: PendingStudentProfile;

    if (effectiveIntakeMode === "existing" && students.length > 0) {
      const target =
        students.find((s) => s.student_id === (selectedStudentId || students[0]?.student_id)) ??
        students[0];
      if (!target) {
        setFormError("Please select a student profile.");
        return;
      }
      studentProfile = {
        existingStudentId: target.student_id,
        full_name: target.full_name,
        email: target.email,
        semester: target.semester,
        dept_id: target.dept_id,
        class_section: target.class_section,
        roll_no: target.roll_no,
        age: target.age,
      };
    } else {
      const cleanName = draftFullName.trim();
      const cleanEmail = draftEmail.trim();
      const cleanSemester = draftSemester.trim() || "Sem 1";
      const cleanSection = draftClassSection.trim().toUpperCase();
      const cleanRoll = draftRollNo.trim();
      const parsedAge = Number(draftAge);

      if (!cleanName) {
        setFormError("Please enter the student's full name.");
        return;
      }
      if (!cleanSection) {
        setFormError("Please enter the class / section (e.g., CS-3A).");
        return;
      }
      if (!cleanRoll) {
        setFormError("Please enter the student's roll number.");
        return;
      }
      if (!Number.isInteger(parsedAge) || parsedAge < 12 || parsedAge > 45) {
        setFormError("Age must be a whole number between 12 and 45.");
        return;
      }

      studentProfile = {
        full_name: cleanName,
        email: cleanEmail,
        semester: cleanSemester,
        dept_id: draftDeptId || null,
        class_section: cleanSection,
        roll_no: cleanRoll,
        age: parsedAge,
      };
    }

    if (tempFInput.trim() && parsedTempF === null) {
      setFormError("Body temperature (°F) should be between 92.0 and 108.0°F (or leave blank).");
      return;
    }

    const sleepNum = Math.min(18, Math.max(0, Number(sleepHours) || 0));
    const waterNum = Math.min(30, Math.max(0, Math.round(Number(waterIntake) || 0)));
    const stressNum = Math.min(10, Math.max(1, Math.round(Number(stressLevel) || 4)));

    const wellnessIndex = calculateDailyWellnessScore({
      sleepHours: sleepNum,
      waterIntake: waterNum,
      stressScore: stressNum,
      feverStatus,
      symptomCount: selectedSymptoms.length,
    });

    const assessment = buildDailyTrackerAssessment({
      studentName: studentProfile.full_name,
      feverStatus,
      temperatureF: parsedTempF,
      sleepHours: sleepNum,
      waterIntake: waterNum,
      stressScore: stressNum,
      symptoms: selectedSymptoms,
    });

    const symptomPrefix =
      selectedSymptoms.length > 0 ? `Symptoms: ${selectedSymptoms.join(", ")}. ` : "";
    const tempPrefix =
      parsedTempF !== null
        ? `Temp: ${parsedTempF.toFixed(1)}°F (${feverStatus} fever). `
        : feverStatus !== "None"
          ? `Fever status: ${feverStatus}. `
          : "";
    const compiledRemarks =
      `${tempPrefix}${symptomPrefix}${notes.trim()}`.trim() ||
      "Routine daily wellness & fever check-in.";

    const res = onCommitCheckIn({
      studentProfile,
      reportInput: {
        submission_date: submissionDate || new Date().toISOString().slice(0, 10),
        sleep_hours: Math.round(sleepNum * 10) / 10,
        water_intake: waterNum,
        stress_level: stressNum,
        wellness_index: wellnessIndex,
        remarks: compiledRemarks,
        ai_assessment: assessment.ai_assessment,
        actionable_tips: assessment.actionable_tips,
        disclaimer: assessment.disclaimer,
        temperature_f: parsedTempF,
        fever_status: feverStatus,
        symptoms: selectedSymptoms,
        entry_source: "daily_tracker",
        factorIds: selectedFactorIds,
      },
    });

    if (!res.ok || !res.student || !res.report) {
      setFormError(res.error ?? "Unable to save daily check-in.");
      return;
    }

    setSaveSuccess(
      `Saved daily check-in ${res.report.report_id} for ${res.student.full_name} (Wellness ${res.report.wellness_index}/100).`
    );
    setNotes("");
    setSelectedSymptoms([]);
    setTempFInput("");
    setFeverStatus("None");
    if (effectiveIntakeMode === "new") {
      setDraftFullName("");
      setDraftEmail("");
      setDraftClassSection("");
      setDraftRollNo("");
      setIntakeMode("existing");
    }
  }

  function openEditModal(entry: StressReport) {
    setEditingEntry(entry);
    setEditDate(entry.submission_date);
    setEditStress(String(entry.stress_level));
    setEditSleep(String(entry.sleep_hours));
    setEditWater(String(entry.water_intake));
    setEditFever(entry.fever_status ?? "None");
    setEditTempF(typeof entry.temperature_f === "number" ? String(entry.temperature_f) : "");
    setEditRemarks(entry.remarks);
    setEditFactorIds(
      reportFactors.filter((rf) => rf.report_id === entry.report_id).map((rf) => rf.factor_id)
    );
    setEditError(null);
  }

  function handleSaveRevision(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEntry) return;
    const tempVal = editTempF.trim() ? Number(editTempF) : null;
    if (editTempF.trim() && (tempVal === null || !Number.isFinite(tempVal) || tempVal < 92 || tempVal > 108)) {
      setEditError("Body temperature (°F) must be between 92.0 and 108.0 or blank.");
      return;
    }
    const res = onUpdateReport(editingEntry.report_id, {
      submission_date: editDate || editingEntry.submission_date,
      stress_level: Math.min(10, Math.max(1, Math.round(Number(editStress) || 5))),
      sleep_hours: Math.min(18, Math.max(0, Number(editSleep) || 7)),
      water_intake: Math.min(30, Math.max(0, Math.round(Number(editWater) || 6))),
      fever_status: editFever,
      temperature_f: tempVal !== null ? Math.round(tempVal * 10) / 10 : null,
      remarks: editRemarks.trim() || editingEntry.remarks,
      factorIds: editFactorIds,
    });
    if (!res.ok) {
      setEditError(res.error ?? "Unable to update entry.");
      return;
    }
    setEditingEntry(null);
  }

  const filteredLogs = useMemo(() => {
    const list =
      filterStudentId === "ALL"
        ? reports
        : reports.filter((r) => r.student_id === filterStudentId);
    return [...list].sort(
      (a, b) =>
        b.submission_date.localeCompare(a.submission_date) ||
        b.report_id.localeCompare(a.report_id)
    );
  }, [reports, filterStudentId]);

  const chronologicalTrend = useMemo(() => {
    return [...filteredLogs].reverse().slice(-12);
  }, [filteredLogs]);

  const summary = useMemo(() => {
    if (filteredLogs.length === 0) {
      return {
        totalCount: 0,
        latestTempLabel: "—",
        latestFever: "None" as FeverStatus,
        meanWellness: "—",
        trendLabel: "No trend yet",
        trendState: "neutral" as "up" | "down" | "neutral",
      };
    }

    const latest = filteredLogs[0];
    const latestWithTemp = filteredLogs.find((item) => typeof item.temperature_f === "number");
    const latestTempLabel = latestWithTemp?.temperature_f
      ? `${latestWithTemp.temperature_f.toFixed(1)}°F`
      : latest.fever_status ?? "Normal";

    const meanWellness = `${Math.round(
      filteredLogs.reduce((acc, item) => acc + item.wellness_index, 0) / filteredLogs.length
    )} / 100`;

    let trendLabel = "Baseline logged";
    let trendState: "up" | "down" | "neutral" = "neutral";

    if (filteredLogs.length >= 2) {
      const previous = filteredLogs[1];
      const delta = latest.wellness_index - previous.wellness_index;
      if (delta >= 4) {
        trendLabel = `Improving (+${delta} pts)`;
        trendState = "up";
      } else if (delta <= -4) {
        trendLabel = `Watch closely (${delta} pts)`;
        trendState = "down";
      } else {
        trendLabel = "Steady recovery";
        trendState = "neutral";
      }
    }

    return {
      totalCount: filteredLogs.length,
      latestTempLabel,
      latestFever: latest.fever_status ?? "None",
      meanWellness,
      trendLabel,
      trendState,
    };
  }, [filteredLogs]);

  async function handleAnalyzeTrend() {
    if (filteredLogs.length === 0 || isAnalyzingTrend) return;
    setIsAnalyzingTrend(true);

    const activeStudentName =
      filterStudentId !== "ALL"
        ? studentMap.get(filterStudentId)?.full_name ?? filterStudentId
        : "all tracked students";

    try {
      const data = await safeFetchJson<{
        observation: string;
        recommendations: string[];
        safetyNote: string;
      }>("/api/tracker/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: 12000,
        body: JSON.stringify({
          studentName: activeStudentName,
          entries: filteredLogs.slice(0, 12).map((e) => ({
            recorded_at: e.submission_date,
            temperature_f: e.temperature_f ?? null,
            fever_status: e.fever_status ?? "None",
            sleep_hours: e.sleep_hours,
            water_intake: e.water_intake,
            stress_score: e.stress_level,
            wellness_index: e.wellness_index,
            symptoms: e.symptoms ?? [],
            factors: reportFactorNamesMap.get(e.report_id) ?? [],
            student_opinion: e.remarks,
          })),
        }),
      });

      setTrendAnalysis({
        observation: data.observation,
        recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
        safetyNote: data.safetyNote || STANDARD_WELLNESS_DISCLAIMER,
        source: "live",
      });
    } catch {
      setTrendAnalysis(buildLocalTrendFallback(filteredLogs, activeStudentName));
    } finally {
      setIsAnalyzingTrend(false);
    }
  }

  const showHighFeverAlert =
    feverStatus === "High" || (parsedTempF !== null && parsedTempF >= 102.3);

  const canModifyEntry = (entry: StressReport) =>
    activeRole === "Admin" ||
    activeRole === "Counselor" ||
    !selectedStudentId ||
    entry.student_id === selectedStudentId;

  return (
    <div className="space-y-6">
      {/* Teal/Aqua Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="tab-surface-card rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-300/75">Logged Check-Ins</div>
          <div className="mt-1.5 text-2xl font-semibold text-slate-50 tabular-nums">
            {summary.totalCount}
          </div>
          <div className="mt-1 text-xs text-slate-300/65">
            {filterStudentId === "ALL" ? "Across all profiles" : "Selected student"}
          </div>
        </div>

        <div className="tab-surface-card rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-300/75">Latest Temp / Fever</div>
          <div className="mt-1.5 text-2xl font-semibold tab-accent-text tabular-nums">
            {summary.latestTempLabel}
          </div>
          <div className="mt-1 text-xs text-slate-300/65">
            Status: {summary.latestFever}
          </div>
        </div>

        <div className="tab-surface-card rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-300/75">Mean Wellness Score</div>
          <div className="mt-1.5 text-2xl font-semibold text-slate-50 tabular-nums">
            {summary.meanWellness}
          </div>
          <div className="mt-1 text-xs text-slate-300/65">Sleep, hydration &amp; fever adjusted</div>
        </div>

        <div className="tab-surface-card rounded-lg px-5 py-4">
          <div className="text-xs font-medium text-slate-300/75">Recovery Trend</div>
          <div className="mt-1.5 flex items-center gap-2 text-lg font-semibold text-slate-50">
            {summary.trendState === "up" && (
              <TrendingUp className="w-5 h-5 text-teal-300 shrink-0" aria-hidden="true" />
            )}
            {summary.trendState === "down" && (
              <TrendingDown className="w-5 h-5 text-amber-300 shrink-0" aria-hidden="true" />
            )}
            {summary.trendState === "neutral" && (
              <Minus className="w-5 h-5 text-teal-300/75 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{summary.trendLabel}</span>
          </div>
          <div className="mt-1 text-xs text-slate-300/65">Compared with previous check-in</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Daily Check-In Logger */}
        <section className="xl:col-span-5 tab-surface-card rounded-lg overflow-hidden h-fit">
          <div className="px-5 py-4 border-b tab-divider flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-50 flex items-center gap-2">
                <Thermometer className="w-4 h-4 tab-accent-text" aria-hidden="true" />
                <span>Log Daily Health &amp; Fever Check-In</span>
              </h2>
              <p className="mt-0.5 text-xs text-slate-300/75">
                Saved directly to localStorage under <span className="font-mono">stress_reports</span>.
              </p>
            </div>

            {students.length > 0 && (
              <div className="inline-flex items-center p-0.5 bg-[#090514] border tab-divider rounded-md">
                <button
                  type="button"
                  onClick={() => {
                    setIntakeMode("existing");
                    setFormError(null);
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    effectiveIntakeMode === "existing"
                      ? "tab-chip-active border"
                      : "text-slate-300/70 border border-transparent hover:text-slate-100"
                  }`}
                >
                  Existing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIntakeMode("new");
                    setFormError(null);
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    effectiveIntakeMode === "new"
                      ? "tab-chip-active border"
                      : "text-slate-300/70 border border-transparent hover:text-slate-100"
                  }`}
                >
                  New Student
                </button>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmitCheckIn} className="p-5 space-y-4">
            {formError && (
              <div
                role="alert"
                className="px-3.5 py-2.5 bg-rose-500/10 border border-rose-500/35 rounded-md text-xs text-rose-200 flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}

            {saveSuccess && (
              <div
                role="status"
                className="px-3.5 py-2.5 bg-teal-500/12 border border-teal-400/35 rounded-md text-xs text-teal-200 flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{saveSuccess}</span>
              </div>
            )}

            {effectiveIntakeMode === "existing" && students.length > 0 ? (
              <div>
                <label htmlFor="tracker-stu" className="block text-xs font-medium text-slate-200/85 mb-1.5">
                  Student Profile
                </label>
                <select
                  id="tracker-stu"
                  value={selectedStudentId || students[0]?.student_id || ""}
                  onChange={(e) => onSelectStudentId(e.target.value)}
                  className="w-full px-3 py-2 text-sm tab-input rounded-md"
                >
                  {students.map((s) => (
                    <option key={s.student_id} value={s.student_id} className="bg-[#090514]">
                      {s.student_id} — {s.full_name} ({s.class_section})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="tr-name" className="block text-xs font-medium text-slate-200/80 mb-1">
                    Full Name
                  </label>
                  <input
                    id="tr-name"
                    type="text"
                    value={draftFullName}
                    onChange={(e) => setDraftFullName(e.target.value)}
                    placeholder="Student full name"
                    className="w-full px-3 py-2 text-sm tab-input rounded-md placeholder:text-slate-400/45"
                  />
                </div>
                <div>
                  <label htmlFor="tr-email" className="block text-xs font-medium text-slate-200/80 mb-1">
                    Email (optional)
                  </label>
                  <input
                    id="tr-email"
                    type="email"
                    value={draftEmail}
                    onChange={(e) => setDraftEmail(e.target.value)}
                    placeholder="student@campus.edu"
                    className="w-full px-3 py-2 text-sm tab-input rounded-md placeholder:text-slate-400/45"
                  />
                </div>
                <div>
                  <label htmlFor="tr-sec" className="block text-xs font-medium text-slate-200/80 mb-1">
                    Class / Section
                  </label>
                  <input
                    id="tr-sec"
                    type="text"
                    value={draftClassSection}
                    onChange={(e) => setDraftClassSection(e.target.value)}
                    placeholder="e.g. CS-3A"
                    className="w-full px-3 py-2 text-sm tab-input rounded-md placeholder:text-slate-400/45"
                  />
                </div>
                <div>
                  <label htmlFor="tr-roll" className="block text-xs font-medium text-slate-200/80 mb-1">
                    Roll Number
                  </label>
                  <input
                    id="tr-roll"
                    type="text"
                    value={draftRollNo}
                    onChange={(e) => setDraftRollNo(e.target.value)}
                    placeholder="e.g. 2026-042"
                    className="w-full px-3 py-2 text-sm tab-input rounded-md placeholder:text-slate-400/45"
                  />
                </div>
                <div>
                  <label htmlFor="tr-sem" className="block text-xs font-medium text-slate-200/80 mb-1">
                    Semester
                  </label>
                  <input
                    id="tr-sem"
                    type="text"
                    value={draftSemester}
                    onChange={(e) => setDraftSemester(e.target.value)}
                    placeholder="Sem 1"
                    className="w-full px-3 py-2 text-sm tab-input rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="tr-dept" className="block text-xs font-medium text-slate-200/80 mb-1">
                    Department
                  </label>
                  <select
                    id="tr-dept"
                    value={draftDeptId}
                    onChange={(e) => setDraftDeptId(e.target.value)}
                    className="w-full px-3 py-2 text-sm tab-input rounded-md"
                  >
                    <option value="" className="bg-[#090514]">
                      Unassigned
                    </option>
                    {departments.map((d) => (
                      <option key={d.dept_id} value={d.dept_id} className="bg-[#090514]">
                        {d.dept_id} · {d.dept_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="tr-age" className="block text-xs font-medium text-slate-200/80 mb-1">
                    Age
                  </label>
                  <input
                    id="tr-age"
                    type="number"
                    min={12}
                    max={45}
                    value={draftAge}
                    onChange={(e) => setDraftAge(e.target.value)}
                    className="w-full px-3 py-2 text-sm tab-input rounded-md tabular-nums"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="tr-date" className="block text-xs font-medium text-slate-200/85 mb-1">
                  Submission Date
                </label>
                <input
                  id="tr-date"
                  type="date"
                  value={submissionDate}
                  onChange={(e) => setSubmissionDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm tab-input rounded-md tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="tr-temp" className="block text-xs font-medium text-slate-200/85 mb-1">
                  Body Temp (°F, optional)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="tr-temp"
                    type="number"
                    step="0.1"
                    min={92}
                    max={108}
                    value={tempFInput}
                    onChange={(e) => handleTemperatureChange(e.target.value)}
                    placeholder="e.g. 98.6"
                    className="w-full px-3 py-2 text-sm tab-input rounded-md tabular-nums placeholder:text-slate-400/45"
                  />
                  {parsedTempF !== null && (
                    <span className="text-xs font-mono text-teal-300 shrink-0 tabular-nums">
                      {(((parsedTempF - 32) * 5) / 9).toFixed(1)}°C
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-200/85 mb-1.5">
                Fever Status
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {FEVER_OPTIONS.map((opt) => {
                  const active = feverStatus === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFeverStatus(opt.value)}
                      className={`px-2.5 py-2 rounded-md border text-left transition-colors ${
                        active
                          ? "tab-chip-active"
                          : "bg-[#090514] border-slate-700/60 text-slate-300 hover:border-teal-400/45"
                      }`}
                    >
                      <div className="text-xs font-semibold">{opt.label}</div>
                      <div className="text-[10px] text-slate-300/70 font-mono">
                        {opt.rangeHint}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {showHighFeverAlert && (
              <div
                role="alert"
                className="px-3.5 py-2.5 bg-rose-500/12 border border-rose-400/40 rounded-md text-xs text-rose-100 flex items-start gap-2.5"
              >
                <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  High fever logged. Please rest, notify a parent/guardian or campus clinic right away, and arrange an in-person licensed doctor checkup—especially if breathing difficulty, severe headache, stiff neck, or persistent vomiting occurs.
                </span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="tr-sleep" className="block text-xs font-medium text-slate-200/80 mb-1">
                  Sleep (hrs)
                </label>
                <input
                  id="tr-sleep"
                  type="number"
                  step="0.5"
                  min={0}
                  max={18}
                  value={sleepHours}
                  onChange={(e) => setSleepHours(e.target.value)}
                  className="w-full px-3 py-2 text-sm tab-input rounded-md tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="tr-water" className="block text-xs font-medium text-slate-200/80 mb-1">
                  Water (glasses)
                </label>
                <input
                  id="tr-water"
                  type="number"
                  min={0}
                  max={30}
                  value={waterIntake}
                  onChange={(e) => setWaterIntake(e.target.value)}
                  className="w-full px-3 py-2 text-sm tab-input rounded-md tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="tr-stress" className="block text-xs font-medium text-slate-200/80 mb-1">
                  Stress (1–10)
                </label>
                <input
                  id="tr-stress"
                  type="number"
                  min={1}
                  max={10}
                  value={stressLevel}
                  onChange={(e) => setStressLevel(e.target.value)}
                  className="w-full px-3 py-2 text-sm tab-input rounded-md tabular-nums"
                />
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-200/85 mb-1.5">
                Current Symptoms (Optional)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SYMPTOM_CHIPS.map((sym) => {
                  const selected = selectedSymptoms.includes(sym);
                  return (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => toggleSymptom(sym)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                        selected
                          ? "tab-chip-active"
                          : "bg-[#090514] border-slate-700/60 text-slate-300/85 hover:border-teal-400/50"
                      }`}
                    >
                      {sym}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stress Factors M:N Tagging */}
            <div className="p-3 bg-[#090514]/85 border tab-divider rounded-md space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-200/90">
                  <Tag className="w-3.5 h-3.5 tab-accent-text" aria-hidden="true" />
                  <span>Contributing Stress Factors</span>
                </span>
                {stressFactors.length === 0 && (
                  <button
                    type="button"
                    onClick={handleLoadStandardFactors}
                    className="px-2 py-0.5 text-[11px] tab-outline-btn rounded"
                  >
                    Load Standard 5
                  </button>
                )}
              </div>

              {stressFactors.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {stressFactors.map((fac) => {
                    const active = selectedFactorIds.includes(fac.factor_id);
                    return (
                      <button
                        key={fac.factor_id}
                        type="button"
                        onClick={() => toggleFactor(fac.factor_id)}
                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                          active
                            ? "tab-chip-active"
                            : "bg-[#120926] border-slate-700/60 text-slate-300/85 hover:border-teal-400/50"
                        }`}
                      >
                        {fac.factor_name}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newFactorName}
                  onChange={(e) => setNewFactorName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleQuickCreateFactor();
                    }
                  }}
                  placeholder="Add factor (e.g., Exams, Lack of Sleep)..."
                  className="flex-1 px-2.5 py-1.5 text-xs tab-input rounded-md placeholder:text-slate-400/45"
                />
                <button
                  type="button"
                  onClick={handleQuickCreateFactor}
                  disabled={!newFactorName.trim()}
                  className="px-2.5 py-1.5 text-xs font-medium tab-outline-btn rounded-md disabled:opacity-45"
                >
                  + Add
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="tr-notes" className="block text-xs font-medium text-slate-200/85 mb-1">
                Quick Health Remarks
              </label>
              <textarea
                id="tr-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="How are you feeling today? Note fever changes, appetite, or stress..."
                className="w-full px-3 py-2 text-sm tab-input rounded-md placeholder:text-slate-400/45 resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-md tab-cta-btn"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Save Daily Check-In</span>
            </button>

            <p className="text-[11px] text-slate-300/60 leading-snug">
              Tracks daily temperature and general wellness awareness. Always consult a licensed doctor for persistent or severe symptoms.
            </p>
          </form>
        </section>

        {/* Visual Recovery Trend & AI Trend Analysis + History List */}
        <section className="xl:col-span-7 space-y-5">
          <div className="tab-surface-card rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-50">
                  Wellness &amp; Fever Recovery Trend
                </h2>
                <p className="mt-0.5 text-xs text-slate-300/70">
                  Visual timeline of logged check-ins plus AI trend insights.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter tracker by student"
                  value={filterStudentId}
                  onChange={(e) => {
                    setFilterStudentId(e.target.value);
                    setTrendAnalysis(null);
                  }}
                  className="px-3 py-1.5 text-xs tab-input rounded-md"
                >
                  <option value="ALL" className="bg-[#090514]">
                    All Students ({reports.length})
                  </option>
                  {students.map((s) => (
                    <option key={s.student_id} value={s.student_id} className="bg-[#090514]">
                      {s.full_name} ({s.student_id})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={filteredLogs.length === 0 || isAnalyzingTrend}
                  onClick={() => void handleAnalyzeTrend()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md tab-cta-btn disabled:opacity-45"
                >
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{isAnalyzingTrend ? "Analyzing..." : "AI Trend Analysis"}</span>
                </button>
              </div>
            </div>

            {trendAnalysis && (
              <div className="p-4 bg-[#090514]/90 border border-teal-400/35 rounded-md space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold tab-accent-text">
                    AI Trend Observation
                  </span>
                  <button
                    type="button"
                    onClick={() => setTrendAnalysis(null)}
                    className="text-[11px] text-slate-400 hover:text-slate-100"
                  >
                    Dismiss
                  </button>
                </div>
                <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">
                  {trendAnalysis.observation}
                </p>
                {trendAnalysis.recommendations.length > 0 && (
                  <ul className="space-y-1 text-xs text-slate-200/85 list-disc pl-5">
                    {trendAnalysis.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-teal-200/75 pt-1 border-t border-slate-800/80">
                  {trendAnalysis.safetyNote}
                </p>
              </div>
            )}

            {chronologicalTrend.length === 0 ? (
              <div className="py-10 px-4 bg-[#090514]/85 border border-dashed tab-divider rounded-md text-center space-y-2">
                <Thermometer className="w-6 h-6 tab-accent-text mx-auto opacity-75" aria-hidden="true" />
                <p className="text-sm font-medium text-slate-200">No daily check-ins logged yet</p>
                <p className="text-xs text-slate-300/65 max-w-md mx-auto">
                  Log your first check-in on the left to begin tracking body temperature, hydration, sleep, and stress trends over time.
                </p>
              </div>
            ) : (
              <div className="p-4 bg-[#090514]/90 border tab-divider rounded-md">
                <div className="flex items-end gap-2 sm:gap-3 h-40 pt-4">
                  {chronologicalTrend.map((entry) => {
                    const heightPct = Math.max(16, Math.min(100, entry.wellness_index));
                    const fever = entry.fever_status ?? "None";
                    const barColor =
                      fever === "High"
                        ? "bg-rose-400/85"
                        : fever === "Moderate"
                          ? "bg-amber-400/85"
                          : fever === "Mild"
                            ? "bg-sky-400/85"
                            : "bg-teal-400/85";

                    return (
                      <button
                        key={entry.report_id}
                        type="button"
                        onClick={() => onInspectEntry(entry)}
                        title={`${entry.submission_date} · Wellness ${entry.wellness_index}/100${
                          entry.temperature_f ? ` · ${entry.temperature_f}°F` : ""
                        }`}
                        className="flex-1 min-w-[26px] max-w-[64px] h-full flex flex-col justify-end items-center gap-1.5 group focus:outline-none"
                      >
                        <span className="text-[10px] font-mono text-slate-300/80 tabular-nums">
                          {entry.temperature_f ? `${entry.temperature_f}°` : `${entry.wellness_index}`}
                        </span>
                        <div className="w-full flex-1 flex items-end justify-center">
                          <div
                            style={{ height: `${heightPct}%` }}
                            className={`w-full max-w-[30px] rounded-t-md transition-all duration-300 group-hover:opacity-100 opacity-85 ${barColor}`}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 tabular-nums truncate w-full text-center">
                          {entry.submission_date.slice(5)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300/70">
                  <span>Bar height = Wellness Score (0–100) · Click any bar to inspect full record</span>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-teal-400" /> Normal
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-sky-400" /> Mild
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-400" /> Moderate
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-rose-400" /> High
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Check-In History List */}
          <div className="tab-surface-card rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b tab-divider flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-50">
                Daily Check-In History ({filteredLogs.length})
              </h3>
              <span className="text-xs text-slate-300/65">Most recent first</span>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-300/65">
                Logged daily check-ins and stress reports will appear here.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {filteredLogs.map((entry) => {
                  const stu = studentMap.get(entry.student_id);
                  const fever = entry.fever_status ?? "None";
                  const factorNames = reportFactorNamesMap.get(entry.report_id) ?? [];
                  const isConfirming = pendingDeleteId === entry.report_id;

                  return (
                    <div
                      key={entry.report_id}
                      className="p-4 sm:px-5 space-y-2.5 hover:bg-[#190F35]/40 transition-colors"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-50">
                              {stu?.full_name ?? entry.student_id}
                            </span>
                            <span className="text-xs font-mono text-slate-400">
                              {entry.submission_date} · {entry.report_id}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-[11px] font-medium border rounded ${getFeverBadgeStyle(
                                fever
                              )}`}
                            >
                              {entry.temperature_f
                                ? `${entry.temperature_f.toFixed(1)}°F · ${fever} Fever`
                                : `${fever} Fever`}
                            </span>
                          </div>
                          {((entry.symptoms && entry.symptoms.length > 0) || factorNames.length > 0) && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {(entry.symptoms ?? []).map((sym) => (
                                <span
                                  key={sym}
                                  className="px-2 py-0.5 text-[11px] bg-[#090514] border border-teal-500/25 text-teal-200/85 rounded"
                                >
                                  {sym}
                                </span>
                              ))}
                              {factorNames.map((fn) => (
                                <span
                                  key={fn}
                                  className="px-2 py-0.5 text-[11px] bg-violet-500/15 border border-violet-400/35 text-violet-200 rounded"
                                >
                                  Factor: {fn}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 text-xs font-mono font-semibold bg-[#090514] border tab-divider rounded tab-accent-text tabular-nums">
                            {entry.wellness_index}/100
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-200/85 leading-relaxed">{entry.remarks}</p>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300/75 font-mono tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <Moon className="w-3.5 h-3.5 text-teal-300/80" aria-hidden="true" />
                            {entry.sleep_hours.toFixed(1)}h sleep
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Droplets className="w-3.5 h-3.5 text-teal-300/80" aria-hidden="true" />
                            {entry.water_intake} glasses
                          </span>
                          <span>Stress {entry.stress_level}/10</span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => onConsultDoctor(entry.student_id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-sky-200 bg-[#090514] border border-sky-400/35 hover:border-sky-300/70 rounded transition-colors"
                          >
                            <Stethoscope className="w-3 h-3" aria-hidden="true" />
                            <span>Consult Doctor AI</span>
                          </button>

                          {canModifyEntry(entry) && (
                            <button
                              type="button"
                              onClick={() => openEditModal(entry)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium tab-outline-btn rounded"
                            >
                              <Edit3 className="w-3 h-3" aria-hidden="true" />
                              <span>Revise</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onInspectEntry(entry)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium tab-outline-btn rounded"
                          >
                            <Eye className="w-3 h-3" aria-hidden="true" />
                            <span>Inspect</span>
                          </button>

                          {canModifyEntry(entry) &&
                            (isConfirming ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteEntry(entry.report_id);
                                    setPendingDeleteId(null);
                                  }}
                                  className="px-2 py-1 text-xs font-medium text-rose-200 bg-rose-500/20 border border-rose-400/45 rounded"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPendingDeleteId(null)}
                                  className="px-2 py-1 text-xs text-slate-300/80 hover:text-slate-100"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                aria-label={`Delete entry ${entry.report_id}`}
                                onClick={() => setPendingDeleteId(entry.report_id)}
                                className="p-1.5 text-slate-400 hover:text-rose-300 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Inline Revise Entry Modal */}
      {editingEntry && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Revise Daily Check-In"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
          onClick={() => setEditingEntry(null)}
        >
          <div
            className="w-full max-w-lg bg-[#120926] border border-teal-400/35 rounded-lg overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b tab-divider flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-50">
                  Revise Check-In · {editingEntry.report_id}
                </h3>
                <p className="text-xs text-slate-300/70">
                  Update metrics, fever reading, remarks, or contributing factors.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setEditingEntry(null)}
                className="p-1.5 text-slate-400 hover:text-slate-100 rounded"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveRevision} className="p-5 space-y-4">
              {editError && (
                <div className="px-3 py-2 bg-rose-500/12 border border-rose-400/40 rounded text-xs text-rose-200">
                  {editError}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-mono text-slate-300/80 mb-1">
                    submission_date
                  </label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs tab-input rounded-md tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-300/80 mb-1">
                    stress_level (1-10)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={editStress}
                    onChange={(e) => setEditStress(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs tab-input rounded-md tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-300/80 mb-1">
                    Temp (°F)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={92}
                    max={108}
                    value={editTempF}
                    onChange={(e) => setEditTempF(e.target.value)}
                    placeholder="optional"
                    className="w-full px-2.5 py-1.5 text-xs tab-input rounded-md tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-300/80 mb-1">
                    sleep_hours
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={18}
                    value={editSleep}
                    onChange={(e) => setEditSleep(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs tab-input rounded-md tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-300/80 mb-1">
                    water_intake
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={editWater}
                    onChange={(e) => setEditWater(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs tab-input rounded-md tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-300/80 mb-1">
                    fever_status
                  </label>
                  <select
                    value={editFever}
                    onChange={(e) => setEditFever(e.target.value as FeverStatus)}
                    className="w-full px-2.5 py-1.5 text-xs tab-input rounded-md"
                  >
                    {FEVER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-[#090514]">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {stressFactors.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-mono text-slate-300/80">
                    report_factors (M:N)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {stressFactors.map((fac) => {
                      const active = editFactorIds.includes(fac.factor_id);
                      return (
                        <button
                          key={fac.factor_id}
                          type="button"
                          onClick={() =>
                            setEditFactorIds((prev) =>
                              prev.includes(fac.factor_id)
                                ? prev.filter((id) => id !== fac.factor_id)
                                : [...prev, fac.factor_id]
                            )
                          }
                          className={`px-2.5 py-1 text-xs rounded-md border ${
                            active
                              ? "tab-chip-active"
                              : "bg-[#090514] border-slate-700/60 text-slate-300/85"
                          }`}
                        >
                          {fac.factor_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-mono text-slate-300/80 mb-1">remarks</label>
                <textarea
                  rows={3}
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  className="w-full px-3 py-2 text-xs tab-input rounded-md"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="px-3.5 py-1.5 text-xs font-medium tab-outline-btn rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold tab-cta-btn rounded-md"
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
