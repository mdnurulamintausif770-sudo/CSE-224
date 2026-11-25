import { Lock, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { CosmicBackground } from "./CosmicBackground";

interface OrbLauncherProps {
  onLaunchSurvey: () => void;
  onOpenAdminPortal: () => void;
}

export function OrbLauncher({
  onLaunchSurvey,
  onOpenAdminPortal,
}: OrbLauncherProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.03 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="relative min-h-screen w-full overflow-hidden purple-cosmos-bg text-violet-50 flex flex-col"
    >
      <CosmicBackground centerHalo />

      {/* Minimal top bar */}
      <header className="relative z-10 px-6 py-5 flex items-center justify-between gap-4">
        <div className="font-display text-sm font-semibold tracking-tight text-violet-100 whitespace-nowrap">
          Health AI Monitoring System
        </div>

        <button
          type="button"
          onClick={onOpenAdminPortal}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium text-violet-100 bg-[#120926]/85 border border-violet-500/30 hover:border-violet-400/60 hover:text-violet-200 rounded-md transition-colors whitespace-nowrap"
        >
          <Lock className="w-3.5 h-3.5 text-violet-400" aria-hidden="true" />
          <span>Admin Portal</span>
        </button>
      </header>

      {/* Centered Interactive 3D Purple Orb */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-12">
        <div className="flex flex-col items-center text-center max-w-md">
          <div className="relative flex items-center justify-center">
            {/* Outer rotating orbital ring */}
            <div
              aria-hidden="true"
              className="absolute w-64 h-64 sm:w-72 sm:h-72 rounded-full border border-dashed border-violet-400/25 animate-orb-ring"
            />

            {/* Middle hairline halo */}
            <div
              aria-hidden="true"
              className="absolute w-52 h-52 sm:w-56 sm:h-56 rounded-full border border-fuchsia-400/20"
            />

            {/* Interactive 3D Sphere Orb */}
            <motion.button
              type="button"
              onClick={onLaunchSurvey}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              aria-label="Start Health Survey"
              className="group relative w-44 h-44 sm:w-48 sm:h-48 rounded-full flex flex-col items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 cursor-pointer overflow-hidden"
              style={{
                background:
                  "radial-gradient(circle at 32% 28%, rgba(232, 121, 249, 0.38) 0%, rgba(168, 85, 247, 0.28) 34%, rgba(76, 29, 149, 0.85) 72%, rgba(18, 9, 38, 0.98) 100%)",
                boxShadow:
                  "0 0 56px rgba(168, 85, 247, 0.32), 0 18px 36px rgba(9, 5, 20, 0.75), inset 0 2px 18px rgba(245, 208, 254, 0.28), inset 0 -14px 28px rgba(18, 9, 38, 0.75)",
                border: "1px solid rgba(192, 132, 252, 0.5)",
              }}
            >
              <span className="w-11 h-11 rounded-full bg-violet-400/20 border border-violet-300/40 flex items-center justify-center mb-3 group-hover:bg-violet-400/30 transition-colors">
                <Sparkles className="w-5 h-5 text-violet-200" aria-hidden="true" />
              </span>
              <span className="font-display text-sm font-semibold tracking-tight text-white">
                Start Health Survey
              </span>
              <span className="mt-1 text-[11px] text-violet-200/85">
                Tap to Begin
              </span>
            </motion.button>
          </div>

          <h1 className="mt-10 font-display text-xl sm:text-2xl font-semibold text-violet-50 text-balance">
            Health AI Monitoring System
          </h1>
          <p className="mt-2.5 text-sm text-violet-200/75 leading-relaxed">
            Click the orb to enter student details and begin a multilingual health check-in using text or voice-to-text dictation.
          </p>
        </div>
      </main>
    </motion.div>
  );
}
