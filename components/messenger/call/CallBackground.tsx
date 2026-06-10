"use client";

import type { ReactNode } from "react";
import type { CallMode, CallPhase } from "./call-ui.types";

/** 음성/대기 공통 — Viber 계열의 딥 퍼플 톤. */
const VOICE_BG =
  "bg-[radial-gradient(ellipse_110%_75%_at_50%_-10%,rgba(255,255,255,0.14),transparent_46%),linear-gradient(180deg,#6b3df1_0%,#5630cb_28%,#34166a_72%,#1a1033_100%)]";
const STARBUCKS_BG =
  "bg-[radial-gradient(ellipse_110%_75%_at_50%_-10%,rgba(212,233,226,0.28),transparent_48%),linear-gradient(180deg,#00754A_0%,#006241_44%,#003D29_100%)]";

export function CallBackground({
  mode,
  phase,
  children,
  videoSlot,
  showVideo = false,
  theme,
}: {
  mode: CallMode;
  phase: CallPhase;
  children?: ReactNode;
  videoSlot?: ReactNode;
  showVideo?: boolean;
  theme?: "starbucks";
}) {
  const voice = mode === "voice" || !showVideo;
  const starbucks = theme === "starbucks";
  return (
    <div className={`absolute inset-0 overflow-hidden ${starbucks ? STARBUCKS_BG : voice ? VOICE_BG : "bg-black"}`}>
      {!voice ? (
        <>
          <div className="absolute inset-0">{videoSlot}</div>
          <div
            className={
              starbucks
                ? "absolute inset-0 bg-[linear-gradient(180deg,rgba(0,61,41,0.2)_0%,rgba(0,117,74,0.08)_24%,rgba(0,61,41,0.62)_100%)]"
                : "absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.22)_0%,rgba(0,0,0,0.08)_24%,rgba(0,0,0,0.48)_100%)]"
            }
          />
        </>
      ) : (
        <>
          <div
            className={
              starbucks
                ? "absolute inset-x-0 top-0 h-[36%] bg-[radial-gradient(circle_at_center,rgba(212,233,226,0.26),transparent_62%)]"
                : "absolute inset-x-0 top-0 h-[36%] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.16),transparent_62%)]"
            }
          />
          <div
            className={
              starbucks
                ? "absolute inset-x-0 bottom-0 h-[28%] bg-[linear-gradient(180deg,transparent,rgba(0,61,41,0.28))]"
                : "absolute inset-x-0 bottom-0 h-[28%] bg-[linear-gradient(180deg,transparent,rgba(6,16,51,0.18))]"
            }
          />
        </>
      )}
      {phase === "connecting" ? (
        <div
          className={
            starbucks
              ? "absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,233,226,0.14),transparent_52%)]"
              : "absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_52%)]"
          }
        />
      ) : null}
      {children}
    </div>
  );
}
