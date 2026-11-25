import { STANDARD_WELLNESS_DISCLAIMER } from "../data/seedData";
import type {
  ExtractedSurveyMetrics,
  SurveyFinalAnalysis,
  SurveyMessage,
} from "../types";

export interface PendingStudentProfile {
  existingStudentId?: string;
  full_name: string;
  email?: string;
  semester?: string;
  dept_id?: string | null;
  class_section: string;
  roll_no: string;
  age: number;
}

export interface SymptomQuickPrompt {
  id: string;
  label: string;
  prompt: string;
}

export const SYMPTOM_QUICK_PROMPTS: SymptomQuickPrompt[] = [
  {
    id: "fever",
    label: "Fever Care Guide",
    prompt: "I have a fever right now. What should I check and what should I do?",
  },
  {
    id: "cold_headache",
    label: "Cold & Headache",
    prompt: "I have a headache and cold or sore throat symptoms. How should I take care of myself?",
  },
  {
    id: "stomach_hydration",
    label: "Stomach / Hydration",
    prompt: "I have stomach discomfort and feel dehydrated. What steps should I follow?",
  },
  {
    id: "stress_sleep",
    label: "Exam Stress & Sleep",
    prompt: "I am experiencing heavy study stress and poor sleep. What can I do to recover safely?",
  },
];

export const SURVEY_DIMENSIONS: Array<{ key: string; label: string }> = [
  { key: "symptoms", label: "Current Symptoms & Comfort" },
  { key: "sleep", label: "Sleep Duration & Rest" },
  { key: "hydration", label: "Daily Water Intake" },
  { key: "screen_fatigue", label: "Screen Exposure & Fatigue" },
  { key: "stress_mood", label: "Stress Score & Mood" },
  { key: "physical_activity", label: "Physical Activity" },
  { key: "student_opinion", label: "Student Opinion & Notes" },
];

