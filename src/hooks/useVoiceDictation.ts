import { useCallback, useEffect, useRef, useState } from "react";
import { isCancelledError, safeFetchJson } from "../utils/safeFetch";

interface BrowserSpeechRecognitionAlternative {
  transcript: string;
}

interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: BrowserSpeechRecognitionAlternative;
}

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: BrowserSpeechRecognitionResult;
  };
}

interface BrowserSpeechRecognitionErrorEvent {
  error?: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((ev: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

export type DictationStatus = "idle" | "listening_speech" | "listening_mic" | "transcribing";

export const DICTATION_LANGUAGES: Array<{ id: string; label: string }> = [
  { id: "auto", label: "Auto (Any Language)" },
  { id: "en-US", label: "English" },
  { id: "es-ES", label: "Español" },
  { id: "bn-BD", label: "বাংলা" },
  { id: "hi-IN", label: "हिन्दी" },
  { id: "ar-SA", label: "العربية" },
  { id: "fr-FR", label: "Français" },
  { id: "de-DE", label: "Deutsch" },
  { id: "pt-BR", label: "Português" },
  { id: "ja-JP", label: "日本語" },
  { id: "zh-CN", label: "中文" },
  { id: "ko-KR", label: "한국어" },
];

function isEmbeddedIframe(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function getSpeechRecognitionCtor(): BrowserSpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: BrowserSpeechRecognitionCtor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

function selectSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = result.indexOf(",");
      if (commaIdx === -1) {
        reject(new Error("Unable to encode recorded audio."));
        return;
      }
      resolve(result.slice(commaIdx + 1));
    };
    reader.onerror = () => reject(new Error("Failed to read recorded audio."));
    reader.readAsDataURL(blob);
  });
}

