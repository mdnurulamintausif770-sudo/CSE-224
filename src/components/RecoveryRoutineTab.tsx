import { useMemo, useState } from "react";
import {
  Bookmark,
  CheckCircle2,
  Circle,
  Clock,
  Pin,
  PinOff,
  Sparkles,
  Trash2,
} from "lucide-react";
import { STANDARD_WELLNESS_DISCLAIMER } from "../data/seedData";
import type {
  RoutineBlock,
  RoutineMode,
  SavedRoutine,
  StressReport,
  Student,
} from "../types";
import { safeFetchJson } from "../utils/safeFetch";

interface RecoveryRoutineTabProps {
  students: Student[];
  reports: StressReport[];
  savedRoutines: SavedRoutine[];
  selectedStudentId: string;
  onSelectStudentId: (id: string) => void;
  onSaveRoutine: (payload: {
    studentId: string;
    mode: RoutineMode;
    title: string;
    focus_summary: string;
    blocks: RoutineBlock[];
    disclaimer: string;
  }) => SavedRoutine;
  onTogglePinRoutine: (routineId: string) => void;
  onToggleRoutineBlock: (routineId: string, blockId: string) => void;
  onDeleteRoutine: (routineId: string) => void;
}

function buildBaselineRoutine(
  mode: RoutineMode,
  studentName: string,
  latestReport: StressReport | null
): {
  title: string;
  focus_summary: string;
  blocks: RoutineBlock[];
  disclaimer: string;
} {
  if (mode === "fever_recovery") {
    const tempNote = latestReport?.temperature_f
      ? `Latest logged temp ${latestReport.temperature_f.toFixed(1)}°F. `
      : "";
    return {
      title: `Fever & Illness Recovery Plan · ${studentName}`,
      focus_summary: `${tempNote}Prioritizes steady hydration, temperature checks, gentle nutrition, and uninterrupted rest.`,
      blocks: [
        {
          id: "blk-morn",
          timeWindow: "Morning (8:00 AM)",
          activity: "Temperature Check & Warm Hydration",
          detail: "Measure temperature calmly, sip warm water or oral fluids, and eat light breakfast.",
          category: "check",
          completed: false,
        },
        {
          id: "blk-mid",
          timeWindow: "Midday (12:00 PM)",
          activity: "Light Lunch & Screen-Free Rest",
          detail: "Choose easy-to-digest soup, rice, or fruit followed by 60–90 minutes of quiet rest.",
          category: "nutrition",
          completed: false,
        },
        {
          id: "blk-aft",
          timeWindow: "Afternoon (3:30 PM)",
          activity: "Hydration & Symptom Re-Check",
          detail: "Drink 1–2 glasses of water or ORS and note any change in fever, headache, or energy.",
          category: "hydration",
          completed: false,
        },
        {
          id: "blk-eve",
          timeWindow: "Evening (6:30 PM)",
          activity: "Comfortable Room & Light Reading",
          detail: "Keep the room cool and airy; avoid heavy homework or intense physical activity.",
          category: "rest",
          completed: false,
        },
        {
          id: "blk-night",
          timeWindow: "Night (9:30 PM)",
          activity: "Final Temp Log & Early Sleep",
          detail: "Log evening temperature in the tracker and aim for 8.5–9 hours of uninterrupted sleep.",
          category: "check",
          completed: false,
        },
      ],
      disclaimer: STANDARD_WELLNESS_DISCLAIMER,
    };
  }

  const stressNote =
    latestReport && latestReport.stress_level >= 7
      ? `Recent stress level ${latestReport.stress_level}/10 — includes extra decompression breaks. `
      : "";

  return {
    title: `Exam Stress & Study Balance Plan · ${studentName}`,
    focus_summary: `${stressNote}Balances focused 45-minute study intervals with hydration, movement, and sleep protection.`,
    blocks: [
      {
        id: "blk-morn",
        timeWindow: "Morning (7:30 AM)",
        activity: "Hydration, Sunlight & High-Focus Block",
        detail: "Drink 1 glass of water, eat protein-rich breakfast, then complete one 45-min top-priority topic.",
        category: "study",
        completed: false,
      },
      {
        id: "blk-mid",
        timeWindow: "Midday (12:30 PM)",
        activity: "Balanced Meal & Screen Reset",
        detail: "Eat lunch away from study screens and take a gentle 15-minute walk outdoors or indoors.",
        category: "nutrition",
        completed: false,
      },
      {
        id: "blk-aft",
        timeWindow: "Afternoon (3:30 PM)",
        activity: "Paced Revision (45/10 Method)",
        detail: "Run two 45-minute study blocks separated by 10-minute stretching and water breaks.",
        category: "study",
        completed: false,
      },
      {
        id: "blk-eve",
        timeWindow: "Evening (6:30 PM)",
        activity: "4-4-6 Breathing & Light Review",
        detail: "Practice slow breathing to drop cortisol, summarize flashcards lightly, and avoid cramming.",
        category: "rest",
        completed: false,
      },
      {
        id: "blk-night",
        timeWindow: "Night (10:00 PM)",
        activity: "Screens Off & Sleep Protection",
        detail: "Put devices away 30 minutes before bed to protect 7.5–8.5 hours of memory-restoring sleep.",
        category: "check",
        completed: false,
      },
    ],
    disclaimer: STANDARD_WELLNESS_DISCLAIMER,
  };
}

