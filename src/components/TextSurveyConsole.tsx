import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  ExternalLink,
  Globe,
  MessageSquare,
  Mic,
  MicOff,
  Plus,
  RotateCcw,
  Send,
  Stethoscope,
  Tag,
  Thermometer,
} from "lucide-react";
import { STANDARD_WELLNESS_DISCLAIMER, SUGGESTED_FACTOR_TEMPLATES } from "../data/seedData";
import { DICTATION_LANGUAGES, useVoiceDictation } from "../hooks/useVoiceDictation";
import type {
  ActiveTab,
  Department,
  ExtractedSurveyMetrics,
  ReportFactor,
  StressFactor,
  StressReport,
  Student,
  SurveyFinalAnalysis,
  SurveyMessage,
} from "../types";
import { safeFetchJson } from "../utils/safeFetch";
import {
  SURVEY_DIMENSIONS,
  SYMPTOM_QUICK_PROMPTS,
  buildFallbackAnalysis,
  buildFallbackTurn,
  createInitialGreeting,
  formatCurrentTime,
  type PendingStudentProfile,
} from "../utils/surveyHelpers";

interface TextSurveyConsoleProps {
  viewMode: "entry" | "consultation";
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
  onCommitSurveyWithStudent: (payload: {
    studentProfile: PendingStudentProfile;
    reportInput: Omit<StressReport, "report_id" | "student_id"> & { factorIds?: string[] };
  }) => { ok: boolean; error?: string; student?: Student; report?: StressReport };
  onNavigateTab: (tab: ActiveTab) => void;
  preferNewStudentIntake?: boolean;
}

