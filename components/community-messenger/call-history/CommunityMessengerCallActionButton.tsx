"use client";

import { Loader2, Phone, Video } from "lucide-react";
import { useMessengerLongPress } from "@/lib/community-messenger/use-messenger-long-press";

type Props = {
  kind: "voice" | "video";
  onLongPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  ariaLabel: string;
};

/** 통화 목록 재다이얼 — 짧은 탭 무시, 롱프레스만 발신 확인으로 연결 */
export function CommunityMessengerCallActionButton({
  kind,
  onLongPress,
  disabled = false,
  loading = false,
  ariaLabel,
}: Props) {
  const { bind, consumeClickSuppression } = useMessengerLongPress(onLongPress, { thresholdMs: 480 });
  const Icon = kind === "video" ? Video : Phone;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled || loading}
      {...bind}
      onClick={(e) => {
        e.stopPropagation();
        if (consumeClickSuppression()) return;
      }}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#006241] text-white transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sam-primary/40 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Icon className="h-5 w-5" aria-hidden />}
    </button>
  );
}
