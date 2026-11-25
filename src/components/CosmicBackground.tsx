import { motion } from "motion/react";

const AMBIENT_PARTICLES = [
  { id: 1, left: "14%", top: "22%", delay: 0, duration: 9.5, size: "w-1 h-1" },
  { id: 2, left: "84%", top: "18%", delay: 1.4, duration: 10.5, size: "w-1.5 h-1.5" },
  { id: 3, left: "22%", top: "78%", delay: 2.3, duration: 11.0, size: "w-1 h-1" },
  { id: 4, left: "78%", top: "74%", delay: 0.9, duration: 9.8, size: "w-1 h-1" },
  { id: 5, left: "48%", top: "12%", delay: 1.8, duration: 12.0, size: "w-1 h-1" },
  { id: 6, left: "10%", top: "54%", delay: 2.8, duration: 11.2, size: "w-1.5 h-1.5" },
  { id: 7, left: "90%", top: "48%", delay: 1.5, duration: 10.2, size: "w-1 h-1" },
];

interface CosmicBackgroundProps {
  centerHalo?: boolean;
}

export function CosmicBackground({ centerHalo = false }: CosmicBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden z-0"
    >
      {/* Subtle drifting hairline grid synced with active tab theme */}
      <div
        className={`absolute -inset-12 animate-grid-drift opacity-75 ${
          centerHalo ? "tab-bg-grid-center" : "tab-bg-grid"
        }`}
      />

      {/* Calm ambient glows driven by --tab-primary-rgb / --tab-secondary-rgb */}
      <div className="absolute -top-32 -left-24 w-[480px] h-[480px] rounded-full opacity-45 tab-bg-orb-1" />
      <div className="absolute -bottom-32 -right-24 w-[520px] h-[520px] rounded-full opacity-40 tab-bg-orb-2" />

      {centerHalo && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] rounded-full animate-orb-pulse tab-bg-center-halo" />
      )}

      {/* Subtle slow drifting ambient particles */}
      {AMBIENT_PARTICLES.map((p) => (
        <motion.span
          key={p.id}
          style={{ left: p.left, top: p.top }}
          animate={{
            y: [-10, 10, -10],
            opacity: [0.14, 0.42, 0.14],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className={`absolute rounded-full tab-particle ${p.size}`}
        />
      ))}
    </div>
  );
}
