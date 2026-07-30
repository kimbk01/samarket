"use client";

import type { MutableRefObject } from "react";
import { memo } from "react";
import type { MessengerChatListVisual, MessengerMenuAnchorRect } from "@/components/community-messenger/MessengerChatListItem";
import { MessengerChatsScreen, MessengerOpenChatScreen } from "@/components/community-messenger/MessengerChatsScreen";
import { MessengerArchiveScreen } from "@/components/community-messenger/MessengerArchiveScreen";
import { MessengerCallLogsPanel } from "@/components/community-messenger/MessengerCallLogsPanel";
import { MessengerFriendsScreen } from "@/components/community-messenger/MessengerFriendsScreen";
import { MessengerHomeInlineFriendSearch } from "@/components/community-messenger/MessengerHomeInlineFriendSearch";
import { MessengerHomeSectionTabs } from "@/components/community-messenger/MessengerHomeSectionTabs";
import { MessengerHomeSectionTransition } from "@/components/community-messenger/MessengerHomeSectionTransition";
import {
  inboxKindToChatListChip,
  messengerChatListEmptyMessageForChip,
  type MessengerArchiveSection,
  type MessengerChatInboxFilter,
  type MessengerChatKindFilter,
  type MessengerChatListChip,
  type MessengerChatListContext,
  type MessengerMainSection,
} from "@/lib/community-messenger/messenger-ia";
import type { CommunityMessengerProfileLite, CommunityMessengerRoomSummary, CommunityMessengerCallLog } from "@/lib/community-messenger/types";
import type { MessengerCallLogsStartDirectCallFn } from "@/components/community-messenger/MessengerCallLogsPanel";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";
import type {
  MessengerPillarSummary,
  UnifiedRoomListItem,
} from "@/lib/community-messenger/use-community-messenger-home-state";
import type { MessengerResetTransientUiFn } from "@/lib/community-messenger/messenger-reset-transient-ui";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";
import { MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";

type Props = {
  mainSection: MessengerMainSection;
  openedSwipeItemId: string | null;
  openedMenuItemId: string | null;
  friendQuickMenuBlocksTabSwipeRef: MutableRefObject<boolean>;
  messengerOverlayGeneration: number;
  selectedArchiveSection: MessengerArchiveSection | null;
  pendingCallTarget: string | null;
  isScrolling: boolean;
  onResetTransientUi: MessengerResetTransientUiFn;
  onListScrollStart: () => void;
  onOpenMenuItem: (id: string) => void;
  onCloseMenuItem: (id?: string) => void;
  onOpenSwipeItem: (id: string | null) => void;
  onSelectArchiveSection: (section: MessengerArchiveSection | null) => void;
  me: CommunityMessengerProfileLite | null;
  viewerUserId?: string | null;
  sortedFriends: CommunityMessengerProfileLite[];
  friendSortEpochMs: number;
  friendStateModel: MessengerFriendStateModel;
  busyId: string | null;
  onOpenFriendsPrivacySummary: () => void;
  onOpenProfile: (profile: CommunityMessengerProfileLite) => void;
  onToggleFavoriteFriend: (userId: string) => void;
  onFriendSwipeHide: (userId: string) => void;
  onFriendSwipeRemove: (userId: string) => void;
  onFriendSwipeBlock: (userId: string) => void;
  onFriendRowChat: (userId: string) => void;
  onFriendRowVoiceCall: (userId: string) => void;
  onFriendRowVideoCall: (userId: string) => void;
  getFriendDirectRoomMuted: (userId: string) => boolean | undefined;
  getFriendDirectRoomKind: (userId: string) => "trade" | "delivery" | null;
  friendNotificationsBusy: (userId: string) => boolean;
  onFriendToggleRoomMute: (userId: string) => void;
  friendHasDirectRoom: (userId: string) => boolean;
  primaryListItems: UnifiedRoomListItem[];
  /** 알림 끔 대화 — 보관함 muted_chats 전용 */
  mutedListItems: UnifiedRoomListItem[];
  favoriteFriendIds: Set<string>;
  savedFriendIds?: Set<string>;
  onTogglePin: (room: CommunityMessengerRoomSummary) => void;
  onToggleMute: (room: CommunityMessengerRoomSummary) => void;
  onMarkRead: (room: CommunityMessengerRoomSummary) => void;
  onToggleArchive: (room: CommunityMessengerRoomSummary) => void;
  onLeaveRoom: (room: CommunityMessengerRoomSummary) => void;
  onOpenRoomActions?: (
    item: UnifiedRoomListItem,
    listContext: MessengerChatListContext,
    anchorRect: MessengerMenuAnchorRect | null
  ) => void;
  chatInboxFilter: MessengerChatInboxFilter;
  chatKindFilter: MessengerChatKindFilter;
  onChatListChipChange: (next: MessengerChatListChip) => void;
  openChatJoinedItems: UnifiedRoomListItem[];
  onOpenGroupCreate: () => void;
  /** 인박스로 들어올 때 받은 `?from=...` */
  entryOriginQuery?: string | null;
  /** 인박스 상단 거래·배달 묶음 행 — pillar 서브 라우트에서는 null */
  pillarSummaries?: { trade: MessengerPillarSummary; delivery: MessengerPillarSummary } | null;
  /** 거래 서브라우트(`/trade-chats`) — `listVisual="trade"` */
  chatListVisual?: MessengerChatListVisual;
  bootstrapCalls?: CommunityMessengerCallLog[];
  callsHydrating?: boolean;
  onStartDirectCall?: MessengerCallLogsStartDirectCallFn;
  onBootstrapCallsChange?: (calls: CommunityMessengerCallLog[]) => void;
  showSectionTabs?: boolean;
  onPrimarySectionChange?: (next: MessengerMainSection) => void;
  /** hub MasterDetail 우측이 보관함 detail 을 담당 */
  archiveDetailExternal?: boolean;
};

export const MessengerHomeMainSections = memo(function MessengerHomeMainSections({
  mainSection,
  openedSwipeItemId,
  openedMenuItemId,
  friendQuickMenuBlocksTabSwipeRef,
  messengerOverlayGeneration,
  selectedArchiveSection,
  pendingCallTarget,
  isScrolling,
  onResetTransientUi,
  onListScrollStart,
  onOpenMenuItem,
  onCloseMenuItem,
  onOpenSwipeItem,
  onSelectArchiveSection,
  me,
  viewerUserId = null,
  sortedFriends,
  friendSortEpochMs,
  friendStateModel,
  busyId,
  onOpenFriendsPrivacySummary,
  onOpenProfile,
  onToggleFavoriteFriend,
  onFriendSwipeHide,
  onFriendSwipeRemove,
  onFriendSwipeBlock,
  onFriendRowChat,
  onFriendRowVoiceCall,
  onFriendRowVideoCall,
  getFriendDirectRoomMuted,
  getFriendDirectRoomKind,
  friendNotificationsBusy,
  onFriendToggleRoomMute,
  friendHasDirectRoom,
  primaryListItems,
  mutedListItems,
  favoriteFriendIds,
  savedFriendIds,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onToggleArchive,
  onLeaveRoom,
  onOpenRoomActions,
  chatInboxFilter,
  chatKindFilter,
  onChatListChipChange,
  openChatJoinedItems,
  onOpenGroupCreate,
  entryOriginQuery = null,
  pillarSummaries = null,
  chatListVisual = "default",
  bootstrapCalls = [],
  callsHydrating = false,
  onStartDirectCall,
  onBootstrapCallsChange,
  showSectionTabs = false,
  onPrimarySectionChange,
  archiveDetailExternal = false,
}: Props) {
  /** Mount-only inset on scrollport — never coupled to scroll-hide. */
  const bottomNavOccupiesClearance = useBottomNavOccupiesClearance();
  const listScrollInsetClass = bottomNavOccupiesClearance
    ? MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS
    : "";
  const chatListChip = inboxKindToChatListChip(chatInboxFilter, chatKindFilter);
  const showInlineFriendSearch =
    mainSection === "friends" ||
    mainSection === "call_logs" ||
    mainSection === "chats" ||
    mainSection === "archive";

  return (
    <section
      data-cm-messenger-main
      className="flex min-h-0 min-w-0 flex-1 flex-col space-y-0"
    >
      <div
        className="z-20 shrink-0 space-y-2 bg-[color:var(--messenger-bg,#fff)]"
        data-messenger-hub-sticky-chrome=""
      >
        {showSectionTabs && onPrimarySectionChange ? (
          <MessengerHomeSectionTabs
            mainSection={mainSection}
            onPrimarySectionChange={onPrimarySectionChange}
            onOpenGroupCreate={onOpenGroupCreate}
          />
        ) : null}
        {showInlineFriendSearch ? (
          <div
            className={
              showSectionTabs
                ? "box-border pb-1 pl-[max(0.75rem,var(--safe-left))] pr-[max(0.75rem,var(--safe-right))]"
                : "px-0 pb-1"
            }
          >
            <MessengerHomeInlineFriendSearch busyId={busyId} onSelectUser={onFriendRowChat} />
          </div>
        ) : null}
      </div>
      <div
        className={`min-h-0 min-w-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto overscroll-contain ${showSectionTabs ? "px-0" : "px-3"} ${listScrollInsetClass}`}
        data-messenger-hub-list-scroll=""
        data-cm-list-scroll-bottom-inset={bottomNavOccupiesClearance ? "1" : "0"}
        data-messenger-scrolling={isScrolling ? "true" : "false"}
        data-messenger-pending-call={pendingCallTarget ? "true" : "false"}
        onPointerDownCapture={(e) => {
          const target = e.target;
          if (!(target instanceof Element)) return;
          if (target.closest("[data-messenger-chat-row='true']")) return;
          if (target.closest("[data-call-log-row='true']")) return;
          if (target.closest("[data-messenger-friend-row='true']")) return;
          if (target.closest("[data-messenger-friend-quick-popup='true']")) return;
          if (target.closest("[data-call-log-delete-action='true']")) return;
          onResetTransientUi();
        }}
      >
        <MessengerHomeSectionTransition section={mainSection}>
        {mainSection === "friends" ? (
          <MessengerFriendsScreen
            me={me}
            sortedFriends={sortedFriends}
            friendListEpochMs={friendSortEpochMs}
            friendStateModel={friendStateModel}
            busyId={busyId}
            onOpenPrivacySummary={onOpenFriendsPrivacySummary}
            onOpenProfile={onOpenProfile}
            onToggleFavorite={onToggleFavoriteFriend}
            onFriendHide={onFriendSwipeHide}
            onFriendRemove={onFriendSwipeRemove}
            onFriendBlock={onFriendSwipeBlock}
            onFriendChat={onFriendRowChat}
            onFriendVoiceCall={onFriendRowVoiceCall}
            onFriendVideoCall={onFriendRowVideoCall}
            getFriendDirectRoomMuted={getFriendDirectRoomMuted}
            getFriendDirectRoomKind={getFriendDirectRoomKind}
            friendNotificationsBusy={friendNotificationsBusy}
            onFriendToggleRoomMute={onFriendToggleRoomMute}
            friendHasDirectRoom={friendHasDirectRoom}
            pendingCallTarget={pendingCallTarget}
            openedSwipeItemId={openedSwipeItemId}
            onOpenSwipeItem={onOpenSwipeItem}
            onCloseMenuItem={onCloseMenuItem}
            onResetTransientUi={onResetTransientUi}
            messengerOverlayGeneration={messengerOverlayGeneration}
            friendQuickMenuBlocksTabSwipeRef={friendQuickMenuBlocksTabSwipeRef}
            isScrolling={isScrolling}
          />
        ) : null}

        {mainSection === "chats" ? (
          <MessengerChatsScreen
            items={primaryListItems}
            viewerUserId={viewerUserId}
            favoriteFriendIds={favoriteFriendIds}
            savedFriendIds={savedFriendIds}
            busyId={busyId}
            onTogglePin={onTogglePin}
            onToggleMute={onToggleMute}
            onMarkRead={onMarkRead}
            onToggleArchive={onToggleArchive}
            onLeaveRoom={onLeaveRoom}
            onOpenRoomActions={onOpenRoomActions}
            chatListChip={chatListChip}
            onChatListChipChange={onChatListChipChange}
            emptyMessage={messengerChatListEmptyMessageForChip(chatListChip)}
            showFilters={false}
            openedSwipeItemId={openedSwipeItemId}
            onOpenSwipeItem={onOpenSwipeItem}
            onCloseMenuItem={onCloseMenuItem}
            onResetTransientUi={onResetTransientUi}
            onListScrollStart={onListScrollStart}
            pillarSummaries={pillarSummaries}
            entryOriginQuery={entryOriginQuery}
            chatListVisual={chatListVisual}
          />
        ) : null}

        {mainSection === "open_chat" ? (
          <MessengerOpenChatScreen
            joinedItems={openChatJoinedItems}
            viewerUserId={viewerUserId}
            favoriteFriendIds={favoriteFriendIds}
            savedFriendIds={savedFriendIds}
            busyId={busyId}
            onTogglePin={onTogglePin}
            onToggleMute={onToggleMute}
            onMarkRead={onMarkRead}
            onToggleArchive={onToggleArchive}
            onLeaveRoom={onLeaveRoom}
            onOpenGroupCreate={onOpenGroupCreate}
            onOpenRoomActions={onOpenRoomActions}
            openedSwipeItemId={openedSwipeItemId}
            onOpenSwipeItem={onOpenSwipeItem}
            onCloseMenuItem={onCloseMenuItem}
            onResetTransientUi={onResetTransientUi}
            onListScrollStart={onListScrollStart}
          />
        ) : null}

        {mainSection === "call_logs" ? (
          <div className="pt-1">
            <MessengerCallLogsPanel
              seedCalls={bootstrapCalls}
              callsHydrating={callsHydrating}
              entryOrigin={entryOriginQuery}
              viewerUserId={viewerUserId}
              peerProfiles={sortedFriends}
              onStartDirectCall={onStartDirectCall}
              onBootstrapCallsChange={onBootstrapCallsChange}
              openedSwipeItemId={openedSwipeItemId}
              onOpenSwipeItem={onOpenSwipeItem}
              messengerOverlayGeneration={messengerOverlayGeneration}
              onListScrollStart={onListScrollStart}
            />
          </div>
        ) : null}

        {mainSection === "archive" ? (
          <MessengerArchiveScreen
            items={primaryListItems}
            mutedItems={mutedListItems}
            friendStateModel={friendStateModel}
            onToggleHiddenFriend={onFriendSwipeHide}
            onToggleBlock={onFriendSwipeBlock}
            viewerUserId={viewerUserId}
            favoriteFriendIds={favoriteFriendIds}
            savedFriendIds={savedFriendIds}
            busyId={busyId}
            onTogglePin={onTogglePin}
            onToggleMute={onToggleMute}
            onMarkRead={onMarkRead}
            onToggleArchive={onToggleArchive}
            onLeaveRoom={onLeaveRoom}
            onOpenRoomActions={onOpenRoomActions}
            chatListChip={chatListChip}
            onChatListChipChange={onChatListChipChange}
            openedSwipeItemId={openedSwipeItemId}
            selectedArchiveSection={selectedArchiveSection}
            onOpenSwipeItem={onOpenSwipeItem}
            onCloseMenuItem={onCloseMenuItem}
            onResetTransientUi={onResetTransientUi}
            onListScrollStart={onListScrollStart}
            onSelectArchiveSection={onSelectArchiveSection}
            detailExternal={archiveDetailExternal}
          />
        ) : null}
        </MessengerHomeSectionTransition>
      </div>
    </section>
  );
});

MessengerHomeMainSections.displayName = "MessengerHomeMainSections";
