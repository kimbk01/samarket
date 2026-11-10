"use client";

import type { ComponentProps } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerChatsScreen } from "@/components/community-messenger/MessengerChatsScreen";
import type { MessengerArchiveSection } from "@/lib/community-messenger/messenger-ia";
import { messengerArchiveSectionTitleKey } from "@/lib/community-messenger/messenger-archive-route";
import { MessengerRejectedRequestsList } from "@/components/community-messenger/MessengerRejectedRequestsList";
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
  /** 우측·인라인 패널 상단 제목 표시 (휴대폰 하위 화면은 1단 머리글이 제목) */
  showTitle?: boolean;
  /** 「거절한 요청」 해제 — 보관함 첫 화면 개수 다시 맞춤 */
  onRejectedRequestReleased?: (requestId: string) => void;
};

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
  onRejectedRequestReleased,
}: Props) {
  const { t } = useI18n();
  const title = t(messengerArchiveSectionTitleKey(section));
  const titleBar = showTitle ? (
    <div className="shrink-0 border-b border-[color:var(--messenger-divider)] px-3 py-2.5">
      <p className="sam-text-body font-bold" style={{ color: "var(--messenger-text)" }}>
        {title}
      </p>
    </div>
  ) : null;

  if (section === "requests") {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-cm-archive-section={section}>
        {titleBar}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <MessengerRejectedRequestsList onReleased={onRejectedRequestReleased} />
        </div>
      </div>
    );
  }

  if (section === "hidden_friends" || section === "blocked_friends") {
    const entries =
      section === "hidden_friends" ? friendStateModel.hidden : friendStateModel.blocked;
    const onRelease = section === "hidden_friends" ? onToggleHiddenFriend : onToggleBlock;

    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-cm-archive-section={section}>
        {titleBar}
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
      {titleBar}
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
