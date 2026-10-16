"use client";

import type { ComponentProps } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerChatsScreen } from "@/components/community-messenger/MessengerChatsScreen";
import type { MessengerArchiveSection } from "@/lib/community-messenger/messenger-ia";
import { MessengerPrivacyPeopleList } from "@/components/community-messenger/MessengerPrivacyPeopleList";
import type { MessengerPrivacyListsStatus } from "@/lib/community-messenger/home/use-community-messenger-home-bootstrap";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";

type ChatsProps = Omit<
  ComponentProps<typeof MessengerChatsScreen>,
  "items" | "showFilters" | "emptyMessage" | "listContext"
>;

type Props = {
  section: MessengerArchiveSection;
  archivedItems: UnifiedRoomListItem[];
  mutedItems: UnifiedRoomListItem[];
  friendStateModel: MessengerFriendStateModel;
  busyId: string | null;
  onToggleHiddenFriend: (userId: string) => void;
  onToggleBlock: (userId: string) => void;
  privacyListsStatus: MessengerPrivacyListsStatus;
  onRetryPrivacyLists: () => void;
  chatsProps: ChatsProps;
  /** 시트/우측 패널 상단 제목 표시 */
  showTitle?: boolean;
};

export function archiveSectionTitleKey(
  section: MessengerArchiveSection
): "cm_ui_hidden_friends" | "cm_ui_blocked_friends" | "cm_ui_notifications_off" | "cm_ui_archived_chats" | "nav_messenger_archive" {
  switch (section) {
    case "hidden_friends":
      return "cm_ui_hidden_friends";
    case "blocked_friends":
      return "cm_ui_blocked_friends";
    case "muted_chats":
      return "cm_ui_notifications_off";
    case "archived_chats":
      return "cm_ui_archived_chats";
    default:
      return "nav_messenger_archive";
  }
}

/**
 * 보관함 서브섹션 본문 — 모바일 시트 / 태블릿 우측 / list-only 인라인 공유.
 */
export function MessengerArchiveSectionPanel({
  section,
  archivedItems,
  mutedItems,
  friendStateModel,
  busyId,
  onToggleHiddenFriend,
  onToggleBlock,
  privacyListsStatus,
  onRetryPrivacyLists,
  chatsProps,
  showTitle = true,
}: Props) {
  const { t } = useI18n();
  const title = t(archiveSectionTitleKey(section));

  if (section === "hidden_friends" || section === "blocked_friends") {
    const entries =
      section === "hidden_friends" ? friendStateModel.hidden : friendStateModel.blocked;
    const onRelease = section === "hidden_friends" ? onToggleHiddenFriend : onToggleBlock;

    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-cm-archive-section={section}>
        {showTitle ? (
          <div className="shrink-0 border-b border-[color:var(--messenger-divider)] px-3 py-2.5">
            <p className="sam-text-body font-bold" style={{ color: "var(--messenger-text)" }}>
              {title}
            </p>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <MessengerPrivacyPeopleList
            kind={section === "hidden_friends" ? "hidden" : "blocked"}
            people={entries.map((entry) => entry.profile)}
            status={privacyListsStatus}
            busyId={busyId}
            onRelease={onRelease}
            onRetry={onRetryPrivacyLists}
          />
        </div>
      </div>
    );
  }

  const isMuted = section === "muted_chats";
  const chatItems = isMuted ? mutedItems : archivedItems;
  const emptyMessage = isMuted
    ? t("cm_ui_no_muted_conversations")
    : t("cm_ui_archived_conversations_empty");

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-cm-archive-section={section}>
      {showTitle ? (
        <div className="shrink-0 border-b border-[color:var(--messenger-divider)] px-3 py-2.5">
          <p className="sam-text-body font-bold" style={{ color: "var(--messenger-text)" }}>
            {title}
          </p>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <MessengerChatsScreen
          {...chatsProps}
          items={chatItems}
          emptyMessage={emptyMessage}
          showFilters={false}
          listContext="archive"
        />
      </div>
    </div>
  );
}
