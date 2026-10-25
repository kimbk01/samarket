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

/**
 * 통화 목록 재다이얼 — 탭 시 발신 확인 팝업.
 * U-8 (1단계 문서 §13-6): 채운 초록 원(하드코딩 색) → 친구·대화 행과 같은 테두리형 40px + 브랜드 토큰.
 * 터치 영역은 바깥 44px 유지. 동작(onPress)은 그대로.
 */
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
      className="group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      data-cm-call-redial=""
    >
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--messenger-primary-soft-2)] bg-[color:var(--messenger-surface)] text-[color:var(--messenger-primary)] transition-transform duration-[80ms] group-focus-visible:ring-2 group-focus-visible:ring-[color:var(--messenger-primary-soft-2)] group-active:scale-[0.93] group-active:bg-[color:var(--messenger-primary-soft)]">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : (
          <Icon className="h-5 w-5" aria-hidden />
        )}
      </span>
    </button>
  );
}
