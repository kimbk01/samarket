"use client";

import type { CallOverlayBackdropMode } from "@/lib/community-messenger/call-video-layout";
import { MESSENGER_CALL_GRADIENT_SURFACE } from "@/lib/community-messenger/messenger-call-gradient";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

const STARBUCKS_VOICE_GRADIENT =
  "bg-[radial-gradient(ellipse_110%_75%_at_50%_-10%,rgba(212,233,226,0.28),transparent_48%),linear-gradient(180deg,#00754A_0%,#006241_44%,#003D29_100%)]";
const DEFAULT_VOICE_GRADIENT =
  "bg-[radial-gradient(ellipse_110%_75%_at_50%_-10%,rgba(255,255,255,0.14),transparent_46%),linear-gradient(180deg,#6b3df1_0%,#5630cb_28%,#34166a_72%,#1a1033_100%)]";

type Props = {
  mode: CallOverlayBackdropMode;
  peerAvatarUrl?: string | null;
  peerLabel?: string;
  theme?: "starbucks";
};

/**
 * 통화 풀스크린 오버레이 배경 — 상대 아바타 blur/dim 또는 tone gradient.
 * WebView 에서 이전 화면 캡처 대신 avatar·gradient fallback.
 */
export function CallOverlayBackdrop({ mode, peerAvatarUrl, peerLabel, theme }: Props) {
  const isStarbucks = theme === "starbucks";
  const dimClass =
    mode === "remote-video-dim"
      ? isStarbucks
        ? "bg-[linear-gradient(180deg,rgba(0,61,41,0.38)_0%,rgba(0,61,41,0.12)_40%,rgba(0,61,41,0.52)_100%)]"
        : "bg-[linear-gradient(180deg,rgba(0,0,0,0.32)_0%,rgba(0,0,0,0.08)_42%,rgba(0,0,0,0.48)_100%)]"
      : isStarbucks
        ? "bg-[linear-gradient(180deg,rgba(0,61,41,0.62)_0%,rgba(0,45,31,0.48)_38%,rgba(0,30,20,0.72)_100%)]"
        : "bg-[linear-gradient(180deg,rgba(0,0,0,0.58)_0%,rgba(0,0,0,0.42)_40%,rgba(0,0,0,0.68)_100%)]";

  const gradientFallback =
    mode === "voice-gradient"
      ? isStarbucks
        ? STARBUCKS_VOICE_GRADIENT
        : DEFAULT_VOICE_GRADIENT
      : MESSENGER_CALL_GRADIENT_SURFACE;

  const showPeerBlur = Boolean(peerAvatarUrl?.trim()) && mode !== "voice-gradient";

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      {showPeerBlur ? (
        <div className="absolute inset-0 scale-110 overflow-hidden">
          <SamarketThumbnail
            src={peerAvatarUrl!}
            alt=""
            fill
            priority
            roundedClassName="rounded-none"
            className="absolute inset-0"
            imageClassName="scale-110 object-cover blur-2xl brightness-[0.72] saturate-[1.08]"
          />
        </div>
      ) : (
        <div className={`absolute inset-0 ${gradientFallback}`} />
      )}
      <div className={`absolute inset-0 backdrop-blur-xl ${dimClass}`} />
      {!showPeerBlur && peerLabel?.trim() ? (
        <div
          className={`absolute inset-0 flex items-center justify-center opacity-[0.07] ${
            isStarbucks ? "text-[#F1F8F4]" : "text-white"
          }`}
        >
          <span className="select-none text-[min(42vw,12rem)] font-bold uppercase tracking-tight">
            {(() => {
              const t = peerLabel.trim();
              const first = [...t][0];
              return first && first !== " " ? first.toUpperCase() : "?";
            })()}
          </span>
        </div>
      ) : null}
    </div>
  );
}
