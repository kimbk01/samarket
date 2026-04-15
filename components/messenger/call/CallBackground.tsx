"use client";

import type { ReactNode } from "react";
import type { CallMode, CallPhase } from "./call-ui.types";

const VOICE_BG =
  "bg-[radial-gradient(circle_at_top,rgba(150,132,255,0.45),transparent_32%),linear-gradient(180deg,#7b63ef_0%,#6557db_28%,#4a56d4_58%,#3a72d4_100%)]";

export function CallBackground({
  mode,
  phase,
  children,
  videoSlot,
  showVideo = false,
}: {
  mode: CallMode;
  phase: CallPhase;
  children?: ReactNode;
  videoSlot?: ReactNode;
  showVideo?: boolean;
}) {
  const voice = mode === "voice" || !showVideo;
  return (
    <div className={`absolute inset-0 overflow-hidden ${voice ? VOICE_BG : "bg-black"}`}>
      {!voice ? (
        <>
          <div className="absolute inset-0">{videoSlot}</div>
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.22)_0%,rgba(0,0,0,0.08)_24%,rgba(0,0,0,0.48)_100%)]" />
          <div className="absolute inset-0 backdrop-blur-[1px]" />
        </>
      ) : (
        <>
          <div className="absolute inset-x-0 top-0 h-[36%] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.16),transparent_62%)]" />
          <div className="absolute inset-x-0 bottom-0 h-[28%] bg-[linear-gradient(180deg,transparent,rgba(6,16,51,0.18))]" />
        </>
      )}
      {phase === "connecting" ? (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_52%)]" />
      ) : null}
      {children}
    </div>
  );
}
