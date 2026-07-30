"use client";

import { Loader2 } from "lucide-react";
import {
  CommunityMessengerCallPhoneOutlineIcon,
  CommunityMessengerCallVideoOutlineIcon,
} from "@/components/community-messenger/call-history/CommunityMessengerCallOutlineIcons";

type Props = {
  kind: "voice" | "video";
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  ariaLabel: string;
};

/** 통화 목록 재다이얼 — 탭 시 발신 확인 팝업 */
export function CommunityMessengerCallActionButton({
  kind,
  onPress,
  disabled = false,
  loading = false,
  ariaLabel,
}: Props) {
  const Icon = kind === "video" ? CommunityMessengerCallVideoOutlineIcon : CommunityMessengerCallPhoneOutlineIcon;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled || loading}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled || loading) return;
        onPress();
      }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#00754A] text-white transition-transform duration-[80ms] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00754A]/40 active:scale-[0.93] active:bg-[#006241] disabled:cursor-not-allowed disabled:opacity-50"
      data-cm-call-redial=""
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      ) : (
        <Icon className="h-5 w-5" aria-hidden />
      )}
    </button>
  );
}
