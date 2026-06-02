"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";

type Props = {
  onClose: () => void;
  onFriendChatStart: () => void;
  onFriendAdd: () => void;
  onCreateGroup: () => void;
  onFindOpenChat: () => void;
};

function SheetActionButton({
  label,
  helper,
  meta,
  onClick,
}: {
  label: string;
  helper: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-ui-rect border border-ui-border bg-ui-surface px-4 py-3 text-left"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="sam-text-body font-medium text-ui-fg">{label}</p>
        <span className="rounded-ui-rect border border-ui-border bg-ui-page px-2 py-0.5 sam-text-xxs font-medium text-ui-muted">
          {meta}
        </span>
      </div>
      <p className="mt-1 sam-text-helper text-ui-muted">{helper}</p>
    </button>
  );
}

/** FAB 등에서 열리는 새 대화 진입 메뉴 */
export function MessengerNewConversationSheet({
  onClose,
  onFriendChatStart,
  onFriendAdd,
  onCreateGroup,
  onFindOpenChat,
}: Props) {
  const { t } = useI18n();
  return (
    <MessengerHomeBottomSheetShell
      onClose={onClose}
      closeAriaLabel={t("nav_close")}
      dialogAriaLabel={t("cm_ui_new_conversation")}
      panelClassName="rounded-t-[12px] border-ui-border bg-ui-surface px-4 pb-4 pt-3 shadow-[var(--ui-shadow-card)]"
    >
        <p className="text-center sam-text-body font-semibold text-ui-fg">{t("cm_ui_new_conversation")}</p>
        <p className="mt-3 text-center sam-text-helper text-ui-muted">{t("cm_ui_new_conversation_menu")}</p>
        <div className="mt-4 grid gap-2">
          <SheetActionButton
            label={t("cm_ui_start_conversation_with_friend")}
            helper={t("cm_ui_open_profile_then_conversation")}
            meta="1"
            onClick={() => {
              onClose();
              onFriendChatStart();
            }}
          />
          <SheetActionButton
            label={t("cm_ui_add_friend")}
            helper={t("cm_ui_search_by_at_id")}
            meta="2"
            onClick={() => {
              onClose();
              onFriendAdd();
            }}
          />
          <SheetActionButton
            label={t("cm_ui_create_group")}
            helper={t("cm_ui_private_group_with_selected_friends")}
            meta="3"
            onClick={() => {
              onClose();
              onCreateGroup();
            }}
          />
          <SheetActionButton
            label={t("cm_ui_find_meeting")}
            helper={t("cm_ui_browse_and_join_community_meetings")}
            meta="4"
            onClick={() => {
              onClose();
              onFindOpenChat();
            }}
          />
        </div>
        <button type="button" className="mt-3 w-full py-2 sam-text-body text-ui-muted" onClick={onClose}>
          {t("common_cancel")}
        </button>
    </MessengerHomeBottomSheetShell>
  );
}
