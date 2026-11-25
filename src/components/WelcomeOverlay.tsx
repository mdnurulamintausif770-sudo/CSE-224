import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

interface WelcomeOverlayProps {
  onComplete: () => void;
}

const WELCOME_HEADLINE = "Welcome to Health AI Monitoring System";
const WELCOME_SUBTITLE = "Student Wellness & Stress Intelligence";
const CHAR_INTERVAL_MS = 40;
const PAUSE_AFTER_TYPING_MS = 420;
const DISSOLVE_DURATION_MS = 600;

export function WelcomeOverlay({ onComplete }: WelcomeOverlayProps) {
  const [charCount, setCharCount] = useState(0);
  const [typingDone, setTypingDone] = useState(false);
  const [isDissolving, setIsDissolving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    let intervalId: number | undefined;
    let pauseTimerId: number | undefined;
    let dissolveTimerId: number | undefined;

    if (prefersReducedMotion) {
      setCharCount(WELCOME_HEADLINE.length);
      setTypingDone(true);
      pauseTimerId = window.setTimeout(() => {
        if (cancelled) return;
        setIsDissolving(true);
        dissolveTimerId = window.setTimeout(() => {
          if (!cancelled) onComplete();
        }, 250);
      }, 300);

      return () => {
        cancelled = true;
        if (pauseTimerId !== undefined) window.clearTimeout(pauseTimerId);
        if (dissolveTimerId !== undefined) window.clearTimeout(dissolveTimerId);
      };
    }

    setCharCount(0);
    setTypingDone(false);
    setIsDissolving(false);

    let currentCount = 0;
    intervalId = window.setInterval(() => {
      if (cancelled) return;
      currentCount += 1;
      setCharCount(currentCount);

      if (currentCount >= WELCOME_HEADLINE.length) {
        if (intervalId !== undefined) {
          window.clearInterval(intervalId);
          intervalId = undefined;
        }
        setTypingDone(true);

        pauseTimerId = window.setTimeout(() => {
          if (cancelled) return;
          setIsDissolving(true);

          dissolveTimerId = window.setTimeout(() => {
            if (!cancelled) {
              onComplete();
            }
          }, DISSOLVE_DURATION_MS);
        }, PAUSE_AFTER_TYPING_MS);
      }
    }, CHAR_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalId !== undefined) window.clearInterval(intervalId);
      if (pauseTimerId !== undefined) window.clearTimeout(pauseTimerId);
      if (dissolveTimerId !== undefined) window.clearTimeout(dissolveTimerId);
    };
  }, [onComplete]);

  const typedText = WELCOME_HEADLINE.slice(0, charCount);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Health AI Monitoring System"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center px-6 bg-[#090514]/55 transition-all duration-[600ms] ease-out ${
        isDissolving
          ? "backdrop-blur-none opacity-0 pointer-events-none"
          : "backdrop-blur-lg opacity-100 pointer-events-auto"
      }`}
    >
      {/* Subtle Skip Button for immediate entry */}
      <button
        type="button"
        onClick={onComplete}
        aria-label="Skip welcome animation"
        className="absolute top-5 right-6 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-200/85 hover:text-white bg-[#120926]/70 border border-violet-400/30 hover:border-fuchsia-300/60 rounded-md transition-colors"
      >
        <span>Skip</span>
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      {/* Center Typewriter Lockup */}
      <div className="max-w-3xl text-center space-y-4 select-none">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#140A29]/80 border border-purple-400/35 text-[11px] font-medium text-violet-200/90 shadow-[0_0_20px_rgba(168,85,247,0.22)]">
          <Sparkles className="w-3.5 h-3.5 text-fuchsia-300" aria-hidden="true" />
          <span>Health AI Portal</span>
        </div>

        <h1 className="font-display text-2xl sm:text-4xl md:text-[2.65rem] font-semibold tracking-tight text-violet-50 leading-tight drop-shadow-[0_0_24px_rgba(192,132,252,0.35)]">
          <span>{typedText}</span>
          <span
            aria-hidden="true"
            className="inline-block w-[2.5px] h-[0.95em] ml-1.5 align-middle bg-fuchsia-300 shadow-[0_0_10px_rgba(240,171,252,0.9)] animate-typewriter-cursor"
          />
        </h1>

        <p
          className={`text-sm sm:text-base text-violet-200/85 tracking-wide transition-all duration-300 ease-out ${
            typingDone ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1.5"
          }`}
        >
          {WELCOME_SUBTITLE}
        </p>
      </div>
    </div>
  );
}