export function formatCurrentTime(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function createInitialGreeting(subject: PendingStudentProfile): {
  message: SurveyMessage;
  quickReplies: string[];
} {
  const firstName = subject.full_name.trim().split(/\s+/)[0] || subject.full_name;
  return {
    message: {
      id: `msg-${Date.now()}-a`,
      role: "assistant",
      text: `Hello ${firstName}. I am your Health AI Advisor. How are you feeling today—are you experiencing any symptoms like fever, headache, fatigue, or stomach discomfort, or would you like to do a general wellness check-in? You can type or dictate in any language.`,
      timestamp: formatCurrentTime(),
    },
    quickReplies: [
      "I have a fever today",
      "Feeling tired / headache",
      "Feeling fine, general check-in",
    ],
  };
}

export function parseQuickMetricsFromReply(
  reply: string,
  prev: ExtractedSurveyMetrics,
  coveredTopics: string[]
): ExtractedSurveyMetrics {
  const next = { ...prev };
  const lower = reply.toLowerCase();
  const numMatch = reply.match(/(\d+(?:\.\d+)?)/);
  const num = numMatch ? Number(numMatch[1]) : null;

  if (
    next.sleep_hours === null &&
    (lower.includes("hour") || lower.includes("sleep") || lower.includes("hrs"))
  ) {
    if (num !== null && num >= 0 && num <= 20) {
      next.sleep_hours = num;
    } else if (lower.includes("under 5")) {
      next.sleep_hours = 4.5;
    }
  }
  if (
    next.water_intake === null &&
    (lower.includes("glass") ||
      lower.includes("water") ||
      lower.includes("liter") ||
      coveredTopics.includes("sleep"))
  ) {
    if (num !== null && num >= 0 && num <= 30) {
      next.water_intake = Math.round(num);
    } else if (lower.includes("under 4")) {
      next.water_intake = 3;
    }
  }
  if (
    next.stress_score === null &&
    (lower.includes("stress") || lower.includes("/10") || coveredTopics.includes("screen_fatigue"))
  ) {
    if (num !== null && num >= 1 && num <= 10) {
      next.stress_score = Math.round(num);
    } else if (lower.includes("low")) {
      next.stress_score = 2;
    } else if (lower.includes("moderate")) {
      next.stress_score = 5;
    } else if (lower.includes("high")) {
      next.stress_score = 8;
    }
  }
  return next;
}

function buildDoctorStyleSymptomFallback(
  lowerReply: string,
  topics: string[],
  extractedMetrics: ExtractedSurveyMetrics
): {
  assistantMessage: string;
  suggestedQuickReplies: string[];
  coveredTopics: string[];
  extractedMetrics: ExtractedSurveyMetrics;
  isComplete: boolean;
} | null {
  if (
    lowerReply.includes("fever") ||
    lowerReply.includes("temperature") ||
    lowerReply.includes("chills") ||
    lowerReply.includes("temp ")
  ) {
    const nextTopics = Array.from(new Set([...topics, "symptoms", "hydration"]));
    return {
      assistantMessage: [
        "I understand you may have a fever—let us take this calmly step by step.",
        "",
        "1. Clarifying Questions:",
        "- How long has the fever lasted, and what was your approximate temperature if you checked it?",
        "- Do you have other symptoms such as body ache, chills, sore throat, cough, or nausea?",
        "",
        "2. What To Do Now:",
        "- Rest in a comfortable, well-ventilated room and avoid heavy studying or physical exertion.",
        "- Sip water, oral rehydration fluids, clear soup, or light easily digested food regularly.",
        "- Wear light breathable clothing and monitor your temperature every few hours.",
        "",
        "3. What To Avoid & Warning Signs (See a Doctor / Tell Parents Immediately):",
        "- Avoid skipping fluids, bundling up in heavy blankets while overheating, or taking unprescribed antibiotics/medicines.",
        "- Seek prompt medical care if fever is very high (above 103°F / 39.4°C), lasts more than 2–3 days, or comes with severe headache/stiff neck, trouble breathing, persistent vomiting, confusion, or unusual drowsiness.",
        "",
        "Note: This guidance supports general health awareness and does not replace an in-person licensed doctor.",
      ].join("\n"),
      suggestedQuickReplies: [
        "Started today, around 100-101°F",
        "Lasted 2+ days with cough/body ache",
        "Save fever notes & guidance",
      ],
      coveredTopics: nextTopics,
      extractedMetrics,
      isComplete: true,
    };
  }

  if (
    lowerReply.includes("headache") ||
    lowerReply.includes("cold") ||
    lowerReply.includes("cough") ||
    lowerReply.includes("sore throat") ||
    lowerReply.includes("migraine")
  ) {
    const nextTopics = Array.from(new Set([...topics, "symptoms", "screen_fatigue"]));
    return {
      assistantMessage: [
        "Thanks for sharing those cold or headache symptoms. Here is structured care guidance:",
        "",
        "1. Clarifying Questions:",
        "- When did the headache or throat discomfort start, and do you also feel feverish or congested?",
        "- How many hours of sleep and screen time have you had over the past day?",
        "",
        "2. What To Do Now:",
        "- Step away from bright screens, dim harsh lighting, and rest your eyes.",
        "- Drink warm water, herbal fluids, or plain water steadily; warm salt-water gargles can soothe a mild sore throat.",
        "",
        "3. What To Avoid & Warning Signs (See a Doctor / Tell Parents Immediately):",
        "- Avoid pushing through long screen sessions or skipping meals and water.",
        "- Seek medical attention urgently for a sudden severe headache, stiff neck, high fever, vision changes, chest pain, or shortness of breath.",
        "",
        "Note: General wellness guidance only—consult a licensed doctor for personal medical evaluation.",
      ].join("\n"),
      suggestedQuickReplies: [
        "Mild headache from screen/sleep loss",
        "Sore throat and runny nose since yesterday",
        "Save symptom summary",
      ],
      coveredTopics: nextTopics,
      extractedMetrics,
      isComplete: true,
    };
  }

  if (
    lowerReply.includes("stomach") ||
    lowerReply.includes("nausea") ||
    lowerReply.includes("vomit") ||
    lowerReply.includes("dehydrat") ||
    lowerReply.includes("diarrhea") ||
    lowerReply.includes("dizzy")
  ) {
    const nextTopics = Array.from(new Set([...topics, "symptoms", "hydration"]));
    return {
      assistantMessage: [
        "Let us focus on gentle hydration and stomach comfort right now:",
        "",
        "1. Clarifying Questions:",
        "- Are you having stomach cramps, nausea, vomiting, or loose stools, and since when?",
        "- Have you been able to keep small sips of water or oral fluids down today?",
        "",
        "2. What To Do Now:",
        "- Take slow, frequent sips of water or an oral rehydration solution rather than gulping large amounts at once.",
        "- Stick to bland, light foods (such as plain rice, toast, banana, or broth) once nausea settles, and rest.",
        "",
        "3. What To Avoid & Warning Signs (See a Doctor / Tell Parents Immediately):",
        "- Avoid spicy, greasy, caffeinated, or sugary drinks while your stomach is unsettled.",
        "- Seek prompt medical care for severe abdominal pain, persistent vomiting/inability to keep fluids down, blood in stool/vomit, high fever, or signs of dehydration like dizziness when standing.",
        "",
        "Note: General health awareness only—please see a real doctor if symptoms persist or worsen.",
      ].join("\n"),
      suggestedQuickReplies: [
        "Mild cramps, drinking water slowly",
        "Feeling dizzy and dehydrated",
        "Save health record",
      ],
      coveredTopics: nextTopics,
      extractedMetrics,
      isComplete: true,
    };
  }

  if (
    lowerReply.includes("stress") ||
    lowerReply.includes("anxi") ||
    lowerReply.includes("overwhelm") ||
    lowerReply.includes("poor sleep") ||
    lowerReply.includes("insomnia")
  ) {
    const nextTopics = Array.from(new Set([...topics, "symptoms", "stress_mood", "sleep"]));
    return {
      assistantMessage: [
        "Study pressure and lost sleep can wear down both focus and physical comfort. Here is a calm recovery plan:",
        "",
        "1. Clarifying Questions:",
        "- Roughly how many hours of sleep are you averaging, and how intense is your stress from 1 to 10?",
        "- Are you also noticing tension headaches, racing thoughts, or skipped meals?",
        "",
        "2. What To Do Now:",
        "- Pause for 5 minutes of slow breathing (4-second inhale, 6-second exhale) and step away from study screens.",
        "- Prioritize a consistent wind-down tonight aiming for 7–8 hours of sleep, plus water and a balanced meal.",
        "",
        "3. What To Avoid & Warning Signs (When to Seek Support):",
        "- Avoid late-night caffeine/energy drinks or pulling consecutive all-nighters.",
        "- Talk to a parent, school counselor, or doctor if overwhelm feels unmanageable, lasts for weeks, or causes panic episodes or chest tightness.",
        "",
        "Note: General wellness support only—not a substitute for clinical care.",
      ].join("\n"),
      suggestedQuickReplies: [
        "5 hours sleep, stress 7/10",
        "Feeling exhausted before exams",
        "Save wellness summary",
      ],
      coveredTopics: nextTopics,
      extractedMetrics,
      isComplete: true,
    };
  }

  return null;
}

export function buildFallbackTurn(
  latestReply: string,
  prevTopics: string[],
  prevExtracted: ExtractedSurveyMetrics
): {
  assistantMessage: string;
  suggestedQuickReplies: string[];
  coveredTopics: string[];
  extractedMetrics: ExtractedSurveyMetrics;
  isComplete: boolean;
} {
  const topics = [...prevTopics];
  const extractedMetrics = parseQuickMetricsFromReply(latestReply, prevExtracted, prevTopics);
  const lowerReply = latestReply.toLowerCase();

  const symptomMatch = buildDoctorStyleSymptomFallback(lowerReply, topics, extractedMetrics);
  if (symptomMatch) {
    return symptomMatch;
  }

  const orderedKeys = [
    "symptoms",
    "sleep",
    "hydration",
    "screen_fatigue",
    "stress_mood",
    "physical_activity",
    "student_opinion",
  ];
  const justCovered = orderedKeys.find((k) => !topics.includes(k));
  if (justCovered && !topics.includes(justCovered)) {
    topics.push(justCovered);
  }

  const nextTopic = orderedKeys.find((k) => !topics.includes(k));

  if (!nextTopic) {
    return {
      assistantMessage:
        "Thank you for sharing those details. You can add any remaining symptoms or personal thoughts, or click Compile Assessment to save this consultation summary into your health record.",
      suggestedQuickReplies: ["Generate Wellness Assessment"],
      coveredTopics: topics,
      extractedMetrics,
      isComplete: true,
    };
  }

  switch (nextTopic) {
    case "sleep":
      return {
        assistantMessage:
          "Understood. Roughly how many hours of sleep did you get last night, and do you feel rested or fatigued?",
        suggestedQuickReplies: ["7-8 hours, rested", "5-6 hours, tired", "Under 5 hours"],
        coveredTopics: topics,
        extractedMetrics,
        isComplete: false,
      };
    case "hydration":
      return {
        assistantMessage: "Got it. Roughly how many glasses of water have you had today?",
        suggestedQuickReplies: ["8+ glasses", "4-6 glasses", "Under 4 glasses"],
        coveredTopics: topics,
        extractedMetrics,
        isComplete: false,
      };
    case "screen_fatigue":
      return {
        assistantMessage:
          "Thanks. How heavy has your screen time been today, and have you noticed any eye strain or headache?",
        suggestedQuickReplies: [
          "Low screen time, feel fine",
          "Moderate screen time, mild eye strain",
          "Heavy screen time, headache",
        ],
        coveredTopics: topics,
        extractedMetrics,
        isComplete: false,
      };
    case "stress_mood":
      return {
        assistantMessage:
          "On a scale from 1 to 10, how would you rate your stress level today, and how is your overall mood?",
        suggestedQuickReplies: [
          "Low stress (2/10), calm",
          "Moderate stress (5/10), steady",
          "High stress (8/10), overwhelmed",
        ],
        coveredTopics: topics,
        extractedMetrics,
        isComplete: false,
      };
    case "physical_activity":
      return {
        assistantMessage:
          "Have you had any physical activity or movement today, and have you been eating regular meals?",
        suggestedQuickReplies: [
          "Light walk & regular meals",
          "Skipped a meal today",
          "Minimal movement today",
        ],
        coveredTopics: topics,
        extractedMetrics,
        isComplete: false,
      };
    case "student_opinion":
    default:
      return {
        assistantMessage:
          "Finally, is there any symptom note, study workload concern, or personal feedback you want saved in your wellness record?",
        suggestedQuickReplies: [
          "Workload feels manageable",
          "Need better sleep & recovery balance",
          "Generate Wellness Assessment",
        ],
        coveredTopics: topics,
        extractedMetrics,
        isComplete: true,
      };
  }
}

export function buildFallbackAnalysis(
  subject: PendingStudentProfile,
  history: SurveyMessage[],
  extracted: ExtractedSurveyMetrics
): SurveyFinalAnalysis {
  const sleep = extracted.sleep_hours ?? 7.0;
  const water = extracted.water_intake ?? 6;
  const stress = extracted.stress_score ?? 5;
  const wellness = Math.max(
    25,
    Math.min(98, Math.round(72 + (sleep - 6.5) * 4 + (water - 5) * 1.5 - (stress - 5) * 4))
  );
  const studentReplies = history.filter((m) => m.role === "student").map((m) => m.text.trim());
  const combinedStudentText = studentReplies.join(" | ");
  const lowerAll = combinedStudentText.toLowerCase();

  const detectedSymptoms: string[] = [];
  if (lowerAll.includes("fever") || lowerAll.includes("temperature")) detectedSymptoms.push("fever");
  if (lowerAll.includes("headache")) detectedSymptoms.push("headache");
  if (lowerAll.includes("cold") || lowerAll.includes("cough") || lowerAll.includes("throat")) {
    detectedSymptoms.push("cold/throat discomfort");
  }
  if (lowerAll.includes("stomach") || lowerAll.includes("nausea") || lowerAll.includes("dehydrat")) {
    detectedSymptoms.push("stomach/hydration concern");
  }
  if (lowerAll.includes("stress") || lowerAll.includes("fatigue") || lowerAll.includes("tired")) {
    detectedSymptoms.push("fatigue/study stress");
  }

  const opinion =
    combinedStudentText.length > 0
      ? combinedStudentText.slice(0, 320)
      : "Student completed wellness check-in.";

  const symptomSummary =
    detectedSymptoms.length > 0
      ? `Reported concerns: ${detectedSymptoms.join(", ")}. Advised rest, steady hydration, symptom monitoring, and prompt evaluation by a parent/doctor if warning signs develop.`
      : "No acute physical symptoms reported during this check-in.";

  return {
    sleep_hours: Math.round(sleep * 10) / 10,
    water_intake: Math.round(water),
    stress_score: Math.round(stress),
    wellness_index: wellness,
    student_opinion: opinion,
    ai_assessment: `${subject.full_name} reported ~${sleep} hrs sleep, ${water} glasses of water, and stress ${stress}/10. ${symptomSummary}`,
    actionable_tips: [
      "Rest adequately and aim for 7–8 hours of consistent sleep when recovering or under heavy study load.",
      "Sip water or oral fluids steadily throughout the day and keep meals light and regular.",
      "Seek an in-person licensed doctor or notify parents immediately if fever exceeds 103°F (39.4°C), lasts over 2–3 days, or brings severe headache, breathing trouble, or persistent vomiting.",
    ],
    disclaimer: STANDARD_WELLNESS_DISCLAIMER,
  };
}
