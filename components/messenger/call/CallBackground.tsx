"use client";

import type { ReactNode } from "react";
import type { CallMode, CallPhase } from "./call-ui.types";

/** 음성/대기 공통 — Viber 계열의 딥 퍼플 톤. */
const VOICE_BG =
  "bg-[radial-gradient(ellipse_110%_75%_at_50%_-10%,rgba(255,255,255,0.14),transparent_46%),linear-gradient(180deg,#6b3df1_0%,#5630cb_28%,#34166a_72%,#1a1033_100%)]";

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
