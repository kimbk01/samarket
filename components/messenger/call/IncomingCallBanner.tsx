"use client";

import { Phone, PhoneOff, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { computeIncomingRingRemainingSeconds } from "@/lib/community-messenger/messenger-call-ring-timeout";
import { MESSENGER_FOREGROUND_INCOMING_BANNER_Z_CLASS } from "@/lib/community-messenger/incoming-call-surface";

function peerInitial(label: string): string {
  const t = label.trim();
  return [...t][0] ?? "?";
}

export type IncomingCallBannerProps = {
  sessionId: string;
  peerLabel: string;
  peerAvatarUrl?: string | null;
  callKind?: "voice" | "video";
  startedAt?: string | null;
  ringTimeoutSeconds?: number | null;
  busyReject: boolean;
  busyAccept: boolean;
  showStrangerHint?: boolean;
  busyBlock?: boolean;
  onExpand?: () => void;
  onReject: () => void;
  onAccept: () => void;
  onBlock?: () => void;
};

function remainingSeconds(startedAt: string | null | undefined, timeoutSeconds: number | null | undefined): number | null {
  return computeIncomingRingRemainingSeconds(startedAt, timeoutSeconds);
}

/** Foreground 수신 통화 — 카카오톡/텔레그램식 compact 상단 배너. */
export function IncomingCallBanner(props: IncomingCallBannerProps) {
  const { t, safeT } = useI18n();
  const {
    sessionId,
    peerLabel,
    peerAvatarUrl,
    callKind = "voice",
    startedAt,
    ringTimeoutSeconds,
    busyReject,
    busyAccept,
    showStrangerHint = false,
    busyBlock = false,
    onExpand,
    onReject,
    onAccept,
    onBlock,
  } = props;
  const [remainSec, setRemainSec] = useState<number | null>(() => remainingSeconds(startedAt, ringTimeoutSeconds));
  useEffect(() => {
    setRemainSec(remainingSeconds(startedAt, ringTimeoutSeconds));
    if (!startedAt || ringTimeoutSeconds == null || ringTimeoutSeconds <= 0) return;
    const id = window.setInterval(() => {
      setRemainSec(remainingSeconds(startedAt, ringTimeoutSeconds));
    }, 1000);
    return () => window.clearInterval(id);
  }, [ringTimeoutSeconds, sessionId, startedAt]);

  const Icon = callKind === "video" ? Video : Phone;

  const callerBody = (
    <>
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F1F8F4] text-[#006241] ring-1 ring-white/20">
        <SamarketThumbnail
          src={peerAvatarUrl}
          fill
          roundedClassName="rounded-full"
          className="bg-[#F1F8F4]"
          fallbackSrc=""
          fallbackNode={<span className="sam-text-page-title font-semibold">{peerInitial(peerLabel)}</span>}
        />
        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#0EA75A] text-white ring-2 ring-[#102017]">
          <Icon size={12} strokeWidth={2.6} />
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate sam-text-body font-semibold leading-tight text-white">{peerLabel}</p>
        {showStrangerHint ? (
          <p className="mt-0.5 truncate sam-text-xxs font-medium text-amber-200/90">
            {t("cm_social_stranger_incoming_call")}
          </p>
        ) : null}
        <p className={`truncate sam-text-helper font-medium text-white/78 ${showStrangerHint ? "mt-0.5" : "mt-0.5"}`}>
          {callKind === "video"
            ? safeT("cm_ui_dibay_video_call_brand", {
                fallbackKo: "DiBay 영상 통화",
                fallbackEn: "DiBay video call",
              })
            : safeT("cm_ui_dibay_voice_call_brand", {
                fallbackKo: "DiBay 음성 통화",
                fallbackEn: "DiBay voice call",
              })}
          {remainSec != null ? ` · ${t("cm_ui_ring_remaining_seconds", { count: remainSec })}` : ""}
        </p>
      </div>
    </>
  );

  return (
    <div
      className={`pointer-events-auto fixed inset-x-0 top-[max(8px,var(--safe-top))] ${MESSENGER_FOREGROUND_INCOMING_BANNER_Z_CLASS} animate-dibay-incoming-pill-enter px-3 sm:left-1/2 sm:right-auto sm:w-[min(520px,calc(100vw-2rem))] sm:-translate-x-1/2`}
      role="dialog"
      aria-label={t("cm_ui_incoming_call_dialog")}
    >
      <div className="mx-auto flex h-[72px] max-w-[520px] items-center gap-2 rounded-[22px] border border-white/12 bg-[linear-gradient(135deg,rgba(16,24,39,0.96)_0%,rgba(3,77,52,0.96)_100%)] px-3 shadow-[0_14px_44px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:h-[80px]">
        {onExpand ? (
          <button
            type="button"
            onClick={onExpand}
            className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-[18px] px-1 py-1 text-left transition active:scale-[0.99]"
            aria-label={t("cm_ui_open_call_screen")}
          >
            {callerBody}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-[18px] px-1 py-1">
            {callerBody}
          </div>
        )}
        <button
          type="button"
          disabled={busyReject || busyAccept}
          onClick={onReject}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#EF1035] text-white shadow-[0_10px_22px_rgba(239,16,53,0.28)] transition active:scale-[0.96] disabled:opacity-40"
          aria-label={t("cm_ui_reject")}
        >
          <PhoneOff size={24} strokeWidth={2.4} />
        </button>
        {onBlock ? (
          <button
            type="button"
            disabled={busyBlock || busyReject || busyAccept}
            onClick={onBlock}
            className="flex h-10 shrink-0 items-center justify-center rounded-full border border-white/20 px-2.5 sam-text-xxs font-semibold text-white/90 disabled:opacity-40"
            aria-label={t("cm_social_block")}
          >
            {t("cm_social_block")}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busyAccept}
          onClick={onAccept}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#22C55E] text-white shadow-[0_10px_22px_rgba(34,197,94,0.28)] transition active:scale-[0.96] disabled:opacity-40"
          aria-label={t("cm_ui_accept")}
        >
          <Phone size={24} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
