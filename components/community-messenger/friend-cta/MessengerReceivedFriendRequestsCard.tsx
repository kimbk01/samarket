"use client";

import { ChevronRight, Clock, UserPlus } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";

type Props = {
  /** 대기 요청 (1건 이상일 때만 렌더) */
  requests: CommunityMessengerFriendRequest[];
  onOpen: () => void;
  /** received: 받은 요청(브랜드 강조 · 「확인」) · sent: 보낸 요청(시계 타일 · 「수락 대기 n」 칩) — D-9 */
  variant?: "received" | "sent";
};

/**
 * 친구 탭 요약 블록 — 친구 행과 구분(1단계 문서 §13-3 U-1):
 * 친구 행 = 바탕 그대로·구분선만 / 요약 블록 = 카드 + 그림자 + 왼쪽 아이콘 타일 40px.
 * 받은 요청 = 초록 연한 바탕 + 「확인」 주 버튼. 보낸 요청 = 시계 타일 + 상태 칩 + ›. 카드 전체가 눌림 영역.
 */
export function MessengerReceivedFriendRequestsCard({ requests, onOpen, variant = "received" }: Props) {
  const { t } = useI18n();
  if (requests.length === 0) return null;
  const sent = variant === "sent";
  const peerLabel = (req: CommunityMessengerFriendRequest) => (sent ? req.addresseeLabel : req.requesterLabel);
  const first = requests[0];
  const names =
    requests.length === 1
      ? peerLabel(first)
      : t("cm_friend_received_card_names", { name: peerLabel(first), count: requests.length - 1 });

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-ui-rect border px-3 py-3 text-left shadow-[var(--overlay-elevation-1)] transition-[transform,filter] duration-100 active:scale-[0.99] active:brightness-95 ${
        sent
          ? "border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)]"
          : "border-[color:var(--messenger-primary-soft-2)] bg-[color:var(--messenger-primary-soft)]"
      }`}
      data-cm-friend-received-card={sent ? undefined : ""}
      data-cm-friend-sent-card={sent ? "" : undefined}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-rect ${
          sent
            ? "bg-[color:var(--messenger-surface-muted)] text-[color:var(--messenger-text-secondary)]"
            : "bg-[color:var(--messenger-primary)] text-[color:var(--sam-text-on-primary)]"
        }`}
        aria-hidden
      >
        {sent ? <Clock className="h-5 w-5" strokeWidth={2} /> : <UserPlus className="h-5 w-5" strokeWidth={2} />}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block sam-text-body font-semibold ${sent ? "" : "text-[color:var(--messenger-primary)]"}`}
          style={sent ? { color: "var(--messenger-text)" } : undefined}
        >
          {sent ? t("cm_friend_sent_card_heading") : t("cm_friend_received_card_heading")}
          {sent ? null : ` ${requests.length}`}
        </span>
        <span className="block truncate sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
          {names}
        </span>
      </span>
      {sent ? (
        <>
          <span className="shrink-0 rounded-full bg-[color:var(--sam-warning-soft)] px-2 py-0.5 sam-text-helper font-semibold text-[color:var(--sam-warning)]">
            {t("cm_friend_sent_card_chip", { count: requests.length })}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--messenger-text-secondary)]" strokeWidth={2} aria-hidden />
        </>
      ) : (
        <span className="shrink-0 rounded-ui-rect bg-[color:var(--messenger-primary)] px-3 py-1.5 sam-text-helper font-semibold text-[color:var(--sam-text-on-primary)]">
          {t("cm_friend_received_card_action")}
        </span>
      )}
    </button>
  );
}