export function RecoveryRoutineTab({
  students,
  reports,
  savedRoutines,
  selectedStudentId,
  onSelectStudentId,
  onSaveRoutine,
  onTogglePinRoutine,
  onToggleRoutineBlock,
  onDeleteRoutine,
}: RecoveryRoutineTabProps) {
  const [mode, setMode] = useState<RoutineMode>("fever_recovery");
  const [activeDraft, setActiveDraft] = useState<{
    mode: RoutineMode;
    title: string;
    focus_summary: string;
    blocks: RoutineBlock[];
    disclaimer: string;
    source: "baseline" | "ai";
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const activeStudent = useMemo(
    () =>
      students.find((s) => s.student_id === selectedStudentId) ?? students[0] ?? null,
    [students, selectedStudentId]
  );

  const latestReportForStudent = useMemo(() => {
    if (!activeStudent) return null;
    const list = reports
      .filter((r) => r.student_id === activeStudent.student_id)
      .sort(
        (a, b) =>
          b.submission_date.localeCompare(a.submission_date) ||
          b.report_id.localeCompare(a.report_id)
      );
    return list[0] ?? null;
  }, [reports, activeStudent]);

  const currentSchedule = useMemo(() => {
    if (activeDraft && activeDraft.mode === mode) {
      return activeDraft;
    }
    const baseline = buildBaselineRoutine(
      mode,
      activeStudent?.full_name ?? "Student",
      latestReportForStudent
    );
    return { mode, ...baseline, source: "baseline" as const };
  }, [activeDraft, mode, activeStudent, latestReportForStudent]);

  function toggleDraftBlock(blockId: string) {
    const base = currentSchedule;
    setActiveDraft({
      ...base,
      blocks: base.blocks.map((b) =>
        b.id === blockId ? { ...b, completed: !b.completed } : b
      ),
    });
  }

  async function handleAiTailor() {
    if (isGenerating) return;
    setIsGenerating(true);
    setStatusNotice(null);

    const name = activeStudent?.full_name ?? "Student";

    try {
      const data = await safeFetchJson<{
        title: string;
        focusSummary: string;
        blocks: RoutineBlock[];
        disclaimer: string;
      }>("/api/routine/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: 12000,
        body: JSON.stringify({
          mode,
          studentName: name,
          latestContext: latestReportForStudent
            ? {
                sleep_hours: latestReportForStudent.sleep_hours,
                water_intake: latestReportForStudent.water_intake,
                stress_score: latestReportForStudent.stress_level,
                fever_status: latestReportForStudent.fever_status ?? "None",
                temperature_f: latestReportForStudent.temperature_f ?? null,
                symptoms: latestReportForStudent.symptoms ?? [],
                student_opinion: latestReportForStudent.remarks,
              }
            : null,
        }),
      });

      setActiveDraft({
        mode,
        title: data.title,
        focus_summary: data.focusSummary,
        blocks:
          Array.isArray(data.blocks) && data.blocks.length > 0
            ? data.blocks
            : buildBaselineRoutine(mode, name, latestReportForStudent).blocks,
        disclaimer: data.disclaimer || STANDARD_WELLNESS_DISCLAIMER,
        source: "ai",
      });
      setStatusNotice(
        latestReportForStudent
          ? `Tailored schedule using ${name}'s latest check-in (${latestReportForStudent.submission_date}).`
          : `Tailored ${mode === "fever_recovery" ? "Recovery" : "Study Balance"} schedule.`
      );
    } catch {
      const fallback = buildBaselineRoutine(mode, name, latestReportForStudent);
      setActiveDraft({ mode, ...fallback, source: "baseline" });
      setStatusNotice("Generated tailored schedule locally from latest profile metrics.");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleSaveCurrentRoutine() {
    if (!activeStudent) {
      setStatusNotice("Add or select a student profile in Survey & Entry or Students Directory first to pin routines.");
      return;
    }
    const saved = onSaveRoutine({
      studentId: activeStudent.student_id,
      mode: currentSchedule.mode,
      title: currentSchedule.title,
      focus_summary: currentSchedule.focus_summary,
      blocks: currentSchedule.blocks,
      disclaimer: currentSchedule.disclaimer,
    });
    setStatusNotice(`Saved and pinned routine ${saved.routine_id} for ${activeStudent.full_name}.`);
  }

  const orderedSavedRoutines = useMemo(() => {
    return [...savedRoutines].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.created_at.localeCompare(a.created_at) || b.routine_id.localeCompare(a.routine_id);
    });
  }, [savedRoutines]);

  const studentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) map.set(s.student_id, s.full_name);
    return map;
  }, [students]);

  return (
    <div className="space-y-6">
      {/* Mode & Student Context Header */}
      <section className="tab-surface-card rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-50">
              Wellness &amp; Recovery Routine Builder
            </h2>
            <p className="mt-0.5 text-xs text-slate-300/75">
              Build a daily rest, hydration, and light-activity schedule—and let AI tailor it from your latest logged check-in.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {students.length > 0 && (
              <select
                aria-label="Select student for routine"
                value={activeStudent?.student_id ?? ""}
                onChange={(e) => {
                  onSelectStudentId(e.target.value);
                  setActiveDraft(null);
                }}
                className="px-3 py-1.5 text-xs tab-input rounded-md"
              >
                {students.map((s) => (
                  <option key={s.student_id} value={s.student_id} className="bg-[#090514]">
                    {s.full_name} ({s.student_id})
                  </option>
                ))}
              </select>
            )}

            <div className="inline-flex items-center p-0.5 bg-[#090514] border tab-divider rounded-md">
              <button
                type="button"
                onClick={() => setMode("fever_recovery")}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  mode === "fever_recovery"
                    ? "tab-chip-active border"
                    : "text-slate-300/75 border border-transparent hover:text-slate-100"
                }`}
              >
                Fever / Illness Recovery
              </button>
              <button
                type="button"
                onClick={() => setMode("exam_balance")}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  mode === "exam_balance"
                    ? "tab-chip-active border"
                    : "text-slate-300/75 border border-transparent hover:text-slate-100"
                }`}
              >
                Exam Stress &amp; Study Balance
              </button>
            </div>
          </div>
        </div>

        {statusNotice && (
          <div
            role="status"
            className="px-4 py-2.5 bg-[#090514] border border-indigo-400/35 rounded-md text-xs text-indigo-200 flex items-center justify-between gap-2"
          >
            <span>{statusNotice}</span>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="text-slate-400 hover:text-slate-100"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="text-xs text-slate-300/75">
            {latestReportForStudent ? (
              <span>
                Latest check-in context ({latestReportForStudent.submission_date}):{" "}
                <span className="font-mono text-indigo-200">
                  Sleep {latestReportForStudent.sleep_hours}h · Water{" "}
                  {latestReportForStudent.water_intake}gl · Stress{" "}
                  {latestReportForStudent.stress_level}/10
                  {latestReportForStudent.fever_status &&
                  latestReportForStudent.fever_status !== "None"
                    ? ` · ${latestReportForStudent.fever_status} Fever`
                    : ""}
                </span>
              </span>
            ) : (
              <span>No prior check-in logged yet — using calm baseline schedule.</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isGenerating}
              onClick={() => void handleAiTailor()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md tab-cta-btn disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isGenerating ? "Tailoring..." : "AI Tailor Schedule"}</span>
            </button>

            <button
              type="button"
              onClick={handleSaveCurrentRoutine}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md tab-outline-btn"
            >
              <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Save &amp; Pin Routine</span>
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Active Schedule Timeline */}
        <section className="xl:col-span-7 tab-surface-card rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b tab-divider space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm sm:text-base font-semibold text-slate-50">
                {currentSchedule.title}
              </h3>
              <span className="px-2 py-0.5 text-[11px] font-mono bg-[#090514] border tab-divider rounded tab-accent-text">
                {currentSchedule.source === "ai" ? "AI-Tailored" : "Baseline Plan"}
              </span>
            </div>
            <p className="text-xs text-slate-300/75 leading-relaxed">
              {currentSchedule.focus_summary}
            </p>
          </div>

          <div className="p-5 space-y-3">
            {currentSchedule.blocks.map((block) => (
              <button
                key={block.id}
                type="button"
                onClick={() => toggleDraftBlock(block.id)}
                className={`w-full text-left flex items-start gap-3 p-3.5 rounded-md border transition-colors ${
                  block.completed
                    ? "bg-indigo-500/16 border-indigo-400/45 text-indigo-100"
                    : "bg-[#090514]/85 border-slate-800/85 hover:border-indigo-400/45"
                }`}
              >
                {block.completed ? (
                  <CheckCircle2 className="w-4 h-4 text-indigo-300 shrink-0 mt-0.5" aria-hidden="true" />
                ) : (
                  <Circle className="w-4 h-4 text-indigo-400/45 shrink-0 mt-0.5" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`text-sm font-semibold ${
                        block.completed ? "line-through opacity-80" : "text-slate-100"
                      }`}
                    >
                      {block.activity}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono tab-accent-text">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {block.timeWindow}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300/80 leading-relaxed">{block.detail}</p>
                </div>
              </button>
            ))}

            <p className="text-[11px] text-slate-300/60 pt-2">
              {currentSchedule.disclaimer}
            </p>
          </div>
        </section>

        {/* Pinned & Saved Routines */}
        <section className="xl:col-span-5 tab-surface-card rounded-lg overflow-hidden h-fit">
          <div className="px-5 py-4 border-b tab-divider flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-50">
              Saved &amp; Pinned Routines ({orderedSavedRoutines.length})
            </h3>
            <span className="text-xs text-slate-300/65">localStorage</span>
          </div>

          {orderedSavedRoutines.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <Pin className="w-5 h-5 tab-accent-text mx-auto opacity-75" aria-hidden="true" />
              <p className="text-xs font-medium text-slate-200">No saved routines yet</p>
              <p className="text-xs text-slate-300/65">
                Customize or AI-tailor a schedule on the left and click &ldquo;Save &amp; Pin Routine&rdquo; to keep it attached to a student profile.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {orderedSavedRoutines.map((rtn) => {
                const doneCount = rtn.blocks.filter((b) => b.completed).length;
                return (
                  <div key={rtn.routine_id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-slate-100">{rtn.title}</span>
                          {rtn.pinned && (
                            <span className="px-1.5 py-0.5 text-[10px] font-mono bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 rounded">
                              Pinned
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] font-mono text-slate-400">
                          {studentNameMap.get(rtn.student_id) ?? rtn.student_id} · {rtn.created_at} ·{" "}
                          {doneCount}/{rtn.blocks.length} steps
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={rtn.pinned ? "Unpin routine" : "Pin routine"}
                          onClick={() => onTogglePinRoutine(rtn.routine_id)}
                          className="p-1.5 text-slate-300/80 hover:text-indigo-200 rounded"
                        >
                          {rtn.pinned ? (
                            <PinOff className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete routine ${rtn.routine_id}`}
                          onClick={() => onDeleteRoutine(rtn.routine_id)}
                          className="p-1.5 text-slate-400 hover:text-rose-300 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {rtn.blocks.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => onToggleRoutineBlock(rtn.routine_id, b.id)}
                          className="w-full text-left flex items-center gap-2 text-xs text-slate-200/85 hover:text-slate-50"
                        >
                          {b.completed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-300 shrink-0" aria-hidden="true" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
                          )}
                          <span className={`truncate ${b.completed ? "line-through opacity-70" : ""}`}>
                            <span className="font-mono text-[11px] text-indigo-300/85 mr-1.5">
                              {b.timeWindow}:
                            </span>
                            {b.activity}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
