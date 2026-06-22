"use client";

import { Phone, PhoneOff } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  INCOMING_CALL_BANNER_ACCEPT_CLASS,
  INCOMING_CALL_BANNER_BG_CLASS,
  INCOMING_CALL_BANNER_BORDER_CLASS,
  INCOMING_CALL_BANNER_DECLINE_CLASS,
  triggerIncomingCallBannerHaptic,
} from "@/lib/community-messenger/call-ui/incoming-call-banner-tokens";
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
  onExpand: () => void;
  onReject: () => void;
  onAccept: () => void;
  onBlock?: () => void;
};

/** Foreground 수신 — [아바타][이름+종류][거절][수락] compact top pill (앱 밖 native pill 과 동일). */
export function IncomingCallBanner(props: IncomingCallBannerProps) {
  const { t, safeT } = useI18n();
  const {
    peerLabel,
    peerAvatarUrl,
    callKind = "voice",
    busyReject,
    busyAccept,
    onExpand,
    onReject,
    onAccept,
  } = props;

  const callTypeLabel =
    callKind === "video"
      ? safeT("cm_ui_incoming_video_ringing", {
          fallbackKo: "영상 통화",
          fallbackEn: "Video call",
        })
      : safeT("cm_ui_incoming_voice_ringing", {
          fallbackKo: "음성 통화",
          fallbackEn: "Voice call",
        });

  const handleReject = () => {
    triggerIncomingCallBannerHaptic(10);
    onReject();
  };

  const handleAccept = () => {
    triggerIncomingCallBannerHaptic(14);
    onAccept();
  };

  return (
    <div
      className={`pointer-events-auto fixed inset-x-0 top-[max(8px,var(--safe-top,env(safe-area-inset-top)))] ${MESSENGER_FOREGROUND_INCOMING_BANNER_Z_CLASS} animate-dibay-incoming-pill-enter px-3 sm:left-1/2 sm:right-auto sm:w-[min(520px,calc(100vw-2rem))] sm:-translate-x-1/2`}
      role="dialog"
      aria-label={t("cm_ui_incoming_call_dialog")}
      data-incoming-call-compact-banner
    >
      <div
        className={`mx-auto flex h-[72px] max-w-[520px] items-center gap-2.5 rounded-[20px] border px-3 shadow-[0_14px_44px_rgba(0,0,0,0.34)] sm:h-[76px] ${INCOMING_CALL_BANNER_BG_CLASS} ${INCOMING_CALL_BANNER_BORDER_CLASS}`}
      >
        <button
          type="button"
          onClick={onExpand}
          className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-[16px] px-0.5 py-1 text-left transition-transform active:scale-[0.99]"
          aria-label={t("cm_ui_open_call_screen")}
        >
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F2F2F7] ring-1 ring-white/15">
            <SamarketThumbnail
              src={peerAvatarUrl}
              fill
              roundedClassName="rounded-full"
              className="bg-[#F2F2F7]"
              fallbackSrc=""
              fallbackNode={<span className="sam-text-page-title font-semibold text-[#3A3A3C]">{peerInitial(peerLabel)}</span>}
            />
          </div>
          <div className="min-w-0">
            <p className="truncate sam-text-body font-semibold leading-tight text-white">{peerLabel}</p>
            <p className="mt-0.5 truncate sam-text-helper font-medium text-white/65">{callTypeLabel}</p>
          </div>
        </button>
        <button
          type="button"
          disabled={busyReject || busyAccept}
          onClick={handleReject}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94] disabled:opacity-40 ${INCOMING_CALL_BANNER_DECLINE_CLASS}`}
          aria-label={t("cm_ui_reject")}
          data-incoming-call-decline
        >
          <PhoneOff size={22} strokeWidth={2.4} />
        </button>
        <button
          type="button"
          disabled={busyAccept}
          onClick={handleAccept}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94] disabled:opacity-40 ${INCOMING_CALL_BANNER_ACCEPT_CLASS}`}
          aria-label={t("cm_ui_accept")}
          data-incoming-call-accept
        >
          <Phone size={22} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
