import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const GEMINI_MODEL = "gemini-4-hydrogen";

interface SurveyTurnInput {
  studentProfile: {
    student_id: string;
    full_name: string;
    class_section: string;
    age: number;
    semester?: string;
  };
  conversationHistory: Array<{
    role: "assistant" | "student";
    text: string;
  }>;
  coveredTopics?: string[];
  selectedFactors?: string[];
  recentReportsContext?: string;
}

class GeminiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiConfigError";
  }
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new GeminiConfigError(
      "GEMINI_API_KEY is not configured. Please add a valid Gemini API key in Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }
  return trimmed;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      if (err instanceof GeminiConfigError) {
        throw err;
      }
      const status =
        typeof err === "object" && err !== null && "status" in err
          ? Number((err as { status?: unknown }).status)
          : undefined;
      if (status === 400 || status === 401 || status === 403 || status === 404) {
        throw err;
      }
      if (attempt < maxRetries) {
        const delayMs = 500 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function formatGeminiError(err: unknown): { status: number; error: string; code: string } {
  if (err instanceof GeminiConfigError) {
    return {
      status: 503,
      error: "AI service key is not configured in server secrets.",
      code: "MISSING_API_KEY",
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status?: unknown }).status)
      : 500;

  if (status === 403 || message.includes("PERMISSION_DENIED") || message.includes("API_KEY_INVALID")) {
    return {
      status: 403,
      error: "Server AI key was rejected. Please verify the API key in Settings > Secrets.",
      code: "API_KEY_INVALID",
    };
  }
  if (status === 429 || message.includes("RESOURCE_EXHAUSTED")) {
    return {
      status: 429,
      error: "AI rate limit reached. Please wait a few seconds and retry.",
      code: "RATE_LIMITED",
    };
  }
  if (status === 404 || message.includes("NOT_FOUND")) {
    return {
      status: 404,
      error: "Configured AI model is currently unavailable.",
      code: "MODEL_NOT_FOUND",
    };
  }
  return {
    status: 502,
    error: "Unable to reach the live Health AI service right now. Continuing with local mode.",
    code: "UPSTREAM_ERROR",
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", ok: true, model: GEMINI_MODEL });
  });

  // Voice-to-Text Dictation Endpoint (Gemini 4 Hydrogen inline audio -> plain text transcript in any language)
  app.post("/api/voice/transcribe", async (req, res) => {
    const body = req.body as {
      audioBase64?: string;
      mimeType?: string;
      languageHint?: string;
    };

    if (!body?.audioBase64 || typeof body.audioBase64 !== "string") {
      res.status(400).json({
        error: "Recorded audio data is required.",
        code: "INVALID_AUDIO",
      });
      return;
    }

    const rawMime = typeof body.mimeType === "string" ? body.mimeType : "audio/webm";
    const cleanMimeType = rawMime.split(";")[0].trim() || "audio/webm";
    const safeMimeType = cleanMimeType.startsWith("audio/") ? cleanMimeType : "audio/webm";
    const languageHint =
      typeof body.languageHint === "string" && body.languageHint.trim() && body.languageHint !== "auto"
        ? ` The speaker may be speaking ${body.languageHint.trim()}, though transcribe whichever language is actually spoken.`
        : " Detect whichever world language is spoken automatically and transcribe it accurately in its natural script.";

    try {
      const ai = getGeminiClient();
      const audioPart = {
        inlineData: {
          mimeType: safeMimeType,
          data: body.audioBase64,
        },
      };

      const response = await withTimeout(
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: {
            parts: [
              audioPart,
              {
                text: `Transcribe the speaker's exact words from this audio clip.${languageHint} Return ONLY JSON with heardSpeech (boolean) and transcript (string). If there is only silence or background noise with no clear speech, set heardSpeech=false and transcript="". Do not translate unless the speaker asks; preserve the original spoken language.`,
              },
            ],
          },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                heardSpeech: { type: Type.BOOLEAN },
                transcript: { type: Type.STRING },
              },
              required: ["heardSpeech", "transcript"],
            },
          },
        }),
        14000,
        "Voice dictation"
      );

      const rawText = stripJsonFences(response.text ?? "{}");
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        parsed = { heardSpeech: false, transcript: "" };
      }

      const transcript =
        typeof parsed.transcript === "string" ? parsed.transcript.trim() : "";
      const heardSpeech = Boolean(parsed.heardSpeech) && transcript.length > 0;

      res.json({
        heardSpeech,
        transcript,
      });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.error, code: formatted.code });
    }
  });

  // Gemini 4 Hydrogen Adaptive Health Survey Turn
  app.post("/api/survey/next", async (req, res) => {
    const body = req.body as Partial<SurveyTurnInput> | undefined;
    if (!body?.studentProfile?.full_name || !Array.isArray(body.conversationHistory)) {
      res.status(400).json({
        error: "Invalid request payload. Student profile and conversation history are required.",
        code: "INVALID_INPUT",
      });
      return;
    }

    const {
      studentProfile,
      conversationHistory,
      coveredTopics = [],
      selectedFactors = [],
      recentReportsContext = "",
    } = body;
    const studentTurnCount = conversationHistory.filter((m) => m.role === "student").length;

    const factorLine =
      Array.isArray(selectedFactors) && selectedFactors.length > 0
        ? `Selected contributing stress factors: ${selectedFactors.join(", ")}.`
        : "No specific stress factors selected yet.";
    const historyLine =
      typeof recentReportsContext === "string" && recentReportsContext.trim().length > 0
        ? `Recent logged stress & tracker history:\n${recentReportsContext.trim()}`
        : "No prior stress reports logged yet.";

    const transcript =
      conversationHistory.length === 0
        ? "(Survey starting now. Greet the student warmly by first name and ask the opening question about their recent sleep hours, stress factors, and energy levels.)"
        : conversationHistory
            .map((m) => `${m.role === "assistant" ? "Health Surveyor" : studentProfile.full_name}: ${m.text}`)
            .join("\n");

    const systemInstruction = `You are a calm, structured, empathetic Health & Wellness Advisor supporting student "${studentProfile.full_name}" (ID: ${studentProfile.student_id}, Section: ${studentProfile.class_section}, Semester: ${studentProfile.semester ?? "N/A"}, Age: ${studentProfile.age}) in a strictly text-based chat.

Context from Student DBMS Records:
- ${factorLine}
- ${historyLine}

Multilingual Rule:
- Understand ANY world language typed or dictated by the student (English, Bengali, Hindi, Spanish, Arabic, French, German, Portuguese, Japanese, Chinese, Korean, etc., as well as mixed-language messages).
- Always reply clearly in plain text inside the chat, naturally matching the student's language unless they request a different language.

Structured Guidance & Practical Coping Rule (When the student reports symptoms like fever/headache/stomach discomfort OR elevated stress/workload/sleep loss):
Structure your response cleanly using plain text line breaks (no markdown asterisks ** or # headers, no emojis) with these clear sections in the user's language:
1. Clarifying Questions: Ask 2-3 brief, relevant questions (for example, how long the stress or symptom has lasted, contributing triggers like exams/workload/sleep, or temperature if feverish).
2. Practical Coping & Care Steps: Give clear, practical steps tailored to their selected stress factors and recent logs (paced study blocks, sleep protection, steady hydration, slow breathing, rest, and light nutrition).
3. What To Avoid & Warning Signs (When to Seek Support / See a Doctor): Highlight common mistakes to avoid (all-nighters, skipping fluids, unprescribed medicines) and clear red flags requiring immediate parent/counselor support or an in-person licensed doctor / urgent care.
4. Note: End with a brief, calm reminder that this is wellness monitoring and guidance only — it does not constitute a clinical diagnosis or emergency medical care.

General Wellness Topics to also track naturally:
- "symptoms" — any current physical discomfort, fever, cold, stomach issue, or acute complaint
- "sleep" — sleep duration (hours) and rest quality
- "hydration" — daily water intake (glasses)
- "screen_fatigue" — screen exposure or eye strain
- "stress_mood" — stress score (1-10) and emotional mood
- "physical_activity" — movement or exercise
- "student_opinion" — student's own symptom notes, stress triggers, or personal feedback

Additional Guidelines:
- Reference the student's selected stress factors or recent tracker logs gently when helpful so guidance feels continuous and grounded.
- Never mention voice playback or claim to speak aloud.
- Already covered topics: ${coveredTopics.length > 0 ? coveredTopics.join(", ") : "none yet"}.
- Student turns completed so far: ${studentTurnCount}.
- Set isComplete to true once the student's main consultation or at least 3-4 wellness responses have been gathered so they can save their record, OR if they ask to finish.
- Provide up to 3 short suggestedQuickReplies (2-6 words each) in the same language as your reply.
- Update extracted metrics whenever mentioned or clearly implied (in any language or numeral script).`;

    try {
      const ai = getGeminiClient();
      const response = await withTimeout(
        withRetry(() =>
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: `Conversation transcript:\n${transcript}\n\nGenerate the next structured Doctor-Style Health Advisor turn in JSON.`,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                assistantMessage: {
                  type: Type.STRING,
                  description: "Spoken-friendly concise surveyor response and next adaptive question.",
                },
                suggestedQuickReplies: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Up to 3 short optional quick replies.",
                },
                coveredTopics: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    "Covered keys from: symptoms, sleep, hydration, screen_fatigue, stress_mood, physical_activity, student_opinion.",
                },
                extractedSleepHours: {
                  type: Type.NUMBER,
                  description: "Estimated sleep hours per night if mentioned, else -1.",
                },
                extractedWaterIntake: {
                  type: Type.INTEGER,
                  description: "Estimated daily glasses of water if mentioned, else -1.",
                },
                extractedStressScore: {
                  type: Type.INTEGER,
                  description: "Estimated stress score 1-10 if mentioned/implied, else -1.",
                },
                isComplete: {
                  type: Type.BOOLEAN,
                  description: "True if enough information and student opinion have been gathered.",
                },
              },
              required: [
                "assistantMessage",
                "suggestedQuickReplies",
                "coveredTopics",
                "extractedSleepHours",
                "extractedWaterIntake",
                "extractedStressScore",
                "isComplete",
              ],
            },
          },
        })
        ),
        14000,
        "Health advisor response"
      );

      const rawText = stripJsonFences(response.text ?? "{}");
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        parsed = {
          assistantMessage:
            "Thank you for sharing that. How many glasses of water have you been drinking daily, and how has your stress felt on a scale of one to ten?",
          suggestedQuickReplies: ["6 glasses, stress 4/10", "4 glasses, stress 7/10", "8 glasses, stress 2/10"],
          coveredTopics,
          extractedSleepHours: -1,
          extractedWaterIntake: -1,
          extractedStressScore: -1,
          isComplete: studentTurnCount >= 5,
        };
      }

      const validTopics = new Set([
        "symptoms",
        "sleep",
        "hydration",
        "screen_fatigue",
        "stress_mood",
        "physical_activity",
        "nutrition",
        "student_opinion",
      ]);

      const rawTopics = Array.isArray(parsed.coveredTopics) ? parsed.coveredTopics : coveredTopics;
      const mergedTopics = Array.from(
        new Set([...coveredTopics, ...rawTopics.map(String)].filter((t) => validTopics.has(t)))
      );

      const sleepVal = Number(parsed.extractedSleepHours);
      const waterVal = Number(parsed.extractedWaterIntake);
      const stressVal = Number(parsed.extractedStressScore);

      res.json({
        assistantMessage:
          typeof parsed.assistantMessage === "string" && parsed.assistantMessage.trim().length > 0
            ? parsed.assistantMessage.trim()
            : "Could you also share any thoughts or feedback on how your academic schedule is affecting your daily wellness?",
        suggestedQuickReplies: Array.isArray(parsed.suggestedQuickReplies)
          ? parsed.suggestedQuickReplies.map(String).slice(0, 4)
          : [],
        coveredTopics: mergedTopics,
        extractedMetrics: {
          sleep_hours:
            Number.isFinite(sleepVal) && sleepVal >= 0 && sleepVal <= 20
              ? Math.round(sleepVal * 10) / 10
              : null,
          water_intake:
            Number.isFinite(waterVal) && waterVal >= 0 && waterVal <= 30
              ? Math.round(waterVal)
              : null,
          stress_score:
            Number.isFinite(stressVal) && stressVal >= 1 && stressVal <= 10
              ? Math.round(stressVal)
              : null,
        },
        isComplete: Boolean(parsed.isComplete) || studentTurnCount >= 6,
      });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.error, code: formatted.code });
    }
  });

  // Gemini 4 Hydrogen Structured DBMS Final Assessment
  app.post("/api/survey/finalize", async (req, res) => {
    const body = req.body as Partial<SurveyTurnInput> | undefined;
    if (!body?.studentProfile?.full_name || !Array.isArray(body.conversationHistory) || body.conversationHistory.length === 0) {
      res.status(400).json({
        error: "Cannot finalize an empty survey. Please record at least one student response first.",
        code: "INVALID_INPUT",
      });
      return;
    }

    const { studentProfile, conversationHistory, selectedFactors = [] } = body;
    const transcript = conversationHistory
      .map((m) => `${m.role === "assistant" ? "Health Surveyor" : studentProfile.full_name}: ${m.text}`)
      .join("\n");
    const factorSummary =
      Array.isArray(selectedFactors) && selectedFactors.length > 0
        ? `Selected Stress Factors: ${selectedFactors.join(", ")}.`
        : "Selected Stress Factors: none tagged yet.";

    const systemInstruction = `You are a structured Student Wellness & Health Advisor compiling a multilingual consultation and stress check-in transcript into a relational DBMS stress_reports record.
Student: ${studentProfile.full_name} (ID: ${studentProfile.student_id}, Section: ${studentProfile.class_section}, Age: ${studentProfile.age}).
${factorSummary}

Produce accurate, conservative structured values (write student_opinion, ai_assessment, actionable_tips, and disclaimer in the student's primary language from the transcript, or English if mixed/English):
- sleep_hours: decimal 2.0-12.0 (default 7.0 if unmentioned).
- water_intake: integer glasses per day 1-20 (default 6 if unmentioned).
- stress_score: integer 1-10 where 1 is minimal stress and 10 is severe stress.
- wellness_index: integer 1-100 reflecting overall sleep, hydration, stress balance, and whether acute symptoms (like fever or pain) were reported.
- student_opinion: concise 1-3 sentence synthesis capturing the student's reported symptoms, stress triggers, remarks, and personal feedback.
- ai_assessment: clear 2-4 sentence supportive summary capturing reported stress factors/symptoms, practical coping guidance, and key warning signs to watch for.
- actionable_tips: 3-5 practical, specific coping and self-care steps, things to avoid, and when to talk to a counselor/parent or licensed doctor.
- disclaimer: clear note stating that this is wellness monitoring and guidance only, not a clinical diagnosis or emergency medical care.`;

    try {
      const ai = getGeminiClient();
      const response = await withTimeout(
        withRetry(() =>
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: `Transcript:\n${transcript}\n\nCompile the structured stress_reports JSON assessment.`,
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  sleep_hours: { type: Type.NUMBER },
                  water_intake: { type: Type.INTEGER },
                  stress_score: { type: Type.INTEGER },
                  wellness_index: { type: Type.INTEGER },
                  student_opinion: { type: Type.STRING },
                  ai_assessment: { type: Type.STRING },
                  actionable_tips: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  disclaimer: { type: Type.STRING },
                },
                required: [
                  "sleep_hours",
                  "water_intake",
                  "stress_score",
                  "wellness_index",
                  "student_opinion",
                  "ai_assessment",
                  "actionable_tips",
                  "disclaimer",
                ],
              },
            },
          })
        ),
        15000,
        "Assessment summary"
      );

      const rawText = stripJsonFences(response.text ?? "{}");
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        throw new Error("Malformed JSON returned from Gemini assessment model.");
      }

      res.json({
        sleep_hours: Math.round(clampNumber(parsed.sleep_hours, 0, 18, 7.0) * 10) / 10,
        water_intake: Math.round(clampNumber(parsed.water_intake, 0, 24, 6)),
        stress_score: Math.round(clampNumber(parsed.stress_score, 1, 10, 5)),
        wellness_index: Math.round(clampNumber(parsed.wellness_index, 1, 100, 74)),
        student_opinion:
          typeof parsed.student_opinion === "string" && parsed.student_opinion.trim()
            ? parsed.student_opinion.trim()
            : "Student completed routine wellness check-in with no additional feedback noted.",
        ai_assessment:
          typeof parsed.ai_assessment === "string" && parsed.ai_assessment.trim()
            ? parsed.ai_assessment.trim()
            : "Student completed an adaptive wellness survey covering sleep, hydration, stress, and daily routines.",
        actionable_tips: Array.isArray(parsed.actionable_tips)
          ? parsed.actionable_tips.map(String).filter(Boolean).slice(0, 5)
          : [
              "Keep a regular sleep schedule across weekdays and weekends.",
              "Maintain steady water intake throughout study blocks.",
              "Take brief screen breaks every 45–60 minutes.",
            ],
        disclaimer:
          typeof parsed.disclaimer === "string" && parsed.disclaimer.trim()
            ? parsed.disclaimer.trim()
            : "General Health Guidance: This AI health advisor supports general wellness monitoring only and is not a clinical diagnosis or emergency medical care.",
      });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.error, code: formatted.code });
    }
  });

  // Daily Health & Stress Tracker: AI Trend Analysis
  app.post("/api/tracker/analyze", async (req, res) => {
    const body = req.body as {
      studentName?: string;
      entries?: Array<{
        recorded_at: string;
        temperature_f?: number | null;
        fever_status?: string;
        sleep_hours: number;
        water_intake: number;
        stress_score: number;
        wellness_index: number;
        symptoms?: string[];
        factors?: string[];
        student_opinion?: string;
      }>;
    };

    if (!Array.isArray(body?.entries) || body.entries.length === 0) {
      res.status(400).json({
        error: "At least one logged check-in is required for trend analysis.",
        code: "INVALID_INPUT",
      });
      return;
    }

    const studentLabel = body.studentName?.trim() || "the student";
    const summaryText = body.entries
      .slice(0, 15)
      .map(
        (e, i) =>
          `${i + 1}. Date: ${e.recorded_at} | Temp: ${
            typeof e.temperature_f === "number" ? `${e.temperature_f}°F` : "N/A"
          } (${e.fever_status ?? "None"}) | Sleep: ${e.sleep_hours}h | Water: ${
            e.water_intake
          }gl | Stress: ${e.stress_score}/10 | Wellness: ${e.wellness_index}/100 | Factors: ${
            Array.isArray(e.factors) && e.factors.length > 0 ? e.factors.join(", ") : "none"
          } | Symptoms: ${
            Array.isArray(e.symptoms) && e.symptoms.length > 0 ? e.symptoms.join(", ") : "none"
          } | Remarks: ${e.student_opinion ?? ""}`
      )
      .join("\n");

    try {
      const ai = getGeminiClient();
      const response = await withTimeout(
        withRetry(() =>
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: `Analyze these chronological stress reports and daily health check-ins for ${studentLabel}:\n${summaryText}`,
            config: {
              systemInstruction:
                "You are a calm, supportive student wellness advisor. Summarize stress patterns, contributing stress factors, temperature/fever changes, hydration, sleep, and wellness trajectory clearly in plain text with practical coping steps. Always include a clear note that this is general wellness monitoring/guidance rather than a clinical diagnosis or emergency care.",
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  observation: { type: Type.STRING },
                  recommendations: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  safetyNote: { type: Type.STRING },
                },
                required: ["observation", "recommendations", "safetyNote"],
              },
            },
          })
        ),
        14000,
        "Trend analysis"
      );

      const rawText = stripJsonFences(response.text ?? "{}");
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        throw new Error("Malformed JSON returned from trend analysis.");
      }

      res.json({
        observation:
          typeof parsed.observation === "string" && parsed.observation.trim()
            ? parsed.observation.trim()
            : "Logged daily entries reviewed for sleep, hydration, stress, and fever patterns.",
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations.map(String).filter(Boolean).slice(0, 4)
          : [
              "Continue logging temperature and hydration consistently at the same time each day.",
              "Prioritize rest and steady fluids while monitoring any recurring symptoms.",
            ],
        safetyNote:
          typeof parsed.safetyNote === "string" && parsed.safetyNote.trim()
            ? parsed.safetyNote.trim()
            : "General wellness guidance only — tell a parent/guardian and see a licensed doctor if fever exceeds 102°F, persists beyond 48 hours, or worsens.",
      });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.error, code: formatted.code });
    }
  });

  // Symptom & First-Aid Guide: Multilingual AI Symptom Helper
  app.post("/api/guide/ask", async (req, res) => {
    const body = req.body as {
      query?: string;
      studentName?: string;
      topicHint?: string;
    };

    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) {
      res.status(400).json({
        error: "Please describe your symptoms or question first.",
        code: "INVALID_INPUT",
      });
      return;
    }

    try {
      const ai = getGeminiClient();
      const response = await withTimeout(
        withRetry(() =>
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: `Student (${body.studentName?.trim() || "Student"}) symptom query (topic context: ${
              body.topicHint || "general"
            }):\n"${query}"`,
            config: {
              systemInstruction: `You are a calm, empathetic Doctor-Style Student Health Advisor.
Understand ANY world language in the student's query and reply in that SAME language in plain text (no markdown asterisks ** or # headers).
Provide structured guidance with:
1. clarifyingQuestions: 2-3 brief questions (duration, severity/temperature, accompanying symptoms).
2. whatToDo: 3-4 practical care steps (rest, hydration, comfort, monitoring).
3. whatToAvoidAndRedFlags: 3-4 mistakes to avoid and warning signs requiring immediate parent/guardian notice and an in-person licensed doctor visit.
4. disclaimer: brief reminder that this is general wellness guidance and not a medical diagnosis.`,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  summary: { type: Type.STRING },
                  clarifyingQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                  whatToDo: { type: Type.ARRAY, items: { type: Type.STRING } },
                  whatToAvoidAndRedFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
                  disclaimer: { type: Type.STRING },
                },
                required: [
                  "summary",
                  "clarifyingQuestions",
                  "whatToDo",
                  "whatToAvoidAndRedFlags",
                  "disclaimer",
                ],
              },
            },
          })
        ),
        14000,
        "Symptom helper"
      );

      const rawText = stripJsonFences(response.text ?? "{}");
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        throw new Error("Malformed JSON returned from symptom helper.");
      }

      res.json({
        summary:
          typeof parsed.summary === "string" && parsed.summary.trim()
            ? parsed.summary.trim()
            : "Here is structured general wellness guidance for the symptoms you described.",
        clarifyingQuestions: Array.isArray(parsed.clarifyingQuestions)
          ? parsed.clarifyingQuestions.map(String).filter(Boolean).slice(0, 4)
          : [],
        whatToDo: Array.isArray(parsed.whatToDo)
          ? parsed.whatToDo.map(String).filter(Boolean).slice(0, 5)
          : [],
        whatToAvoidAndRedFlags: Array.isArray(parsed.whatToAvoidAndRedFlags)
          ? parsed.whatToAvoidAndRedFlags.map(String).filter(Boolean).slice(0, 5)
          : [],
        disclaimer:
          typeof parsed.disclaimer === "string" && parsed.disclaimer.trim()
            ? parsed.disclaimer.trim()
            : "General Health Guidance: This AI health advisor supports general wellness awareness only and does not replace an in-person licensed doctor, parent/guardian guidance, or urgent medical care.",
      });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.error, code: formatted.code });
    }
  });

  // Wellness & Recovery Routine: AI Routine Tailor
  app.post("/api/routine/generate", async (req, res) => {
    const body = req.body as {
      mode?: "fever_recovery" | "exam_balance";
      studentName?: string;
      latestContext?: {
        sleep_hours?: number;
        water_intake?: number;
        stress_score?: number;
        fever_status?: string;
        temperature_f?: number | null;
        symptoms?: string[];
        student_opinion?: string;
      } | null;
    };

    const mode = body?.mode === "exam_balance" ? "exam_balance" : "fever_recovery";
    const studentName = body?.studentName?.trim() || "Student";
    const ctx = body?.latestContext;

    const contextSummary = ctx
      ? `Latest check-in: Sleep ${ctx.sleep_hours ?? "N/A"}h, Water ${
          ctx.water_intake ?? "N/A"
        } glasses, Stress ${ctx.stress_score ?? "N/A"}/10, Fever ${
          ctx.fever_status ?? "None"
        } (${typeof ctx.temperature_f === "number" ? `${ctx.temperature_f}°F` : "temp N/A"}), Symptoms: ${
          Array.isArray(ctx.symptoms) && ctx.symptoms.length > 0 ? ctx.symptoms.join(", ") : "none"
        }, Notes: ${ctx.student_opinion ?? ""}`
      : "No prior check-in logged yet; build a calm baseline schedule.";

    try {
      const ai = getGeminiClient();
      const response = await withTimeout(
        withRetry(() =>
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: `Create a ${
              mode === "fever_recovery" ? "Fever & Illness Recovery" : "Exam Stress & Study Balance"
            } daily schedule for ${studentName}.\n${contextSummary}`,
            config: {
              systemInstruction:
                "You are a student wellness planner. Generate 5 clear daily schedule blocks (Morning, Midday, Afternoon, Evening, Night) balancing rest, hydration, gentle nutrition, light study/breathing, and symptom/sleep checks. Keep recommendations safe, non-diagnostic, and practical.",
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  focusSummary: { type: Type.STRING },
                  blocks: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        timeWindow: { type: Type.STRING },
                        activity: { type: Type.STRING },
                        detail: { type: Type.STRING },
                        category: { type: Type.STRING },
                      },
                      required: ["timeWindow", "activity", "detail", "category"],
                    },
                  },
                  disclaimer: { type: Type.STRING },
                },
                required: ["title", "focusSummary", "blocks", "disclaimer"],
              },
            },
          })
        ),
        14000,
        "Routine builder"
      );

      const rawText = stripJsonFences(response.text ?? "{}");
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        throw new Error("Malformed JSON returned from routine builder.");
      }

      const validCategories = new Set(["rest", "hydration", "nutrition", "study", "check"]);
      const blocksRaw = Array.isArray(parsed.blocks) ? parsed.blocks : [];
      const blocks = blocksRaw.slice(0, 6).map((b, idx) => {
        const item = b as Record<string, unknown>;
        const cat = String(item.category ?? "rest").toLowerCase();
        return {
          id: `blk-${Date.now()}-${idx}`,
          timeWindow: String(item.timeWindow ?? `Block ${idx + 1}`),
          activity: String(item.activity ?? "Rest & Hydration"),
          detail: String(item.detail ?? "Take slow breaths and drink water."),
          category: (validCategories.has(cat) ? cat : "rest") as
            | "rest"
            | "hydration"
            | "nutrition"
            | "study"
            | "check",
          completed: false,
        };
      });

      res.json({
        title:
          typeof parsed.title === "string" && parsed.title.trim()
            ? parsed.title.trim()
            : mode === "fever_recovery"
              ? "Fever & Recovery Care Routine"
              : "Exam Stress & Study Balance Routine",
        focusSummary:
          typeof parsed.focusSummary === "string" && parsed.focusSummary.trim()
            ? parsed.focusSummary.trim()
            : "Balanced rest, hydration, and light recovery cadence tailored to current student context.",
        blocks,
        disclaimer:
          typeof parsed.disclaimer === "string" && parsed.disclaimer.trim()
            ? parsed.disclaimer.trim()
            : "General wellness routine only — adjust based on how you feel and consult a parent/guardian or doctor if symptoms worsen.",
      });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.error, code: formatted.code });
    }
  });

  app.all("/api/*", (_req, res) => {
    res.status(404).json({ error: "API route not found.", code: "NOT_FOUND" });
  });

  if (process.env.NODE_ENV !== "production") {
    app.get("/@vite/client", (_req, res) => {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(`
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if ("document" in globalThis) {
  document.querySelectorAll("style[data-vite-dev-id]").forEach((el) => {
    sheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement("afterend", style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id="' + CSS.escape(id) + '"]').forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== "." && url[0] !== "/") return url;
  const pathname = url.replace(/[?#].*$/, "");
  const { search, hash } = new URL(url, "http://vite.dev");
  return pathname + "?" + queryToInject + (search ? "&" + search.slice(1) : "") + (hash || "");
}
export class ErrorOverlay extends HTMLElement {
  close() {}
}
`);
    });

    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distDir, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