export function useVoiceDictation(params: {
  getText: () => string;
  setText: (next: string | ((prev: string) => string)) => void;
}) {
  const { getText, setText } = params;
  const [dictationLang, setDictationLang] = useState("auto");
  const [dictationStatus, setDictationStatus] = useState<DictationStatus>("idle");
  const [dictationNotice, setDictationNotice] = useState<{
    message: string;
    showOpenInNewTab: boolean;
  } | null>(null);

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speechRecUnavailableRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const shouldTranscribeRef = useRef(true);
  const dictationTimerRef = useRef<number | null>(null);
  const baseDraftRef = useRef("");
  const isMountedRef = useRef(true);

  const releaseDictationMediaStream = useCallback(() => {
    const stream = mediaStreamRef.current;
    mediaStreamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore track stop error
        }
      }
    }
  }, []);

  const stopDictation = useCallback(
    (processRecordedAudio = false) => {
      if (dictationTimerRef.current !== null) {
        window.clearTimeout(dictationTimerRef.current);
        dictationTimerRef.current = null;
      }

      const rec = recognitionRef.current;
      if (rec) {
        recognitionRef.current = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        try {
          rec.stop();
        } catch {
          // ignore stop failure
        }
      }

      shouldTranscribeRef.current = processRecordedAudio;
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          mediaRecorderRef.current = null;
          releaseDictationMediaStream();
          if (isMountedRef.current) setDictationStatus("idle");
        }
      } else {
        mediaRecorderRef.current = null;
        releaseDictationMediaStream();
        if (isMountedRef.current && !processRecordedAudio) {
          setDictationStatus("idle");
        }
      }
    },
    [releaseDictationMediaStream]
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopDictation(false);
    };
  }, [stopDictation]);

  const transcribeDictatedAudio = useCallback(
    async (audioBlob: Blob, mimeType: string) => {
      if (!isMountedRef.current) return;
      if (audioBlob.size < 400) {
        setDictationStatus("idle");
        setDictationNotice({
          message: "Recording was too brief. Speak clearly or continue typing below.",
          showOpenInNewTab: false,
        });
        return;
      }

      setDictationStatus("transcribing");
      setDictationNotice(null);

      try {
        const audioBase64 = await blobToBase64(audioBlob);
        const selectedLabel =
          DICTATION_LANGUAGES.find((l) => l.id === dictationLang)?.label ?? "auto";
        const data = await safeFetchJson<{
          heardSpeech?: boolean;
          transcript?: string;
        }>("/api/voice/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          timeoutMs: 14000,
          body: JSON.stringify({
            audioBase64,
            mimeType,
            languageHint: dictationLang === "auto" ? "auto" : selectedLabel,
          }),
        });

        if (!isMountedRef.current) return;

        const text = typeof data.transcript === "string" ? data.transcript.trim() : "";
        if (!data.heardSpeech || !text) {
          setDictationNotice({
            message: "No clear speech was detected. Tap Voice Typing to try again or type below.",
            showOpenInNewTab: false,
          });
          return;
        }

        setText((prev) => {
          const cleanPrev = prev.trimEnd();
          return cleanPrev ? `${cleanPrev} ${text}` : text;
        });
      } catch (err: unknown) {
        if (isCancelledError(err) || !isMountedRef.current) return;
        const msg = err instanceof Error ? err.message.trim() : "";
        setDictationNotice({
          message:
            msg && !msg.includes("HTML")
              ? `${msg} You can still type and send normally below.`
              : "Voice dictation couldn't transcribe right now. You can type and send normally below.",
          showOpenInNewTab: false,
        });
      } finally {
        if (isMountedRef.current) {
          setDictationStatus("idle");
        }
      }
    },
    [dictationLang, setText]
  );

  const startMediaRecorderDictation = useCallback(async () => {
    if (!isMountedRef.current) return;
    setDictationNotice(null);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setDictationStatus("idle");
      setDictationNotice({
        message:
          "Microphone dictation is unavailable in this browser context. You can continue typing in any language below.",
        showOpenInNewTab: isEmbeddedIframe(),
      });
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setDictationStatus("idle");
      const errName = err instanceof Error ? err.name : "";
      const insideIframe = isEmbeddedIframe();
      if (
        errName === "SecurityError" ||
        errName === "NotAllowedError" ||
        errName === "PermissionDeniedError"
      ) {
        setDictationNotice({
          message: insideIframe
            ? "Microphone access is blocked inside this embedded preview frame. Open the app in a new tab for voice dictation, or continue typing below."
            : "Microphone permission was denied. Allow microphone access in browser settings or continue typing below.",
          showOpenInNewTab: insideIframe,
        });
      } else {
        setDictationNotice({
          message: "Could not access a microphone right now. You can continue typing below.",
          showOpenInNewTab: insideIframe,
        });
      }
      return;
    }

    if (!isMountedRef.current) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }

    mediaStreamRef.current = stream;
    const preferredMime = selectSupportedAudioMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);
    } catch {
      recorder = new MediaRecorder(stream);
    }

    recordedChunksRef.current = [];
    shouldTranscribeRef.current = true;

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        recordedChunksRef.current.push(ev.data);
      }
    };

    recorder.onstop = () => {
      const chunks = recordedChunksRef.current;
      recordedChunksRef.current = [];
      mediaRecorderRef.current = null;
      releaseDictationMediaStream();
      if (dictationTimerRef.current !== null) {
        window.clearTimeout(dictationTimerRef.current);
        dictationTimerRef.current = null;
      }

      if (!shouldTranscribeRef.current || !isMountedRef.current) {
        if (isMountedRef.current) setDictationStatus("idle");
        return;
      }

      const finalMime = recorder.mimeType || preferredMime || "audio/webm";
      const audioBlob = new Blob(chunks, { type: finalMime });
      void transcribeDictatedAudio(audioBlob, finalMime);
    };

    dictationTimerRef.current = window.setTimeout(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        stopDictation(true);
      }
    }, 30000);

    mediaRecorderRef.current = recorder;
    setDictationStatus("listening_mic");
    recorder.start(250);
  }, [releaseDictationMediaStream, stopDictation, transcribeDictatedAudio]);

  const toggleDictation = useCallback(() => {
    if (dictationStatus === "transcribing") return;

    if (dictationStatus === "listening_speech") {
      stopDictation(false);
      setDictationStatus("idle");
      return;
    }

    if (dictationStatus === "listening_mic") {
      stopDictation(true);
      return;
    }

    setDictationNotice(null);

    const SpeechCtor = getSpeechRecognitionCtor();
    if (!SpeechCtor || speechRecUnavailableRef.current) {
      void startMediaRecorderDictation();
      return;
    }

    try {
      const recognition = new SpeechCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang =
        dictationLang === "auto" ? navigator.language || "en-US" : dictationLang;

      baseDraftRef.current = getText().trimEnd();
      let finalSegment = "";

      recognition.onresult = (ev) => {
        let interimSegment = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const piece = ev.results[i]?.[0]?.transcript ?? "";
          if (ev.results[i]?.isFinal) {
            finalSegment += `${piece} `;
          } else {
            interimSegment += piece;
          }
        }
        const spoken = `${finalSegment}${interimSegment}`.trim();
        const combined = baseDraftRef.current
          ? spoken
            ? `${baseDraftRef.current} ${spoken}`
            : baseDraftRef.current
          : spoken;
        setText(combined);
      };

      recognition.onerror = (ev) => {
        const errCode = ev.error ?? "";
        recognitionRef.current = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;

        if (
          errCode === "network" ||
          errCode === "service-not-allowed" ||
          errCode === "language-not-supported"
        ) {
          speechRecUnavailableRef.current = true;
          void startMediaRecorderDictation();
          return;
        }

        if (isMountedRef.current) {
          setDictationStatus("idle");
        }

        if (errCode === "not-allowed" || errCode === "audio-capture") {
          const insideIframe = isEmbeddedIframe();
          setDictationNotice({
            message: insideIframe
              ? "Microphone access is blocked inside this embedded preview frame. Open the app in a new tab for voice dictation, or continue typing below."
              : "Microphone permission was denied. Allow microphone access in browser settings or continue typing below.",
            showOpenInNewTab: insideIframe,
          });
        } else if (errCode === "no-speech") {
          setDictationNotice({
            message: "No speech detected. Tap Voice Typing to try again or type below.",
            showOpenInNewTab: false,
          });
        }
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        if (isMountedRef.current) {
          setDictationStatus((prev) => (prev === "listening_speech" ? "idle" : prev));
        }
      };

      recognitionRef.current = recognition;
      setDictationStatus("listening_speech");
      recognition.start();
    } catch {
      speechRecUnavailableRef.current = true;
      void startMediaRecorderDictation();
    }
  }, [dictationLang, dictationStatus, getText, setText, startMediaRecorderDictation, stopDictation]);

  return {
    dictationLang,
    setDictationLang,
    dictationStatus,
    dictationNotice,
    setDictationNotice,
    toggleDictation,
    stopDictation,
  };
}
