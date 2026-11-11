"use client";

import { useState } from "react";
import { QrCode } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyFriendQrSheet } from "@/components/community-messenger/friend-qr/MyFriendQrSheet";

type Props = {
  /** 보관함(「친구」 묶음 먼저 — 숨긴 친구 · 차단한 친구 · 거절한 요청) 열기 */
  onOpenManage: () => void;
};

const SEARCH_ROW_BUTTON_CLASS =
  "flex h-[38px] shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] text-[14px] font-semibold transition-colors active:bg-[color:var(--messenger-surface-muted)]";

/**
 * 친구 탭 찾기 칸 오른쪽 — [QR 아이콘] · 「관리」 (채팅 시안 4판 「2. 친구 탭」 + QR 친구 시안 3판 2026-11-12).
 * - QR 아이콘 38×38: 「QR 코드」 시트([내 QR | QR 스캔]) — 친구 탭의 QR 진입은 여기 하나 (내 프로필 줄에는 두지 않는다:
 *   버튼 두 개면 좁은 기기에서 이름 칸이 잘림, 시안 3판 계측).
 * - 「관리」: 높이 38 · 둥글기 10 · 테두리 1px · 14px/600. 누르면 보관함 — 예전 「친구 관리」 시트는 보관함으로 합쳤다.
 */
export function MessengerFriendsHeaderActions({ onOpenManage }: Props) {
  const { t } = useI18n();
  const [qrOpen, setQrOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`${SEARCH_ROW_BUTTON_CLASS} w-[38px]`}
        style={{ color: "var(--cm-chat-fg)" }}
        onClick={() => setQrOpen(true)}
        aria-label={t("friend_qr_sheet_title")}
        data-testid="cm-friend-qr-entry"
      >
        <QrCode className="h-5 w-5" strokeWidth={1.8} aria-hidden />
      </button>
      <button
        type="button"
        className={`${SEARCH_ROW_BUTTON_CLASS} px-3`}
        style={{ color: "var(--cm-chat-fg)" }}
        onClick={onOpenManage}
        data-cm-friend-manage-button=""
      >
        {t("cm_friend_manage_button")}
      </button>
      {qrOpen ? <MyFriendQrSheet onClose={() => setQrOpen(false)} /> : null}
    </>
  );
}
