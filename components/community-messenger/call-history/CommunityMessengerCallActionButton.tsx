"use client";

import { Loader2 } from "lucide-react";
import {
  CommunityMessengerCallPhoneOutlineIcon,
  CommunityMessengerCallVideoOutlineIcon,
} from "@/components/community-messenger/call-history/CommunityMessengerCallOutlineIcons";
import { CallRipple } from "@/components/messenger/call/CallRipple";
import { triggerCallHaptic } from "@/components/messenger/call/CallHapticController";

type Props = {
  kind: "voice" | "video";
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  ariaLabel: string;
};

/** 통화 목록 재다이얼 — kind 확정 버튼은 확인 없이 즉시 발신 */
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
      onPointerDown={() => triggerCallHaptic("selection")}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled || loading) return;
        onPress();
      }}
      className="relative inline-flex h-[52px] min-h-[52px] w-[52px] min-w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#00754A] text-white shadow-[0_4px_16px_rgba(0,0,0,0.15)] transition-[background,box-shadow,transform] duration-[180ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:bg-[#006241] hover:shadow-[0_8px_24px_rgba(0,117,74,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00754A]/40 active:scale-[0.93] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <CallRipple />
      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      ) : (
        <Icon className="h-6 w-6" aria-hidden />
      )}
    </button>
  );
}
