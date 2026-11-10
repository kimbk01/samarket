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
  /** §17-4 R-3: 흐린 모양만(누름은 onPress 로 — 호출부가 이유 안내) */
  dimmed?: boolean;
  loading?: boolean;
  ariaLabel: string;
};

/**
 * 통화 목록 재다이얼 — 탭 시 발신 확인 팝업.
 * 채팅 시안 4판 「3. 통화 탭」 (2026-11-10): 원 테두리 없이 24px 초록 아이콘(브랜드 토큰) — 모든 줄 같은 자리.
 * 터치 영역은 바깥 44px 유지. 동작(onPress)은 그대로. 다시 걸 수 없으면 `disabled`(흐림).
 */
export function CommunityMessengerCallActionButton({
  kind,
  onPress,
  disabled = false,
  dimmed = false,
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
      aria-disabled={dimmed || undefined}
      className={`group -mr-3 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${dimmed ? "opacity-40" : ""}`}
      data-cm-call-redial=""
      data-cm-call-unavailable={dimmed ? "1" : undefined}
    >
      <span className="inline-flex h-6 w-6 items-center justify-center text-[color:var(--sam-primary)] transition-transform duration-[80ms] group-focus-visible:ring-2 group-focus-visible:ring-[color:var(--messenger-primary-soft-2)] group-active:scale-[0.9]">
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        ) : (
          <Icon className="h-6 w-6" aria-hidden />
        )}
      </span>
    </button>
  );
}