export function TextSurveyConsole({
  viewMode,
  departments,
  students,
  reports,
  stressFactors,
  reportFactors,
  selectedStudentId,
  onSelectStudentId,
  onAddFactor,
  onCommitSurveyWithStudent,
  onNavigateTab,
  preferNewStudentIntake = false,
}: TextSurveyConsoleProps) {
  const [intakeMode, setIntakeMode] = useState<"new" | "existing">(() =>
    students.length === 0 || preferNewStudentIntake ? "new" : "existing"
  );
  const [draftFullName, setDraftFullName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftSemester, setDraftSemester] = useState("Sem 1");
  const [draftDeptId, setDraftDeptId] = useState("");
  const [draftClassSection, setDraftClassSection] = useState("");
  const [draftRollNo, setDraftRollNo] = useState("");
  const [draftAge, setDraftAge] = useState("");
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [activeSubject, setActiveSubject] = useState<PendingStudentProfile | null>(null);

  const [selectedFactorIds, setSelectedFactorIds] = useState<string[]>([]);
  const [newFactorName, setNewFactorName] = useState("");
  const [factorNotice, setFactorNotice] = useState<string | null>(null);

  const [messages, setMessages] = useState<SurveyMessage[]>([]);
  const [coveredTopics, setCoveredTopics] = useState<string[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [extracted, setExtracted] = useState<ExtractedSurveyMetrics>({
    sleep_hours: null,
    water_intake: null,
    stress_score: null,
  });
  const [inputText, setInputText] = useState("");
  const [isLoadingTurn, setIsLoadingTurn] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isReadyToFinalize, setIsReadyToFinalize] = useState(false);
  const [apiNotice, setApiNotice] = useState<string | null>(null);

  const [finalAnalysis, setFinalAnalysis] = useState<SurveyFinalAnalysis | null>(null);
  const [editSleep, setEditSleep] = useState("7");
  const [editWater, setEditWater] = useState("6");
  const [editStress, setEditStress] = useState("5");
  const [editOpinion, setEditOpinion] = useState("");
  const [committedResult, setCommittedResult] = useState<{
    student: Student;
    report: StressReport;
    factorNames: string[];
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputTextRef = useRef(inputText);
  const isMountedRef = useRef(true);

  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (viewMode === "consultation") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoadingTurn, viewMode]);

  useEffect(() => {
    if (viewMode === "consultation" && !activeSubject && students.length > 0 && !preferNewStudentIntake) {
      const target = students.find((s) => s.student_id === selectedStudentId) ?? students[0];
      if (target) {
        const subject: PendingStudentProfile = {
          existingStudentId: target.student_id,
          full_name: target.full_name,
          email: target.email,
          semester: target.semester,
          dept_id: target.dept_id,
          class_section: target.class_section,
          roll_no: target.roll_no,
          age: target.age,
        };
        setActiveSubject(subject);
        const opening = createInitialGreeting(subject);
        setMessages([opening.message]);
        setQuickReplies(opening.quickReplies);
      }
    }
  }, [viewMode, activeSubject, students, selectedStudentId, preferNewStudentIntake]);

  const {
    dictationLang,
    setDictationLang,
    dictationStatus,
    dictationNotice,
    setDictationNotice,
    toggleDictation,
    stopDictation,
  } = useVoiceDictation({
    getText: () => inputTextRef.current,
    setText: setInputText,
  });

  const factorMap = useMemo(() => {
    const map = new Map<string, StressFactor>();
    for (const f of stressFactors) map.set(f.factor_id, f);
    return map;
  }, [stressFactors]);

  const selectedFactorNames = useMemo(
    () =>
      selectedFactorIds
        .map((id) => factorMap.get(id)?.factor_name)
        .filter((n): n is string => Boolean(n)),
    [selectedFactorIds, factorMap]
  );

  const recentReportsContext = useMemo(() => {
    const targetId = activeSubject?.existingStudentId;
    if (!targetId) return "";
    const recent = reports
      .filter((r) => r.student_id === targetId)
      .sort((a, b) => b.submission_date.localeCompare(a.submission_date))
      .slice(0, 5);
    if (recent.length === 0) return "";
    return recent
      .map((r) => {
        const fNames = reportFactors
          .filter((rf) => rf.report_id === r.report_id)
          .map((rf) => factorMap.get(rf.factor_id)?.factor_name)
          .filter(Boolean)
          .join(", ");
        return `- ${r.submission_date} (${r.report_id}): stress=${r.stress_level}/10, sleep=${r.sleep_hours}h, water=${r.water_intake}gl${
          fNames ? `, factors=[${fNames}]` : ""
        }${r.remarks ? `, remarks="${r.remarks.slice(0, 120)}"` : ""}`;
      })
      .join("\n");
  }, [activeSubject?.existingStudentId, reports, reportFactors, factorMap]);

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
      description: `${clean} reported during health check-in.`,
    });
    if (!res.ok) {
      setFactorNotice(res.error ?? "Unable to create stress factor.");
      return;
    }
    if (res.factor) {
      setSelectedFactorIds((prev) =>
        prev.includes(res.factor!.factor_id) ? prev : [...prev, res.factor!.factor_id]
      );
    }
    setNewFactorName("");
    setFactorNotice(null);
  }

  function handleLoadSuggestedFactors() {
    let added = 0;
    for (const tpl of SUGGESTED_FACTOR_TEMPLATES) {
      const exists = stressFactors.some(
        (f) => f.factor_name.toLowerCase() === tpl.factor_name.toLowerCase()
      );
      if (!exists) {
        const res = onAddFactor(tpl);
        if (res.ok) added += 1;
      }
    }
    setFactorNotice(
      added > 0
        ? `Added ${added} standard stress factor(s) to stress_factors.`
        : "Standard stress factors already exist."
    );
  }

  function resolveIntakeSubject(): PendingStudentProfile | null {
    setIntakeError(null);
    if (intakeMode === "existing" && students.length > 0) {
      const existing = students.find((s) => s.student_id === selectedStudentId) ?? students[0];
      if (!existing) {
        setIntakeError("Select a student profile first.");
        return null;
      }
      return {
        existingStudentId: existing.student_id,
        full_name: existing.full_name,
        email: existing.email,
        semester: existing.semester,
        dept_id: existing.dept_id,
        class_section: existing.class_section,
        roll_no: existing.roll_no,
        age: existing.age,
      };
    }

    const cleanName = draftFullName.trim();
    const cleanEmail = draftEmail.trim();
    const cleanSemester = draftSemester.trim() || "Sem 1";
    const cleanSection = draftClassSection.trim().toUpperCase();
    const cleanRoll = draftRollNo.trim();
    const parsedAge = Number(draftAge);

    if (!cleanName) {
      setIntakeError("Please enter the student's full name.");
      return null;
    }
    if (!cleanSection) {
      setIntakeError("Please enter the class / section (e.g., CS-3A).");
      return null;
    }
    if (!cleanRoll) {
      setIntakeError("Please enter the student's roll number.");
      return null;
    }
    if (!Number.isInteger(parsedAge) || parsedAge < 12 || parsedAge > 45) {
      setIntakeError("Please enter a valid age between 12 and 45.");
      return null;
    }

    const duplicate = students.some(
      (s) =>
        s.class_section.toLowerCase() === cleanSection.toLowerCase() &&
        s.roll_no.toLowerCase() === cleanRoll.toLowerCase()
    );
    if (duplicate) {
      setIntakeError(
        `Roll number ${cleanRoll} already exists in section ${cleanSection}. Switch to Existing Student or use a unique roll number.`
      );
      return null;
    }

    return {
      full_name: cleanName,
      email: cleanEmail,
      semester: cleanSemester,
      dept_id: draftDeptId || null,
      class_section: cleanSection,
      roll_no: cleanRoll,
      age: parsedAge,
    };
  }

  function resetSession() {
    stopDictation(false);
    setActiveSubject(null);
    setMessages([]);
    setCoveredTopics([]);
    setQuickReplies([]);
    setExtracted({ sleep_hours: null, water_intake: null, stress_score: null });
    setInputText("");
    setDictationNotice(null);
    setIsLoadingTurn(false);
    setIsFinalizing(false);
    setIsReadyToFinalize(false);
    setApiNotice(null);
    setFinalAnalysis(null);
    setCommittedResult(null);
  }

  function startAdaptiveSurvey(switchToConsultationTab = true) {
    const subject = resolveIntakeSubject();
    if (!subject) return;

    setActiveSubject(subject);
    setCommittedResult(null);
    setFinalAnalysis(null);
    setApiNotice(null);
    setIsReadyToFinalize(false);
    setCoveredTopics([]);
    setExtracted({ sleep_hours: null, water_intake: null, stress_score: null });

    const opening = createInitialGreeting(subject);
    setMessages([opening.message]);
    setQuickReplies(opening.quickReplies);

    if (switchToConsultationTab) {
      onNavigateTab("consultation");
    }
  }

  function openManualEntry() {
    const subject = resolveIntakeSubject();
    if (!subject) return;

    setActiveSubject(subject);
    setCommittedResult(null);
    setApiNotice(null);
    const manual: SurveyFinalAnalysis = {
      sleep_hours: 7.0,
      water_intake: 6,
      stress_score: 4,
      wellness_index: 78,
      student_opinion: "",
      ai_assessment: `Manual health & stress check-in recorded for ${subject.full_name}${
        selectedFactorNames.length > 0
          ? ` (Factors: ${selectedFactorNames.join(", ")})`
          : ""
      }.`,
      actionable_tips: [
        "Maintain consistent sleep hours across the academic week.",
        "Stay hydrated with regular water intake during lectures and study sessions.",
        "Use paced 45/10 study intervals and seek counselor support if stress remains high.",
      ],
      disclaimer: STANDARD_WELLNESS_DISCLAIMER,
    };
    setFinalAnalysis(manual);
    setEditSleep(String(manual.sleep_hours));
    setEditWater(String(manual.water_intake));
    setEditStress(String(manual.stress_score));
    setEditOpinion("");
  }

  async function submitTextReply(replyText: string) {
    const trimmed = replyText.trim();
    if (!trimmed || !activeSubject || isLoadingTurn) return;

    if (dictationStatus === "listening_speech" || dictationStatus === "listening_mic") {
      stopDictation(false);
    }

    const studentMsg: SurveyMessage = {
      id: `msg-${Date.now()}-s`,
      role: "student",
      text: trimmed,
      timestamp: formatCurrentTime(),
    };
    const nextHistory = [...messages, studentMsg];
    setMessages(nextHistory);
    setInputText("");
    setQuickReplies([]);
    setApiNotice(null);
    setDictationNotice(null);
    setIsLoadingTurn(true);

    try {
      const data = await safeFetchJson<{
        assistantMessage: string;
        suggestedQuickReplies?: string[];
        coveredTopics?: string[];
        extractedMetrics?: Partial<ExtractedSurveyMetrics>;
        isComplete?: boolean;
      }>("/api/survey/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: 12000,
        body: JSON.stringify({
          studentProfile: {
            student_id: activeSubject.existingStudentId ?? "NEW-STUDENT",
            full_name: activeSubject.full_name,
            class_section: activeSubject.class_section,
            semester: activeSubject.semester ?? "Sem 1",
            age: activeSubject.age,
          },
          conversationHistory: nextHistory.map((m) => ({ role: m.role, text: m.text })),
          coveredTopics,
          selectedFactors: selectedFactorNames,
          recentReportsContext,
        }),
      });

      if (!isMountedRef.current) return;

      const nextExtracted: ExtractedSurveyMetrics = {
        sleep_hours:
          typeof data.extractedMetrics?.sleep_hours === "number"
            ? data.extractedMetrics.sleep_hours
            : extracted.sleep_hours,
        water_intake:
          typeof data.extractedMetrics?.water_intake === "number"
            ? data.extractedMetrics.water_intake
            : extracted.water_intake,
        stress_score:
          typeof data.extractedMetrics?.stress_score === "number"
            ? data.extractedMetrics.stress_score
            : extracted.stress_score,
      };
      setExtracted(nextExtracted);

      if (Array.isArray(data.coveredTopics)) {
        setCoveredTopics(data.coveredTopics);
      }

      const assistantMsg: SurveyMessage = {
        id: `msg-${Date.now()}-a`,
        role: "assistant",
        text: data.assistantMessage,
        timestamp: formatCurrentTime(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setQuickReplies(Array.isArray(data.suggestedQuickReplies) ? data.suggestedQuickReplies : []);
      if (data.isComplete) {
        setIsReadyToFinalize(true);
      }
    } catch {
      if (!isMountedRef.current) return;
      const fallback = buildFallbackTurn(trimmed, coveredTopics, extracted);
      setExtracted(fallback.extractedMetrics);
      setCoveredTopics(fallback.coveredTopics);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-a`,
          role: "assistant",
          text: fallback.assistantMessage,
          timestamp: formatCurrentTime(),
        },
      ]);
      setQuickReplies(fallback.suggestedQuickReplies);
      if (fallback.isComplete) {
        setIsReadyToFinalize(true);
      }
      setApiNotice(
        "Live AI connection was unavailable, so the consultation continued locally. You can still compile and save your record."
      );
    } finally {
      if (isMountedRef.current) {
        setIsLoadingTurn(false);
      }
    }
  }

  async function finalizeSurvey() {
    if (!activeSubject || isFinalizing) return;

    setIsFinalizing(true);
    setApiNotice(null);

    try {
      const data = await safeFetchJson<SurveyFinalAnalysis>("/api/survey/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: 14000,
        body: JSON.stringify({
          studentProfile: {
            student_id: activeSubject.existingStudentId ?? "NEW-STUDENT",
            full_name: activeSubject.full_name,
            class_section: activeSubject.class_section,
            semester: activeSubject.semester ?? "Sem 1",
            age: activeSubject.age,
          },
          conversationHistory: messages.map((m) => ({ role: m.role, text: m.text })),
          selectedFactors: selectedFactorNames,
          recentReportsContext,
          extractedMetrics: extracted,
        }),
      });

      if (!isMountedRef.current) return;

      setFinalAnalysis(data);
      setEditSleep(String(data.sleep_hours));
      setEditWater(String(data.water_intake));
      setEditStress(String(data.stress_score));
      setEditOpinion(data.student_opinion);
    } catch {
      if (!isMountedRef.current) return;
      const fallback = buildFallbackAnalysis(activeSubject, messages, extracted);
      setFinalAnalysis(fallback);
      setEditSleep(String(fallback.sleep_hours));
      setEditWater(String(fallback.water_intake));
      setEditStress(String(fallback.stress_score));
      setEditOpinion(fallback.student_opinion);
      setApiNotice(
        "Compiled wellness summary from your responses locally. Review and edit fields below before saving."
      );
    } finally {
      if (isMountedRef.current) {
        setIsFinalizing(false);
      }
    }
  }

  function handleSaveToDatabase(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSubject || !finalAnalysis) return;

    const sleepNum = Math.min(18, Math.max(0, Number(editSleep) || finalAnalysis.sleep_hours));
    const waterNum = Math.min(30, Math.max(0, Math.round(Number(editWater) || finalAnalysis.water_intake)));
    const stressNum = Math.min(10, Math.max(1, Math.round(Number(editStress) || finalAnalysis.stress_score)));

    const commit = onCommitSurveyWithStudent({
      studentProfile: activeSubject,
      reportInput: {
        submission_date: new Date().toISOString().slice(0, 10),
        sleep_hours: Math.round(sleepNum * 10) / 10,
        water_intake: waterNum,
        stress_level: stressNum,
        wellness_index: finalAnalysis.wellness_index,
        remarks:
          editOpinion.trim() || finalAnalysis.student_opinion || "No additional remarks provided.",
        ai_assessment: finalAnalysis.ai_assessment,
        actionable_tips: finalAnalysis.actionable_tips,
        disclaimer: finalAnalysis.disclaimer ?? STANDARD_WELLNESS_DISCLAIMER,
        entry_source: "survey",
        factorIds: selectedFactorIds,
      },
    });

    if (!commit.ok || !commit.student || !commit.report) {
      setApiNotice(commit.error ?? "Unable to save stress report.");
      return;
    }

    setCommittedResult({
      student: commit.student,
      report: commit.report,
      factorNames: selectedFactorNames,
    });
  }

  const studentTurnsCount = messages.filter((m) => m.role === "student").length;

  const factorSelectorBlock = (
    <div className="p-4 bg-[#090514]/85 border tab-divider rounded-md space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
          <Tag className="w-3.5 h-3.5 tab-accent-text" aria-hidden="true" />
          <span>Contributing Stress Factors (report_factors M:N)</span>
        </div>
        {stressFactors.length === 0 && (
          <button
            type="button"
            onClick={handleLoadSuggestedFactors}
            className="px-2.5 py-1 text-[11px] font-medium tab-outline-btn rounded"
          >
            Load Standard 5 Factors
          </button>
        )}
      </div>

      {factorNotice && <p className="text-[11px] tab-accent-text">{factorNotice}</p>}

      {stressFactors.length > 0 ? (
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
                    : "bg-[#120926] border-slate-700/60 text-slate-300/85 hover:border-violet-400/45"
                }`}
              >
                {fac.factor_name}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-slate-300/65">
          No stress factors created yet. Add one below or load standard factors (Exams, Workload, Lack of Sleep, Financial Strain, Personal Issues).
        </p>
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
          placeholder="Add new factor (e.g., Exams, Workload)..."
          className="flex-1 px-2.5 py-1.5 text-xs tab-input rounded-md placeholder:text-slate-400/45"
        />
        <button
          type="button"
          onClick={handleQuickCreateFactor}
          disabled={!newFactorName.trim()}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium tab-outline-btn rounded-md disabled:opacity-45"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Add</span>
        </button>
      </div>
    </div>
  );

  // Committed Confirmation Card
  if (committedResult) {
    return (
      <section className="tab-surface-card rounded-lg p-6 space-y-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold text-slate-50">
              Stress Report Committed ({committedResult.report.report_id})
            </h2>
            <p className="mt-1 text-sm text-slate-300/80">
              Saved student profile <span className="font-mono tab-accent-text">{committedResult.student.student_id}</span> ({committedResult.student.full_name}) and linked record in <span className="font-mono">stress_reports</span>.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-[#090514] border tab-divider rounded-md">
            <div className="text-xs text-slate-300/70 font-mono">sleep_hours</div>
            <div className="mt-1 text-sm font-mono font-semibold text-slate-50 tabular-nums">
              {committedResult.report.sleep_hours.toFixed(1)} hrs
            </div>
          </div>
          <div className="p-3 bg-[#090514] border tab-divider rounded-md">
            <div className="text-xs text-slate-300/70 font-mono">water_intake</div>
            <div className="mt-1 text-sm font-mono font-semibold text-slate-50 tabular-nums">
              {committedResult.report.water_intake} glasses
            </div>
          </div>
          <div className="p-3 bg-[#090514] border tab-divider rounded-md">
            <div className="text-xs text-slate-300/70 font-mono">stress_level</div>
            <div className="mt-1 text-sm font-mono font-semibold text-slate-50 tabular-nums">
              {committedResult.report.stress_level} / 10
            </div>
          </div>
          <div className="p-3 bg-[#090514] border tab-divider rounded-md">
            <div className="text-xs text-slate-300/70 font-mono">wellness_index</div>
            <div className="mt-1 text-sm font-mono font-semibold tab-accent-text tabular-nums">
              {committedResult.report.wellness_index} / 100
            </div>
          </div>
        </div>

        {committedResult.factorNames.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-300/75 font-mono">report_factors:</span>
            {committedResult.factorNames.map((name) => (
              <span key={name} className="px-2 py-0.5 tab-chip-active border rounded text-xs">
                {name}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigateTab("telemetry")}
            className="px-4 py-2 text-sm font-semibold rounded-md tab-cta-btn"
          >
            View Stress Reports
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab("analytics")}
            className="px-4 py-2 text-sm font-medium rounded-md tab-outline-btn"
          >
            Analytics &amp; Alerts
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab("routine")}
            className="px-4 py-2 text-sm font-medium rounded-md tab-outline-btn"
          >
            Build Recovery Routine
          </button>
          <button
            type="button"
            onClick={resetSession}
            className="px-4 py-2 text-sm font-medium rounded-md tab-outline-btn"
          >
            Start Another Survey
          </button>
        </div>
      </section>
    );
  }

  // Review / Manual Save Form
  if (finalAnalysis && activeSubject) {
    return (
      <section className="tab-surface-card rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b tab-divider flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-50">
              Review &amp; Commit Stress Report · {activeSubject.full_name}
            </h2>
            <p className="mt-0.5 text-xs text-slate-300/70">
              Verify metrics, stress factors, and remarks before writing to stress_reports.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFinalAnalysis(null)}
            className="px-3 py-1.5 text-xs font-medium tab-outline-btn rounded-md"
          >
            Back to {viewMode === "entry" ? "Entry" : "Doctor Chat"}
          </button>
        </div>

        <form onSubmit={handleSaveToDatabase} className="p-6 space-y-5">
          {apiNotice && (
            <div className="px-4 py-2.5 bg-[#090514] border tab-divider rounded-md text-xs tab-accent-text">
              {apiNotice}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label htmlFor="rev-sleep" className="block text-xs font-mono text-slate-300/80 mb-1">
                sleep_hours
              </label>
              <input
                id="rev-sleep"
                type="number"
                step="0.5"
                min="0"
                max="18"
                value={editSleep}
                onChange={(e) => setEditSleep(e.target.value)}
                className="w-full px-3 py-2 text-sm tab-input rounded-md tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="rev-water" className="block text-xs font-mono text-slate-300/80 mb-1">
                water_intake (glasses)
              </label>
              <input
                id="rev-water"
                type="number"
                min="0"
                max="30"
                value={editWater}
                onChange={(e) => setEditWater(e.target.value)}
                className="w-full px-3 py-2 text-sm tab-input rounded-md tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="rev-stress" className="block text-xs font-mono text-slate-300/80 mb-1">
                stress_level (1-10)
              </label>
              <input
                id="rev-stress"
                type="number"
                min="1"
                max="10"
                value={editStress}
                onChange={(e) => setEditStress(e.target.value)}
                className="w-full px-3 py-2 text-sm tab-input rounded-md tabular-nums"
              />
            </div>

            <div className="p-3 bg-[#090514] border tab-divider rounded-md">
              <div className="text-xs font-mono text-slate-300/75">wellness_index</div>
              <div className="mt-1 text-lg font-mono font-semibold tab-accent-text tabular-nums">
                {finalAnalysis.wellness_index} / 100
              </div>
            </div>
          </div>

          {factorSelectorBlock}

          <div>
            <label htmlFor="rev-opinion" className="block text-xs font-mono text-slate-300/80 mb-1">
              remarks (Symptoms, Stress Context &amp; Feedback)
            </label>
            <textarea
              id="rev-opinion"
              rows={3}
              value={editOpinion}
              onChange={(e) => setEditOpinion(e.target.value)}
              placeholder="Reported symptoms, duration/temperature notes, study load, or wellness feedback..."
              className="w-full px-3 py-2 text-sm tab-input rounded-md placeholder:text-slate-400/45"
            />
          </div>

          <div className="p-4 bg-[#090514] border tab-divider rounded-md space-y-2">
            <div className="text-xs font-mono tab-accent-text">ai_assessment</div>
            <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-line">
              {finalAnalysis.ai_assessment}
            </p>
            {finalAnalysis.actionable_tips.length > 0 && (
              <ul className="pt-2 space-y-1 text-xs text-slate-300/85 list-disc pl-5">
                {finalAnalysis.actionable_tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-4 py-3 bg-[#090514] border tab-divider rounded-md text-xs text-slate-300/75">
            {finalAnalysis.disclaimer}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={resetSession}
              className="px-4 py-2 text-sm font-medium tab-outline-btn rounded-md"
            >
              Discard
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold rounded-md tab-cta-btn"
            >
              Save to stress_reports
            </button>
          </div>
        </form>
      </section>
    );
  }

  // Step 1: Student Details & Survey Intake
  if (viewMode === "entry" || !activeSubject) {
    return (
      <div className="space-y-5">
        {viewMode === "entry" && activeSubject && (
          <div className="tab-surface-card rounded-lg px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs sm:text-sm text-slate-200">
              Active session for{" "}
              <span className="font-semibold tab-accent-text">
                {activeSubject.full_name} ({activeSubject.class_section})
              </span>
              {messages.length > 0 ? ` · ${messages.length} chat messages` : ""}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigateTab("consultation")}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-md tab-cta-btn"
              >
                Resume Doctor Chat
              </button>
              <button
                type="button"
                onClick={resetSession}
                className="px-3 py-1.5 text-xs font-medium rounded-md tab-outline-btn"
              >
                Switch Student
              </button>
            </div>
          </div>
        )}

        <section className="tab-surface-card rounded-lg overflow-hidden">
          <div className="px-6 py-5 border-b tab-divider flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-50">
                {viewMode === "consultation"
                  ? "Quick Student Setup for Doctor Chat"
                  : "Student Details & Health Survey Entry"}
              </h2>
              <p className="mt-1 text-xs text-slate-300/75">
                Enter student details and optional stress factors to launch a multilingual Doctor Consultation, Daily Fever Check-In, or Manual Entry.
              </p>
            </div>

            {students.length > 0 && (
              <div className="inline-flex items-center p-0.5 bg-[#090514] border tab-divider rounded-md shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIntakeMode("new");
                    setIntakeError(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    intakeMode === "new"
                      ? "tab-chip-active border"
                      : "text-slate-300/70 border border-transparent hover:text-slate-100"
                  }`}
                >
                  New Student
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIntakeMode("existing");
                    setIntakeError(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    intakeMode === "existing"
                      ? "tab-chip-active border"
                      : "text-slate-300/70 border border-transparent hover:text-slate-100"
                  }`}
                >
                  Existing ({students.length})
                </button>
              </div>
            )}
          </div>

          <div className="p-6 space-y-5">
            {intakeError && (
              <div
                role="alert"
                className="px-4 py-2.5 bg-rose-500/10 border border-rose-500/30 rounded-md text-xs text-rose-300 flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{intakeError}</span>
              </div>
            )}

            {intakeMode === "existing" && students.length > 0 ? (
              <div className="max-w-md space-y-2">
                <label htmlFor="existing-stu" className="block text-xs font-medium text-slate-200/85">
                  Select Registered Student
                </label>
                <select
                  id="existing-stu"
                  value={selectedStudentId || students[0]?.student_id || ""}
                  onChange={(e) => onSelectStudentId(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm tab-input rounded-md"
                >
                  {students.map((s) => (
                    <option key={s.student_id} value={s.student_id} className="bg-[#090514]">
                      {s.student_id} — {s.full_name} ({s.class_section}, {s.semester})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label htmlFor="intake-name" className="block text-xs font-medium text-slate-200/85 mb-1.5">
                    Full Name
                  </label>
                  <input
                    id="intake-name"
                    type="text"
                    value={draftFullName}
                    onChange={(e) => setDraftFullName(e.target.value)}
                    placeholder="Enter full name"
                    className="w-full px-3 py-2 text-sm tab-input rounded-md placeholder:text-slate-400/45"
                  />
                </div>
                <div>
                  <label htmlFor="intake-email" className="block text-xs font-medium text-slate-200/85 mb-1.5">
                    Email (optional)
                  </label>
                  <input
                    id="intake-email"
                    type="email"
                    value={draftEmail}
                    onChange={(e) => setDraftEmail(e.target.value)}
                    placeholder="student@campus.edu"
                    className="w-full px-3 py-2 text-sm tab-input rounded-md placeholder:text-slate-400/45"
                  />
                </div>
                <div>
                  <label htmlFor="intake-section" className="block text-xs font-medium text-slate-200/85 mb-1.5">
                    Class / Section
                  </label>
                  <input
                    id="intake-section"
                    type="text"
                    value={draftClassSection}
                    onChange={(e) => setDraftClassSection(e.target.value)}
                    placeholder="e.g. CS-3A"
                    className="w-full px-3 py-2 text-sm tab-input rounded-md placeholder:text-slate-400/45"
                  />
                </div>
                <div>
                  <label htmlFor="intake-roll" className="block text-xs font-medium text-slate-200/85 mb-1.5">
                    Roll Number
                  </label>
                  <input
                    id="intake-roll"
                    type="text"
                    value={draftRollNo}
                    onChange={(e) => setDraftRollNo(e.target.value)}
                    placeholder="e.g. 2026-042"
                    className="w-full px-3 py-2 text-sm tab-input rounded-md placeholder:text-slate-400/45"
                  />
                </div>
                <div>
                  <label htmlFor="intake-semester" className="block text-xs font-medium text-slate-200/85 mb-1.5">
                    Semester
                  </label>
                  <input
                    id="intake-semester"
                    type="text"
                    value={draftSemester}
                    onChange={(e) => setDraftSemester(e.target.value)}
                    placeholder="e.g. Sem 3"
                    className="w-full px-3 py-2 text-sm tab-input rounded-md placeholder:text-slate-400/45"
                  />
                </div>
                <div>
                  <label htmlFor="intake-dept" className="block text-xs font-medium text-slate-200/85 mb-1.5">
                    Department (FK)
                  </label>
                  <select
                    id="intake-dept"
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
                  <label htmlFor="intake-age" className="block text-xs font-medium text-slate-200/85 mb-1.5">
                    Age
                  </label>
                  <input
                    id="intake-age"
                    type="number"
                    min={12}
                    max={45}
                    value={draftAge}
                    onChange={(e) => setDraftAge(e.target.value)}
                    placeholder="e.g. 19"
                    className="w-full px-3 py-2 text-sm tab-input rounded-md placeholder:text-slate-400/45 tabular-nums"
                  />
                </div>
              </div>
            )}

            {factorSelectorBlock}

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => startAdaptiveSurvey(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-md tab-cta-btn"
              >
                <MessageSquare className="w-4 h-4" aria-hidden="true" />
                <span>Start Doctor Consultation</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab("tracker")}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md tab-outline-btn"
              >
                <Thermometer className="w-4 h-4 tab-accent-text" aria-hidden="true" />
                <span>Log Fever Check-In</span>
              </button>

              <button
                type="button"
                onClick={openManualEntry}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md tab-outline-btn"
              >
                <span>Manual Survey Entry</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // Step 2: Doctor Consultation Chat (Cyan Tab)
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <section className="xl:col-span-2 tab-surface-card rounded-lg flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b tab-divider flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full tab-accent-dot shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-50 truncate">
                {activeSubject.full_name} · {activeSubject.class_section} (Roll {activeSubject.roll_no})
              </div>
              <div className="text-xs text-slate-300/70">
                Doctor-Style Health Advisor · Multilingual Text &amp; Dictation
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              resetSession();
              onNavigateTab("survey");
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium tab-outline-btn rounded-md"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Change Student</span>
          </button>
        </div>

        {/* Symptom & Care Quick-Prompts Bar */}
        <div className="px-5 py-2.5 border-b tab-divider bg-[#0D071D]/85 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium tab-accent-text mr-1">
            <Stethoscope className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Care Guides:</span>
          </span>
          {SYMPTOM_QUICK_PROMPTS.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={isLoadingTurn}
              onClick={() => void submitTextReply(item.prompt)}
              className="px-2.5 py-1 text-[11px] font-medium text-slate-100 bg-[#190F35]/90 border tab-divider hover:border-sky-300/65 hover:bg-sky-500/15 disabled:opacity-50 rounded-md transition-colors"
            >
              {item.label}
            </button>
          ))}
        </div>

        {apiNotice && (
          <div className="mx-5 mt-4 px-4 py-2.5 bg-[#090514] border tab-divider rounded-md text-xs tab-accent-text">
            {apiNotice}
          </div>
        )}

        <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[440px]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === "student" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                  msg.role === "assistant"
                    ? "bg-[#190F35]/95 border tab-divider text-slate-50"
                    : "tab-chip-active border text-slate-50"
                }`}
              >
                {msg.text}
              </div>
              <span className="mt-1 text-[11px] text-slate-300/55 font-mono">
                {msg.role === "assistant" ? "Health AI Advisor" : activeSubject.full_name} · {msg.timestamp}
              </span>
            </div>
          ))}

          {isLoadingTurn && (
            <div className="flex items-start">
              <div className="bg-[#190F35] border tab-divider rounded-lg px-4 py-2.5 text-xs tab-accent-text">
                Reviewing your health notes...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {quickReplies.length > 0 && !isLoadingTurn && (
          <div className="px-5 pb-3 flex flex-wrap gap-2">
            {quickReplies.map((qr) => (
              <button
                key={qr}
                type="button"
                onClick={() => {
                  const lower = qr.toLowerCase();
                  if (
                    lower.includes("generate wellness assessment") ||
                    lower.includes("save fever notes") ||
                    lower.includes("save symptom summary") ||
                    lower.includes("save health record") ||
                    lower.includes("save wellness summary")
                  ) {
                    void finalizeSurvey();
                  } else {
                    void submitTextReply(qr);
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium tab-outline-btn rounded-md"
              >
                {qr}
              </button>
            ))}
          </div>
        )}

        <div className="px-5 py-4 border-t tab-divider bg-[#0D071D] space-y-3">
          {dictationNotice && (
            <div
              role="status"
              className="px-3.5 py-2.5 bg-[#090514] border border-amber-400/35 rounded-md text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2"
            >
              <span>{dictationNotice.message}</span>
              <div className="flex items-center gap-2">
                {dictationNotice.showOpenInNewTab && (
                  <button
                    type="button"
                    onClick={() =>
                      window.open(window.location.href, "_blank", "noopener,noreferrer")
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-950 bg-sky-300 hover:bg-sky-200 rounded transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    <span>Open in New Tab</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDictationNotice(null)}
                  className="text-[11px] text-amber-200/75 hover:text-amber-100 underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Voice-to-Text Dictation Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={dictationStatus === "transcribing" || isLoadingTurn}
                onClick={toggleDictation}
                aria-pressed={dictationStatus === "listening_speech" || dictationStatus === "listening_mic"}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  dictationStatus === "listening_speech" || dictationStatus === "listening_mic"
                    ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/55"
                    : "tab-outline-btn"
                } disabled:opacity-50`}
              >
                {dictationStatus === "listening_speech" || dictationStatus === "listening_mic" ? (
                  <>
                    <MicOff className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
                    <span>
                      {dictationStatus === "listening_mic"
                        ? "Stop & Transcribe"
                        : "Stop Dictation"}
                    </span>
                  </>
                ) : dictationStatus === "transcribing" ? (
                  <>
                    <Mic className="w-3.5 h-3.5 animate-pulse tab-accent-text" aria-hidden="true" />
                    <span>Transcribing...</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5 tab-accent-text" aria-hidden="true" />
                    <span>Voice Typing</span>
                  </>
                )}
              </button>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#090514] border tab-divider rounded-md">
                <Globe className="w-3.5 h-3.5 tab-accent-text" aria-hidden="true" />
                <select
                  aria-label="Dictation language"
                  value={dictationLang}
                  onChange={(e) => setDictationLang(e.target.value)}
                  disabled={dictationStatus !== "idle"}
                  className="bg-transparent text-xs text-slate-100 focus:outline-none disabled:opacity-60"
                >
                  {DICTATION_LANGUAGES.map((lang) => (
                    <option key={lang.id} value={lang.id} className="bg-[#090514] text-slate-50">
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <span className="text-[11px] text-slate-300/65">
              Speak or type in any language — replies appear as text
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <textarea
              rows={2}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submitTextReply(inputText);
                }
              }}
              placeholder="Type or dictate your response in any language..."
              className="flex-1 px-3 py-2 text-sm tab-input rounded-md placeholder:text-slate-400/45 resize-none"
            />
            <button
              type="button"
              disabled={!inputText.trim() || isLoadingTurn || dictationStatus === "transcribing"}
              onClick={() => void submitTextReply(inputText)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-md tab-cta-btn disabled:opacity-45 shrink-0"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span>Send</span>
            </button>
          </div>

          {(studentTurnsCount >= 1 || isReadyToFinalize) && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs text-slate-300/75">
                {isReadyToFinalize
                  ? "Symptom notes & wellness guidance ready to save."
                  : "Continue chatting or compile & save your record anytime."}
              </span>
              <button
                type="button"
                disabled={isFinalizing}
                onClick={() => void finalizeSurvey()}
                className="px-4 py-2 text-xs font-semibold rounded-md tab-cta-btn disabled:opacity-50 whitespace-nowrap"
              >
                {isFinalizing ? "Compiling..." : "Compile & Save Summary"}
              </button>
            </div>
          )}

          <p className="text-[11px] text-slate-300/60 leading-snug pt-0.5">
            General health awareness only — does not replace an in-person licensed doctor, parent/guardian guidance, or urgent medical care.
          </p>
        </div>
      </section>

      <aside className="tab-surface-card rounded-lg p-5 space-y-5 h-fit">
        <div>
          <h3 className="text-sm font-semibold text-slate-50">Survey Coverage</h3>
          <p className="mt-0.5 text-xs text-slate-300/70">
            Dimensions evaluated across your check-in
          </p>
        </div>

        <ul className="space-y-2.5 text-xs">
          {SURVEY_DIMENSIONS.map((dim) => {
            const done = coveredTopics.includes(dim.key);
            return (
              <li key={dim.key} className="flex items-center gap-2.5">
                {done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                ) : (
                  <Circle className="w-4 h-4 tab-accent-text opacity-45 shrink-0" aria-hidden="true" />
                )}
                <span className={done ? "text-slate-50 font-medium" : "text-slate-300/70"}>
                  {dim.label}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="pt-4 border-t tab-divider space-y-2">
          <div className="text-xs font-semibold text-slate-50">Extracted Draft Metrics</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 bg-[#090514] border tab-divider rounded">
              <div className="text-[11px] text-slate-300/65">Sleep</div>
              <div className="mt-0.5 font-mono text-xs font-semibold text-slate-100 tabular-nums">
                {extracted.sleep_hours !== null ? `${extracted.sleep_hours}h` : "—"}
              </div>
            </div>
            <div className="p-2.5 bg-[#090514] border tab-divider rounded">
              <div className="text-[11px] text-slate-300/65">Water</div>
              <div className="mt-0.5 font-mono text-xs font-semibold text-slate-100 tabular-nums">
                {extracted.water_intake !== null ? `${extracted.water_intake}gl` : "—"}
              </div>
            </div>
            <div className="p-2.5 bg-[#090514] border tab-divider rounded">
              <div className="text-[11px] text-slate-300/65">Stress</div>
              <div className="mt-0.5 font-mono text-xs font-semibold tab-accent-text tabular-nums">
                {extracted.stress_score !== null ? `${extracted.stress_score}/10` : "—"}
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t tab-divider space-y-2">{factorSelectorBlock}</div>
      </aside>
    </div>
  );
}
