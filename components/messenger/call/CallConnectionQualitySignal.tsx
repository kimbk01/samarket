"use client";

import type { CallNetworkQualityLevel } from "@/components/messenger/call/call-ui.types";

const BAR_HEIGHTS = [6, 9, 12, 15] as const;

function activeBarCount(level: CallNetworkQualityLevel | null | undefined): number {
  switch (level) {
    case "excellent":
      return 4;
    case "good":
      return 4;
    case "fair":
      return 3;
    case "poor":
      return 2;
    case "lost":
      return 1;
    case "reconnecting":
    case "connecting":
      return 2;
    default:
      return 2;
  }
}

function barTone(level: CallNetworkQualityLevel | null | undefined, index: number, active: number): string {
  if (index >= active) return "bg-[#D4E9E2]/22";
  switch (level) {
    case "lost":
    case "poor":
      return "bg-[#E57373]";
    case "fair":
      return "bg-[#CBA258]";
    case "reconnecting":
    case "connecting":
      return "bg-[#D4E9E2]/72 animate-pulse";
    case "excellent":
    case "good":
    default:
      return "bg-[#00754A]";
  }
}

/** PiP 상단 — 시그널 막대만 (텍스트 없음). */
export function CallConnectionQualitySignal({
  level,
  className = "",
}: {
  level?: CallNetworkQualityLevel | null;
  className?: string;
}) {
  const active = activeBarCount(level);
  const wave = level === "reconnecting";

  return (
    <div
      className={`inline-flex items-end gap-[3px] rounded-full bg-[#003D29]/72 px-2.5 py-1.5 ring-1 ring-[#D4E9E2]/16 backdrop-blur-sm ${className}`.trim()}
      role="status"
      aria-live="polite"
      data-call-quality-level={level ?? "unknown"}
    >
      {BAR_HEIGHTS.map((height, index) => (
        <span
          key={height}
          className={`w-[3px] rounded-full transition-all duration-300 ${barTone(level, index, active)} ${
            wave && index < active ? "animate-[dibay-call-signal-wave_1.1s_ease-in-out_infinite]" : ""
          }`.trim()}
          style={{
            height,
            animationDelay: wave ? `${index * 0.12}s` : undefined,
          }}
          aria-hidden
        />
      ))}
    </div>
  );
}
