"use client";

import type { ReactNode } from "react";
import { Phone } from "lucide-react";

export function CallHeader({
  onBack,
  backLabel = "뒤로",
  trailing,
  topLabel,
  onTopLabelClick,
}: {
  onBack?: (() => void) | null;
  backLabel?: string;
  trailing?: ReactNode;
  topLabel?: string | null;
  onTopLabelClick?: (() => void) | null;
}) {
  const chip =
    topLabel == null || topLabel === "" ? null : onTopLabelClick ? (
      <button
        type="button"
        onClick={onTopLabelClick}
        className="rounded-full bg-white/12 px-3 py-1.5 text-[12px] font-medium text-white/90 backdrop-blur-sm transition active:scale-[0.98]"
      >
        {topLabel}
      </button>
    ) : (
      <div className="rounded-full bg-white/12 px-3 py-1.5 text-[12px] font-medium text-white/90 backdrop-blur-sm">{topLabel}</div>
    );

  return (
    <div className="relative z-[2] flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))]">
      <div className="min-w-[72px]">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-11 items-center gap-1 rounded-full px-2 text-[15px] font-medium text-white/95 transition active:scale-[0.98]"
          >
            {/* 아이콘은 lucide 단일 세트만: 뒤로는 텍스트/전화 아이콘으로 통일 */}
            <Phone size={20} />
            <span>{backLabel}</span>
          </button>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-2">
        {chip}
        {trailing}
      </div>
    </div>
  );
}
