import { useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Circle,
  ExternalLink,
  Globe,
  Mic,
  MicOff,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { STANDARD_WELLNESS_DISCLAIMER } from "../data/seedData";
import { DICTATION_LANGUAGES, useVoiceDictation } from "../hooks/useVoiceDictation";
import type { Student } from "../types";
import { safeFetchJson } from "../utils/safeFetch";

interface SymptomGuideTabProps {
  activeStudent: Student | null;
  onOpenDoctorChat: () => void;
}

type GuideTopicId = "fever" | "cold_cough" | "headache" | "stomach" | "exam_stress";

interface GuideTopic {
  id: GuideTopicId;
  label: string;
  summary: string;
  whatToDo: string[];
  whatToAvoid: string[];
  warningSigns: string[];
}

interface SymptomHelperResponse {
  summary: string;
  clarifyingQuestions: string[];
  whatToDo: string[];
  whatToAvoidAndRedFlags: string[];
  disclaimer: string;
  source: "live" | "local";
}

const GUIDE_TOPICS: GuideTopic[] = [
  {
    id: "fever",
    label: "Fever",
    summary:
      "Elevated body temperature is often a sign the body is fighting an infection. Focus on rest, steady fluids, and temperature monitoring.",
    whatToDo: [
      "Rest quietly in a comfortable, well-ventilated room and avoid heavy exertion.",
      "Drink small, frequent sips of water, clear broth, or oral rehydration solution.",
      "Check and log your temperature every 4–6 hours in the Daily Health & Fever Tracker.",
      "Eat light, easy-to-digest foods such as soup, rice, toast, or fruit if hungry.",
    ],
    whatToAvoid: [
      "Avoid bundling up in heavy blankets if feeling overheated.",
      "Do not force intense exercise, late-night screen marathons, or skipped meals.",
      "Never take leftover or unprescribed antibiotics or adult medication without medical advice.",
    ],
    warningSigns: [
      "Temperature above 102.3°F (39°C) or fever lasting more than 48 hours.",
      "Stiff neck, severe headache, confusion, or unusual drowsiness.",
      "Trouble breathing, chest discomfort, skin rash, or persistent vomiting.",
    ],
  },
  {
    id: "cold_cough",
    label: "Cold & Cough",
    summary:
      "Common upper-respiratory irritation improves best with hydration, throat soothing, and reduced vocal/screen strain.",
    whatToDo: [
      "Drink warm water, herbal tea, or warm clear broth to soothe throat irritation.",
      "Rest your voice and sleep with your head slightly elevated if congested.",
      "Use clean tissues, wash hands frequently, and keep your study space ventilated.",
      "Run a clean cool-mist humidifier or breathe gentle steam from a warm shower.",
    ],
    whatToAvoid: [
      "Avoid icy drinks or very dry, dusty rooms if they trigger coughing fits.",
      "Avoid sharing water bottles, utensils, or towels with classmates.",
      "Do not take unverified cough syrups without parent/guardian or doctor guidance.",
    ],
    warningSigns: [
      "Shortness of breath, wheezing, or rapid breathing.",
      "High fever developing alongside chills or chest pain when coughing.",
      "Symptoms worsening sharply after 5–7 days instead of easing.",
    ],
  },
  {
    id: "headache",
    label: "Headache",
    summary:
      "Student headaches frequently stem from dehydration, eye strain, skipped meals, or poor sleep.",
    whatToDo: [
      "Drink 1–2 glasses of water slowly and check when you last ate a balanced meal.",
      "Step away from phones and laptops for 20–30 minutes in a dim, quiet room.",
      "Place a cool damp cloth gently across your forehead or back of the neck.",
      "Prioritize an early, uninterrupted night of sleep.",
    ],
    whatToAvoid: [
      "Avoid staring closely at bright screens or studying under harsh glare.",
      "Avoid excess caffeine or energy drinks, which can worsen dehydration.",
      "Do not ignore recurring daily headaches without telling a parent or doctor.",
    ],
    warningSigns: [
      "Sudden, severe 'worst-ever' headache or headache after a head bump/injury.",
      "Headache paired with fever, stiff neck, blurred vision, or vomiting.",
      "Weakness, numbness, slurred speech, or fainting.",
    ],
  },
  {
    id: "stomach",
    label: "Stomach / Hydration",
    summary:
      "Mild nausea, cramps, or dehydration require gentle oral rehydration and bland foods until settled.",
    whatToDo: [
      "Take tiny, steady sips of clean water or oral rehydration solution (ORS) every 10–15 minutes.",
      "Choose bland foods once settled: plain toast, crackers, rice, banana, or broth.",
      "Rest calmly after eating and keep track of bathroom frequency and fever.",
    ],
    whatToAvoid: [
      "Avoid spicy, greasy, dairy-heavy, or sugary/carbonated drinks while unsettled.",
      "Do not gulp a large bottle of water all at once if feeling nauseous.",
      "Avoid intense physical activity until hydration and energy return.",
    ],
    warningSigns: [
      "Severe or worsening lower-right or persistent abdominal pain.",
      "Inability to keep fluids down for 12+ hours, dry mouth, or dizziness on standing.",
      "High fever, blood in stool/vomit, or extreme weakness.",
    ],
  },
  {
    id: "exam_stress",
    label: "Exam Stress",
    summary:
      "Academic pressure affects sleep, tension, and focus. Structured pacing and brief resets protect both mental clarity and physical health.",
    whatToDo: [
      "Use 45-minute focused study blocks followed by a 10-minute screen-free break.",
      "Practice 4-4-6 slow breathing (inhale 4s, hold 4s, exhale 6s) before intense revision.",
      "Protect at least 7.5 hours of sleep—memory consolidation happens during rest.",
      "Talk openly with a teacher, counselor, or family member if workload feels overwhelming.",
    ],
    whatToAvoid: [
      "Avoid pulling all-nighters or relying on high-caffeine energy drinks.",
      "Avoid skipping meals or staying seated without stretching for hours.",
      "Avoid comparing your study pace harshly against others.",
    ],
    warningSigns: [
      "Persistent panic, inability to sleep for multiple nights, or chest tightness.",
      "Feeling hopeless, overwhelmed to the point of crisis, or unable to function daily.",
      "Speak immediately with a trusted parent, school counselor, or healthcare professional.",
    ],
  },
];

function buildLocalSymptomHelperFallback(query: string, topicLabel: string): SymptomHelperResponse {
  const lower = query.toLowerCase();
  const isFever =
    lower.includes("fever") ||
    lower.includes("temp") ||
    lower.includes("জ্বর") ||
    lower.includes("बुखार") ||
    lower.includes("fiebre");

  return {
    summary: isFever
      ? "Here is calm, doctor-style general fever guidance based on your note:"
      : `Here is structured general care guidance for your ${topicLabel.toLowerCase()} note:`,
    clarifyingQuestions: [
      "How long have these symptoms been present (hours or days)?",
      "If you checked your temperature, what reading did you get?",
      "Are there accompanying symptoms like cough, sore throat, headache, or nausea?",
    ],
    whatToDo: [
      "Rest comfortably and pause heavy study or physical exertion.",
      "Drink steady sips of clean water, clear soup, or oral rehydration fluids.",
      "Monitor how you feel every few hours and log updates in the Daily Health & Fever Tracker.",
    ],
    whatToAvoidAndRedFlags: [
      "Avoid unprescribed medications, dehydration, or pushing through exhaustion.",
      "Tell a parent/guardian and see a licensed doctor promptly if fever exceeds 102.3°F, lasts beyond 48 hours, or if breathing trouble, severe headache/stiff neck, persistent vomiting, or unusual drowsiness appears.",
    ],
    disclaimer: STANDARD_WELLNESS_DISCLAIMER,
    source: "local",
  };
}

export function SymptomGuideTab({ activeStudent, onOpenDoctorChat }: SymptomGuideTabProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<GuideTopicId>("fever");
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [helperInput, setHelperInput] = useState("");
  const [isAskingHelper, setIsAskingHelper] = useState(false);
  const [helperResult, setHelperResult] = useState<SymptomHelperResponse | null>(null);
  const helperInputRef = useRef(helperInput);
  helperInputRef.current = helperInput;

  const {
    dictationLang,
    setDictationLang,
    dictationStatus,
    dictationNotice,
    setDictationNotice,
    toggleDictation,
    stopDictation,
  } = useVoiceDictation({
    getText: () => helperInputRef.current,
    setText: setHelperInput,
  });

  const activeTopic = GUIDE_TOPICS.find((t) => t.id === selectedTopicId) ?? GUIDE_TOPICS[0];

  function toggleChecklist(key: string) {
    setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleAskHelper(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = helperInput.trim();
    if (!trimmed || isAskingHelper) return;

    if (dictationStatus === "listening_speech" || dictationStatus === "listening_mic") {
      stopDictation(false);
    }

    setIsAskingHelper(true);
    try {
      const data = await safeFetchJson<{
        summary: string;
        clarifyingQuestions: string[];
        whatToDo: string[];
        whatToAvoidAndRedFlags: string[];
        disclaimer: string;
      }>("/api/guide/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: 12000,
        body: JSON.stringify({
          query: trimmed,
          studentName: activeStudent?.full_name ?? "Student",
          topicHint: activeTopic.label,
        }),
      });

      setHelperResult({
        summary: data.summary,
        clarifyingQuestions: Array.isArray(data.clarifyingQuestions) ? data.clarifyingQuestions : [],
        whatToDo: Array.isArray(data.whatToDo) ? data.whatToDo : [],
        whatToAvoidAndRedFlags: Array.isArray(data.whatToAvoidAndRedFlags)
          ? data.whatToAvoidAndRedFlags
          : [],
        disclaimer: data.disclaimer || STANDARD_WELLNESS_DISCLAIMER,
        source: "live",
      });
    } catch {
      setHelperResult(buildLocalSymptomHelperFallback(trimmed, activeTopic.label));
    } finally {
      setIsAskingHelper(false);
    }
  }

  const completedDoCount = activeTopic.whatToDo.filter(
    (_, idx) => checkedItems[`${activeTopic.id}-do-${idx}`]
  ).length;

  return (
    <div className="space-y-6">
      {/* Topic Selector */}
      <section className="tab-surface-card rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-50">
              Interactive Symptom &amp; First-Aid Guide
            </h2>
            <p className="mt-0.5 text-xs text-slate-300/75">
              Select a topic for calm, structured student checklists—or ask the AI Symptom Helper in any language below.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenDoctorChat}
            className="px-3 py-1.5 text-xs font-medium tab-outline-btn rounded-md"
          >
            Open Full Doctor Chat
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {GUIDE_TOPICS.map((topic) => {
            const active = topic.id === selectedTopicId;
            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => setSelectedTopicId(topic.id)}
                className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md border transition-colors ${
                  active
                    ? "tab-chip-active"
                    : "bg-[#090514] border-slate-700/60 text-slate-300 hover:border-emerald-400/50 hover:text-slate-100"
                }`}
              >
                {topic.label}
              </button>
            );
          })}
        </div>

        <p className="text-xs sm:text-sm text-slate-200/85 bg-[#090514]/85 border tab-divider rounded-md px-4 py-3 leading-relaxed">
          {activeTopic.summary}
        </p>
      </section>

      {/* Three-Column Structured Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* What To Do */}
        <section className="tab-surface-card rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-emerald-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>What To Do</span>
            </h3>
            <span className="text-[11px] font-mono text-slate-300/75 tabular-nums">
              {completedDoCount}/{activeTopic.whatToDo.length}
            </span>
          </div>
          <ul className="space-y-2.5">
            {activeTopic.whatToDo.map((step, idx) => {
              const key = `${activeTopic.id}-do-${idx}`;
              const done = Boolean(checkedItems[key]);
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => toggleChecklist(key)}
                    className={`w-full text-left flex items-start gap-2.5 p-2.5 rounded-md border transition-colors ${
                      done
                        ? "bg-emerald-500/15 border-emerald-400/45 text-emerald-100"
                        : "bg-[#090514]/80 border-slate-800/80 text-slate-200/90 hover:border-emerald-400/40"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" aria-hidden="true" />
                    ) : (
                      <Circle className="w-4 h-4 text-emerald-400/45 shrink-0 mt-0.5" aria-hidden="true" />
                    )}
                    <span className={`text-xs leading-relaxed ${done ? "line-through opacity-80" : ""}`}>
                      {step}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* What To Avoid */}
        <section className="tab-surface-card rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
            <Ban className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>What To Avoid</span>
          </h3>
          <ul className="space-y-2.5">
            {activeTopic.whatToAvoid.map((item, idx) => {
              const key = `${activeTopic.id}-avoid-${idx}`;
              const ack = Boolean(checkedItems[key]);
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => toggleChecklist(key)}
                    className={`w-full text-left flex items-start gap-2.5 p-2.5 rounded-md border transition-colors ${
                      ack
                        ? "bg-amber-500/12 border-amber-400/45 text-amber-100"
                        : "bg-[#090514]/80 border-slate-800/80 text-slate-200/90 hover:border-amber-400/40"
                    }`}
                  >
                    {ack ? (
                      <CheckCircle2 className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
                    ) : (
                      <Circle className="w-4 h-4 text-amber-400/45 shrink-0 mt-0.5" aria-hidden="true" />
                    )}
                    <span className="text-xs leading-relaxed">{item}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Warning Signs */}
        <section className="tab-surface-card rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Warning Signs (See a Doctor / Inform Parents)</span>
          </h3>
          <ul className="space-y-2.5">
            {activeTopic.warningSigns.map((flag, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2.5 p-2.5 rounded-md bg-rose-500/10 border border-rose-500/30 text-xs text-rose-100 leading-relaxed"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-300 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Multilingual AI Symptom Helper */}
      <section className="tab-surface-card rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b tab-divider flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-50 flex items-center gap-2">
              <Sparkles className="w-4 h-4 tab-accent-text" aria-hidden="true" />
              <span>AI Symptom Helper (Any World Language)</span>
            </h3>
            <p className="mt-0.5 text-xs text-slate-300/75">
              Describe specific symptoms by typing or Voice Typing to receive structured doctor-style care guidance.
            </p>
          </div>
        </div>

        <form onSubmit={(e) => void handleAskHelper(e)} className="p-5 space-y-4">
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
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-950 bg-emerald-300 hover:bg-emerald-200 rounded"
                  >
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    <span>Open in New Tab</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDictationNotice(null)}
                  className="text-[11px] underline text-amber-200/80"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={dictationStatus === "transcribing" || isAskingHelper}
                onClick={toggleDictation}
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
                      {dictationStatus === "listening_mic" ? "Stop & Transcribe" : "Stop Dictation"}
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
                  aria-label="Symptom helper dictation language"
                  value={dictationLang}
                  onChange={(e) => setDictationLang(e.target.value)}
                  disabled={dictationStatus !== "idle"}
                  className="bg-transparent text-xs text-slate-100 focus:outline-none disabled:opacity-60"
                >
                  {DICTATION_LANGUAGES.map((lang) => (
                    <option key={lang.id} value={lang.id} className="bg-[#090514]">
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <span className="text-[11px] text-slate-300/65">
              Text-only guidance · Supports any language
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <textarea
              rows={2}
              value={helperInput}
              onChange={(e) => setHelperInput(e.target.value)}
              placeholder="Describe your symptoms (e.g., 'I have a 100.8°F fever and sore throat since last night')..."
              className="flex-1 px-3 py-2 text-sm tab-input rounded-md placeholder:text-slate-400/45 resize-none"
            />
            <button
              type="submit"
              disabled={!helperInput.trim() || isAskingHelper || dictationStatus === "transcribing"}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-md tab-cta-btn disabled:opacity-45 shrink-0"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span>{isAskingHelper ? "Reviewing..." : "Get Guidance"}</span>
            </button>
          </div>

          {helperResult && (
            <div className="p-4 bg-[#090514]/90 border border-emerald-400/35 rounded-md space-y-3">
              <p className="text-sm font-medium text-emerald-100">{helperResult.summary}</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="space-y-1.5">
                  <div className="font-semibold text-emerald-300">1. Clarifying Questions</div>
                  <ul className="space-y-1 text-slate-200/85 list-disc pl-4">
                    {helperResult.clarifyingQuestions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-1.5">
                  <div className="font-semibold text-teal-300">2. What To Do Now</div>
                  <ul className="space-y-1 text-slate-200/85 list-disc pl-4">
                    {helperResult.whatToDo.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-1.5">
                  <div className="font-semibold text-rose-300">3. Avoid &amp; Warning Signs</div>
                  <ul className="space-y-1 text-rose-100/90 list-disc pl-4">
                    {helperResult.whatToAvoidAndRedFlags.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <p className="text-[11px] text-emerald-200/75 pt-2 border-t border-slate-800/80">
                {helperResult.disclaimer}
              </p>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
