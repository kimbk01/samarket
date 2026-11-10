"use client";

import { MessageCircle, Users } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayMenuList } from "@/components/ui/dibay-overlay";
import { MessengerHomeBottomSheetShell, MessengerSheetHeaderBar } from "@/components/community-messenger/MessengerSheetUi";

type Props = {
  onClose: () => void;
  onFriendChatStart: () => void;
  onCreateGroup: () => void;
};

/**
 * 대화 탭 「새 대화」 메뉴 — 1:1 대화 · 그룹 대화 두 가지만 (Owner 2026-11-10 채팅 화면 시안 3판).
 * 친구 추가는 친구 탭 「친구 추가」 칸, 모임 찾기는 설정 시트에 있다.
 */
export function MessengerNewConversationSheet({ onClose, onFriendChatStart, onCreateGroup }: Props) {
  const { t } = useI18n();
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <MessengerHomeBottomSheetShell
      onClose={onClose}
      closeAriaLabel={t("nav_close")}
      dialogAriaLabel={t("cm_ui_new_conversation")}
    >
      <MessengerSheetHeaderBar title={t("cm_ui_new_conversation")} onClose={onClose} closeLabel={t("nav_close")} />
      <div className="px-4 pb-[max(1rem,var(--safe-bottom))]">
        <DibayMenuList
          groups={[
            [
              {
                key: "friend-chat",
                icon: <MessageCircle />,
                label: t("cm_ui_new_conversation_direct"),
                hint: t("cm_ui_new_conversation_direct_hint"),
                onClick: run(onFriendChatStart),
              },
              {
                key: "group",
                icon: <Users />,
                label: t("cm_ui_new_conversation_group"),
                hint: t("cm_ui_new_conversation_group_hint"),
                onClick: run(onCreateGroup),
              },
            ],
          ]}
        />
      </div>
    </MessengerHomeBottomSheetShell>
  );
}
