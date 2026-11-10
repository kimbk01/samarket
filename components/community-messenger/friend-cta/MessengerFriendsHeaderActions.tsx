"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = {
  /** 보관함(「친구」 묶음 먼저 — 숨긴 친구 · 차단한 친구 · 거절한 요청) 열기 */
  onOpenManage: () => void;
};

/**
 * 친구 탭 찾기 칸 오른쪽 「관리」 글자 버튼 (채팅 시안 4판 「2. 친구 탭」, Owner 「정확히 시안대로」 2026-11-10).
 * 높이 38 · 둥글기 10 · 테두리 1px · 14px/600. 누르면 보관함 — 예전 「친구 관리」 시트는 보관함으로 합쳤다.
 */
export function MessengerFriendsHeaderActions({ onOpenManage }: Props) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="flex h-[38px] shrink-0 items-center rounded-[10px] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-3 text-[14px] font-semibold transition-colors active:bg-[color:var(--messenger-surface-muted)]"
      style={{ color: "var(--cm-chat-fg)" }}
      onClick={onOpenManage}
      data-cm-friend-manage-button=""
    >
      {t("cm_friend_manage_button")}
    </button>
  );
}
