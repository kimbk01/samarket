"use client";

import { getAppSettings } from "@/lib/app-settings";
import {
  mannerBatteryAccentClass,
  mannerBatteryTier,
  mannerRawToPercent,
} from "@/lib/trust/manner-battery";
import { MannerBatteryIcon } from "./MannerBatteryIcon";

interface MannerBatteryDisplayProps {
  /** profiles.manner_score / temperature / mannerTemp 등 원시 값 */
  raw: number;
  /** 운영설정 라벨 대신 강제 */
  label?: string;
  size?: "sm" | "md";
  /** 작은 캡션 (게시글 상단 프로필 등) */
  layout?: "inline" | "stacked";
  className?: string;
}

export function MannerBatteryDisplay({
  raw,
  label,
  size = "md",
  layout = "stacked",
  className = "",
}: MannerBatteryDisplayProps) {
  const percent = mannerRawToPercent(raw);
  const tier = mannerBatteryTier(percent);
  const accent = mannerBatteryAccentClass(tier);
  const displayLabel = label ?? getAppSettings().speedDisplayLabel ?? "배터리";

  if (layout === "inline") {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <MannerBatteryIcon tier={tier} percent={percent} size={size === "sm" ? "sm" : "md"} />
        <span className={`text-[15px] font-bold tabular-nums ${accent}`}>{percent}%</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-end gap-0.5 ${className}`}>
      <MannerBatteryIcon tier={tier} percent={percent} size={size === "sm" ? "sm" : "md"} />
      <span className={`text-[15px] font-bold tabular-nums ${accent}`}>{percent}%</span>
      <p className="text-[10px] text-sam-muted">{displayLabel}</p>
    </div>
  );
}

/** 한 줄: 아이콘 + 퍼센트 + 라벨(옵션) */
export function MannerBatteryInline({
  raw,
  showLabel = true,
  size = "sm",
  align = "start",
  className = "",
}: {
  raw: number;
  showLabel?: boolean;
  size?: "sm" | "md";
  align?: "start" | "end";
  className?: string;
}) {
  const percent = mannerRawToPercent(raw);
  const tier = mannerBatteryTier(percent);
  const accent = mannerBatteryAccentClass(tier);
  const displayLabel = getAppSettings().speedDisplayLabel ?? "배터리";
  const textAlign = align === "end" ? "text-right" : "text-left";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <MannerBatteryIcon tier={tier} percent={percent} size={size} />
      <div className={`min-w-0 ${textAlign}`}>
        {showLabel ? (
          <p className="text-[10px] leading-tight text-sam-muted">{displayLabel}</p>
        ) : null}
        <p className={`text-[14px] font-bold tabular-nums leading-tight ${accent}`}>{percent}%</p>
      </div>
    </div>
  );
}
