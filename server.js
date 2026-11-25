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

class GeminiConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "GeminiConfigError";
  }
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new GeminiConfigError(
      "GEMINI_API_KEY is not configured. Please add a valid Gemini API key in environment variables."
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

function stripJsonFences(raw) {
  const trimmed = String(raw ?? "").trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }
  return trimmed;
}

async function withRetry(fn, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err instanceof GeminiConfigError) {
        throw err;
      }
      const status =
        typeof err === "object" && err !== null && "status" in err ? Number(err.status) : undefined;
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

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function formatGeminiError(err) {
  if (err instanceof GeminiConfigError) {
    return {
      status: 503,
      error: "AI service key is not configured on the server.",
      code: "MISSING_API_KEY",
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  const status =
    typeof err === "object" && err !== null && "status" in err ? Number(err.status) : 500;

  if (status === 403 || message.includes("PERMISSION_DENIED") || message.includes("API_KEY_INVALID")) {
    return {
      status: 403,
      error: "Server AI key was rejected. Please verify GEMINI_API_KEY.",
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

function clampNumber(value, min, max, fallback) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", ok: true, model: GEMINI_MODEL });
  });

  app.post("/api/voice/transcribe", async (req, res) => {
    const body = req.body;
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
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = { heardSpeech: false, transcript: "" };
      }

      const transcript = typeof parsed.transcript === "string" ? parsed.transcript.trim() : "";
      const heardSpeech = Boolean(parsed.heardSpeech) && transcript.length > 0;

      res.json({ heardSpeech, transcript });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.error, code: formatted.code });
    }
  });

  app.post("/api/survey/next", async (req, res) => {
    const body = req.body;
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
- Understand ANY world language typed or dictated by the student and reply clearly in plain text inside the chat, naturally matching the student's language.

Structured Guidance & Practical Coping Rule:
Structure your response cleanly using plain text line breaks (no markdown asterisks ** or # headers, no emojis):
1. Clarifying Questions: Ask 2-3 brief, relevant questions.
2. Practical Coping & Care Steps: Give clear, practical steps tailored to their selected stress factors and recent logs.
3. What To Avoid & Warning Signs: Highlight common mistakes to avoid and red flags requiring immediate parent/counselor support or an in-person licensed doctor.
4. Note: End with a brief reminder that this is wellness monitoring and guidance only — not a clinical diagnosis or emergency care.

Topics to track: "symptoms", "sleep", "hydration", "screen_fatigue", "stress_mood", "physical_activity", "student_opinion".
Already covered topics: ${coveredTopics.length > 0 ? coveredTopics.join(", ") : "none yet"}.
Student turns completed so far: ${studentTurnCount}.
Never mention voice playback or claim to speak aloud.`;

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
                  assistantMessage: { type: Type.STRING },
                  suggestedQuickReplies: { type: Type.ARRAY, items: { type: Type.STRING } },
                  coveredTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
                  extractedSleepHours: { type: Type.NUMBER },
                  extractedWaterIntake: { type: Type.INTEGER },
                  extractedStressScore: { type: Type.INTEGER },
                  isComplete: { type: Type.BOOLEAN },
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
      let parsed;
      try {
        parsed = JSON.parse(rawText);
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
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.error, code: formatted.code });
    }
  });

  app.post("/api/survey/finalize", async (req, res) => {
    const body = req.body;
    if (
      !body?.studentProfile?.full_name ||
      !Array.isArray(body.conversationHistory) ||
      body.conversationHistory.length === 0
    ) {
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

    const systemInstruction = `You are a structured Student Wellness & Health Advisor compiling a multilingual consultation transcript into a relational DBMS stress_reports record.
Student: ${studentProfile.full_name} (ID: ${studentProfile.student_id}, Section: ${studentProfile.class_section}, Age: ${studentProfile.age}).
${factorSummary}
Include sleep_hours (2.0-12.0), water_intake (1-20), stress_score (1-10), wellness_index (1-100), student_opinion, ai_assessment, actionable_tips (3-5 coping steps), and disclaimer stating this is wellness monitoring and guidance only, not a clinical diagnosis or emergency medical care.`;

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
                  actionable_tips: { type: Type.ARRAY, items: { type: Type.STRING } },
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
      let parsed;
      try {
        parsed = JSON.parse(rawText);
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
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.error, code: formatted.code });
    }
  });

  app.post("/api/tracker/analyze", async (req, res) => {
    const body = req.body;
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
                  recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
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
      let parsed;
      try {
        parsed = JSON.parse(rawText);
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
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.error, code: formatted.code });
    }
  });

  app.post("/api/guide/ask", async (req, res) => {
    const body = req.body;
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
              systemInstruction:
                "You are a calm, empathetic Doctor-Style Student Health Advisor. Understand ANY world language in the student's query and reply in that SAME language in plain text (no markdown asterisks ** or # headers). Provide structured guidance with clarifyingQuestions, whatToDo, whatToAvoidAndRedFlags, and a clear disclaimer that this is general wellness guidance and not a medical diagnosis.",
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
      let parsed;
      try {
        parsed = JSON.parse(rawText);
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
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.error, code: formatted.code });
    }
  });

  app.post("/api/routine/generate", async (req, res) => {
    const body = req.body;
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
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        throw new Error("Malformed JSON returned from routine builder.");
      }

      const validCategories = new Set(["rest", "hydration", "nutrition", "study", "check"]);
      const blocksRaw = Array.isArray(parsed.blocks) ? parsed.blocks : [];
      const blocks = blocksRaw.slice(0, 6).map((b, idx) => {
        const cat = String(b?.category ?? "rest").toLowerCase();
        return {
          id: `blk-${Date.now()}-${idx}`,
          timeWindow: String(b?.timeWindow ?? `Block ${idx + 1}`),
          activity: String(b?.activity ?? "Rest & Hydration"),
          detail: String(b?.detail ?? "Take slow breaths and drink water."),
          category: validCategories.has(cat) ? cat : "rest",
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
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.error, code: formatted.code });
    }
  });

  // Always return JSON for unknown /api/* routes (never HTML fallback)
  app.all("/api/*", (_req, res) => {
    res.status(404).json({ error: "API route not found.", code: "NOT_FOUND" });
  });

  // Serve built frontend static bundle and safe SPA fallback
  const distDir = path.resolve(__dirname, "dist");
  const indexHtmlPath = path.join(distDir, "index.html");

  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      if (fs.existsSync(indexHtmlPath)) {
        res.sendFile(indexHtmlPath);
      } else {
        res.status(503).send("Frontend build missing. Run `npm run build` first.");
      }
    });
  } else {
    app.get("*", (_req, res) => {
      res
        .status(503)
        .send("Frontend dist/ folder not found. Run `npm run build` before `npm start`.");
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Health AI Monitoring System listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
