"use client";

import type { ReactNode } from "react";
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

  if (!onBack && chip == null && (trailing == null || trailing === false)) {
    return null;
  }

  return (
    <div className="relative z-[2] flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))]">
      <div className="min-w-[72px]">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-11 items-center gap-0.5 rounded-full px-2 text-[15px] font-medium text-white/95 drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)] transition active:scale-[0.98]"
          >
            <span className="pb-0.5 text-[26px] font-light leading-none">‹</span>
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
