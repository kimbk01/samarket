"use client";

import {
  CommunityMessengerCallPhoneOutlineIcon,
  CommunityMessengerCallVideoOutlineIcon,
} from "@/components/community-messenger/call-history/CommunityMessengerCallOutlineIcons";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { isCallLogMissedDisplayType } from "@/lib/community-messenger/call-log-row-copy";
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallLogDisplayType,
} from "@/lib/community-messenger/types";

const STARBUCKS_GREEN = "#006241";
const MISSED_RED = "#E53935";
const MUTED_GRAY = "#6B7280";

type Props = {
  callKind: CommunityMessengerCallKind;
  displayType: CommunityMessengerCallLogDisplayType;
  isOutgoing: boolean;
};

/** 통화 목록 — 해당 통화 종류(음성/영상) 아이콘만 표시(비클릭). */
export function CommunityMessengerCallDirectionIcon({ callKind, displayType, isOutgoing }: Props) {
  const { safeT } = useI18n();
  const isMissed = isCallLogMissedDisplayType(displayType);
  const muted = displayType === "cancelled" || displayType === "rejected" || displayType === "failed";
  const iconColor = isMissed ? MISSED_RED : muted ? MUTED_GRAY : STARBUCKS_GREEN;

  const kindLabel =
    callKind === "video"
      ? safeT("cm_ui_dibay_video_call_brand", {
          fallbackKo: "DiBay 영상 통화",
          fallbackEn: "DiBay video call",
        })
      : safeT("cm_ui_dibay_voice_call_brand", {
          fallbackKo: "DiBay 음성 통화",
          fallbackEn: "DiBay voice call",
        });
  const directionLabel = isOutgoing
    ? safeT("cm_call_direction_outgoing", { fallbackKo: "발신", fallbackEn: "Outgoing" })
    : safeT("cm_call_direction_incoming", { fallbackKo: "수신", fallbackEn: "Incoming" });
  const ariaLabel = `${directionLabel} · ${kindLabel}`;

  const Icon =
    callKind === "video" ? CommunityMessengerCallVideoOutlineIcon : CommunityMessengerCallPhoneOutlineIcon;

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{ color: iconColor }}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </span>
  );
}
