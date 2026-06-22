"use client";

import type { ReactNode } from "react";

/** 백그라운드·Dock·minimized PiP — 상대/본인 50:50 분할 (in-call 보조 PiP 와 별개) */
export function CallBackgroundSplitPreview({
  remoteSlot,
  localSlot,
  className = "",
}: {
  remoteSlot: ReactNode;
  localSlot: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid h-full w-full grid-cols-2 grid-rows-1 overflow-hidden bg-black ${className}`.trim()}
    >
      <div className="relative min-h-0 min-w-0 overflow-hidden [&_video]:h-full [&_video]:w-full [&_video]:object-cover">
        {remoteSlot}
      </div>
      <div className="relative min-h-0 min-w-0 overflow-hidden border-l border-white/10 [&_video]:h-full [&_video]:w-full [&_video]:object-cover">
        {localSlot}
      </div>
    </div>
  );
}

/** Dock 썸네일용 작은 반반 분할 */
export function CallDockSplitThumb({
  remoteSlot,
  localSlot,
}: {
  remoteSlot: ReactNode;
  localSlot: ReactNode;
}) {
  return (
    <div className="grid h-11 w-[5.5rem] shrink-0 grid-cols-2 overflow-hidden rounded-ui-rect bg-[#003D29] ring-1 ring-[#D4E9E2]/22">
      <div className="relative min-h-0 min-w-0 overflow-hidden [&_video]:h-full [&_video]:w-full [&_video]:object-cover">
        {remoteSlot}
      </div>
      <div className="relative min-h-0 min-w-0 overflow-hidden border-l border-[#D4E9E2]/16 [&_video]:h-full [&_video]:w-full [&_video]:object-cover">
        {localSlot}
      </div>
    </div>
  );
}
