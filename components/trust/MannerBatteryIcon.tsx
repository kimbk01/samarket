"use client";

import type { MannerBatteryTier } from "@/lib/trust/manner-battery";
import { MANNER_BATTERY_TIER_COLORS, mannerBatteryFilledSegments } from "@/lib/trust/manner-battery";

const W = 18;
const H = 40;
const SEGMENTS = 6;

interface MannerBatteryIconProps {
  tier: MannerBatteryTier;
  percent: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * 6분할 세로 배터리 — 아래칸부터 tier(1~6)만큼 채움
 */
export function MannerBatteryIcon({ tier, percent, size = "md", className }: MannerBatteryIconProps) {
  const scale = size === "sm" ? 0.82 : size === "lg" ? 1.45 : 1;
  const fillN = mannerBatteryFilledSegments(tier);
  const fill = MANNER_BATTERY_TIER_COLORS[tier];

  const inner = { x: 3.5, y: 6.5, w: 11, h: 28 };
  const gap = 0.65;
  const barH = (inner.h - gap * (SEGMENTS - 1)) / SEGMENTS;

  return (
    <svg
      width={W * scale}
      height={H * scale}
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      aria-hidden
    >
      <title>{`배터리 ${percent}%`}</title>
      <rect x={6} y={0} width={6} height={3} rx={1} className="fill-gray-700" />
      <rect
        x={1}
        y={4}
        width={16}
        height={35}
        rx={3}
        className="fill-gray-50 stroke-gray-600"
        strokeWidth={1.1}
      />
      {Array.from({ length: SEGMENTS }, (_, j) => {
        const fromBottom = SEGMENTS - 1 - j;
        const filled = fromBottom < fillN;
        const y = inner.y + j * (barH + gap);
        return (
          <rect
            key={j}
            x={inner.x}
            y={y}
            width={inner.w}
            height={barH}
            rx={0.9}
            fill={filled ? fill : "#E5E7EB"}
          />
        );
      })}
    </svg>
  );
}
