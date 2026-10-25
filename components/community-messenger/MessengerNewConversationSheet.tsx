"use client";

import { MessageCircle, Search, UserPlus, Users } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayMenuList } from "@/components/ui/dibay-overlay";
import { MessengerHomeBottomSheetShell, MessengerSheetHeaderBar } from "@/components/community-messenger/MessengerSheetUi";

type Props = {
  onClose: () => void;
  onFriendChatStart: () => void;
  onFriendAdd: () => void;
  onCreateGroup: () => void;
  onFindOpenChat: () => void;
};

/** FAB 등에서 열리는 새 대화 진입 메뉴 — S1 머리 + S3 행동 메뉴(1단계 문서 §13-2) */
export function MessengerNewConversationSheet({
  onClose,
  onFriendChatStart,
  onFriendAdd,
  onCreateGroup,
  onFindOpenChat,
}: Props) {
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
                label: t("cm_ui_start_conversation_with_friend"),
                hint: t("cm_ui_open_profile_then_conversation"),
                onClick: run(onFriendChatStart),
              },
              {
                key: "friend-add",
                icon: <UserPlus />,
                label: t("cm_ui_add_friend"),
                hint: t("cm_ui_search_by_at_id"),
                onClick: run(onFriendAdd),
              },
              {
                key: "group",
                icon: <Users />,
                label: t("cm_ui_create_group"),
                hint: t("cm_ui_private_group_with_selected_friends"),
                onClick: run(onCreateGroup),
              },
              {
                key: "meeting",
                icon: <Search />,
                label: t("cm_ui_find_meeting"),
                hint: t("cm_ui_browse_and_join_community_meetings"),
                onClick: run(onFindOpenChat),
              },
            ],
          ]}
        />
      </div>
    </MessengerHomeBottomSheetShell>
  );
}
