"use client";

import type { MutableRefObject } from "react";
import type { MessengerPrivacyListsStatus } from "@/lib/community-messenger/home/use-community-messenger-home-bootstrap";
import { memo, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessengerFriendsHeaderActions } from "@/components/community-messenger/friend-cta/MessengerFriendsHeaderActions";
import {
  MessengerReceivedFriendRequestsSheet,
  type MessengerFriendRequestsSheetTab,
} from "@/components/community-messenger/MessengerReceivedFriendRequestsSheet";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessengerChatListVisual, MessengerMenuAnchorRect } from "@/components/community-messenger/MessengerChatListItem";
import { MessengerChatsScreen, MessengerOpenChatScreen } from "@/components/community-messenger/MessengerChatsScreen";
import { MessengerArchiveScreen } from "@/components/community-messenger/MessengerArchiveScreen";
import { MessengerCallLogsPanel } from "@/components/community-messenger/MessengerCallLogsPanel";
import { MessengerFriendsScreen } from "@/components/community-messenger/MessengerFriendsScreen";
import { MessengerHomeInlineFriendSearch } from "@/components/community-messenger/MessengerHomeInlineFriendSearch";
import { MessengerHomeSectionTabs } from "@/components/community-messenger/MessengerHomeSectionTabs";
import { MessengerHomeSectionTransition } from "@/components/community-messenger/MessengerHomeSectionTransition";
import { MessengerHomePrimaryActionButton } from "@/components/community-messenger/MessengerHomePrimaryActionButton";
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
import type {
  CommunityMessengerFriendRequest,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSummary,
  CommunityMessengerCallLog,
} from "@/lib/community-messenger/types";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";
import type {
  MessengerPillarSummary,
  UnifiedRoomListItem,
} from "@/lib/community-messenger/use-community-messenger-home-state";
import type { MessengerResetTransientUiFn } from "@/lib/community-messenger/messenger-reset-transient-ui";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
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
  friendRequests?: CommunityMessengerFriendRequest[];
  onFriendRequestsChanged?: (handledRequestId?: string) => void;
  busyId: string | null;
  onOpenFriendsManage: () => void;
  onOpenProfile: (profile: CommunityMessengerProfileLite) => void;
  onToggleFavoriteFriend: (userId: string) => void;
  onFriendSwipeHide: (userId: string) => void;
  onFriendSwipeRemove: (userId: string) => void;
  onFriendSwipeBlock: (userId: string) => void;
  privacyListsStatus: MessengerPrivacyListsStatus;
  onRetryPrivacyLists: () => void;
  /** 대화 목록 맨 아래 「보관함」 줄 (항상) → 보관함 첫 화면 */
  onOpenArchivedChats: () => void;
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
  /** 대화 탭 주 버튼 「새 대화」 — 1:1 대화 · 그룹 대화 메뉴 */
  onOpenNewConversation?: () => void;
  /** 인박스로 들어올 때 받은 `?from=...` */
  entryOriginQuery?: string | null;
  /** 인박스 상단 거래·배달 묶음 행 — pillar 서브 라우트에서는 null */
  pillarSummaries?: { trade: MessengerPillarSummary; delivery: MessengerPillarSummary } | null;
  /** 거래 서브라우트(`/trade-chats`) — `listVisual="trade"` */
  chatListVisual?: MessengerChatListVisual;
  bootstrapCalls?: CommunityMessengerCallLog[];
  callsHydrating?: boolean;
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
  friendRequests = [],
  onFriendRequestsChanged,
  busyId,
  onOpenFriendsManage,
  onOpenProfile,
  onToggleFavoriteFriend,
  onFriendSwipeHide,
  onFriendSwipeRemove,
  onFriendSwipeBlock,
  privacyListsStatus,
  onRetryPrivacyLists,
  onOpenArchivedChats,
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
  onOpenNewConversation,
  entryOriginQuery = null,
  pillarSummaries = null,
  chatListVisual = "default",
  bootstrapCalls = [],
  callsHydrating = false,
  onBootstrapCallsChange,
  showSectionTabs = false,
  onPrimarySectionChange,
  archiveDetailExternal = false,
}: Props) {
  const { t } = useI18n();
  /** Mount-only inset on scrollport — never coupled to scroll-hide. */
  const bottomNavOccupiesClearance = useBottomNavOccupiesClearance();
  const listScrollInsetClass = bottomNavOccupiesClearance
    ? MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS
    : "";
  const chatListChip = inboxKindToChatListChip(chatInboxFilter, chatKindFilter);
  /** 친구 요청 시트 — 검색 줄 아이콘 · 받은 요청 카드 · 알림 링크(`?friendRequests=`) 공용 */
  const [friendRequestsSheet, setFriendRequestsSheet] = useState<MessengerFriendRequestsSheetTab | null>(null);
  const incomingPendingCount = friendRequests.filter((r) => r.status === "pending" && r.direction === "incoming").length;
  const outgoingPendingCount = friendRequests.filter((r) => r.status === "pending" && r.direction === "outgoing").length;
  const searchParams = useSearchParams();
  const friendRequestsParam = searchParams?.get("friendRequests")?.trim() ?? "";
  useEffect(() => {
    if (friendRequestsParam === "received" || friendRequestsParam === "sent") {
      setFriendRequestsSheet(friendRequestsParam);
    }
  }, [friendRequestsParam]);
  const openFriendRequests = (tab?: MessengerFriendRequestsSheetTab) =>
    setFriendRequestsSheet(tab ?? (incomingPendingCount > 0 || outgoingPendingCount === 0 ? "received" : "sent"));

  /**
   * 「@아이디」 사람 찾기 = 친구 추가 — 친구 탭 맨 위 찾기 칸 한 곳에만 둔다 (Owner 2026-11-10 시안 3판).
   * 채팅 시안 4판: 「친구 추가」 제목 없음 · 찾기 칸(돋보기 + 「@아이디로 친구 찾기」) 오른쪽 「관리」 글자 버튼(→ 보관함).
   * 대화 검색은 머리글 돋보기(통합 검색) 하나.
   */
  const showInlineFriendSearch = mainSection === "friends";
  /**
   * 보관함은 채팅 하위 화면 — 휴대폰에서는 대화·친구·통화 탭 줄 없이 1단 공통 하위 화면 머리글(뒤로 + 「보관함」)만 (채팅 시안 4판 「4. 보관함」).
   * 분할 화면(≥768)은 1단 머리글이 없어 탭 줄로 돌아가므로 그대로 둔다.
   */
  const isSplitViewport = useIsMessengerSplitViewport();
  const showTabsRow = showSectionTabs && !(mainSection === "archive" && !isSplitViewport);

  return (
    <section
      data-cm-messenger-main
      className="relative flex min-h-0 min-w-0 flex-1 flex-col space-y-0"
    >
      <div
        className="z-20 shrink-0 space-y-2 bg-[color:var(--messenger-bg,#fff)]"
        data-messenger-hub-sticky-chrome=""
      >
        {showTabsRow && onPrimarySectionChange ? (
          <MessengerHomeSectionTabs
            mainSection={mainSection}
            onPrimarySectionChange={onPrimarySectionChange}
            incomingFriendRequestCount={incomingPendingCount}
          />
        ) : null}
        {showInlineFriendSearch ? (
          /* 시안 찾기 줄: 여백 8 16 6 (위 8 = 탭 줄과의 간격 space-y-2) */
          <div
            className={
              showSectionTabs
                ? "box-border pb-1.5 pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))]"
                : "px-0 pb-1.5"
            }
          >
            <MessengerHomeInlineFriendSearch
              busyId={busyId}
              onSelectUser={onFriendRowChat}
              resetKey={mainSection}
              trailing={<MessengerFriendsHeaderActions onOpenManage={onOpenFriendsManage} />}
            />
          </div>
        ) : null}
      </div>
      <div
        className={`min-h-0 min-w-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto overscroll-contain ${showSectionTabs ? "px-0" : "px-3"} ${listScrollInsetClass}`}
        data-messenger-hub-list-scroll=""
        /** 스크롤 SSOT (2026-11-03): 방 → 뒤로 = 목록 위치 복원, 탭 다시 누르기 = 맨 위 (`lib/navigation/app-scroll-memory.ts`) */
        data-app-scroll-owner=""
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
            friendRequests={friendRequests}
            onOpenFriendRequests={openFriendRequests}
            onFriendRequestsChanged={onFriendRequestsChanged}
            busyId={busyId}
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

        {/* 보관함은 탭이 아니다 — 대화 목록 맨 아래 한 줄, 항상 (채팅 시안 4판, Owner 「정확히 시안대로」 2026-11-10) */}
        {/* 누르면 보관함 첫 화면(보관·알림 끔·숨김·차단). 거래·주문 목록에는 두지 않는다. 높이 64 = 위 연회색 띠 8 + 줄 56 */}
        {mainSection === "chats" && chatListVisual === "default" ? (
          <button
            type="button"
            onClick={onOpenArchivedChats}
            data-cm-archived-chats-entry=""
            className="mb-20 flex h-16 w-full items-center gap-3 border-t-8 border-[color:var(--cm-chat-band)] px-4 text-left text-[15px] active:bg-[color:var(--messenger-surface-muted)]"
            style={{ color: "var(--cm-chat-fg)" }}
          >
            <svg
              className="h-5 w-5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="3" y="4.5" width="18" height="5" rx="1" />
              <path d="M5 9.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5M10 13.5h4" />
            </svg>
            <span className="shrink-0 whitespace-nowrap">{t("nav_messenger_archive")}</span>
            <span
              className="ml-auto flex min-w-0 items-center gap-0.5 text-[12.5px]"
              style={{ color: "var(--cm-chat-sub)" }}
            >
              <span className="min-w-0 truncate">{t("cm_ui_chat_archive_entry_hint")}</span>
              <svg
                className="h-4 w-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </span>
          </button>
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
          <div>
            <MessengerCallLogsPanel
              callLogsRealtimeSource="home_meta"
              seedCalls={bootstrapCalls}
              callsHydrating={callsHydrating}
              entryOrigin={entryOriginQuery}
              viewerUserId={viewerUserId}
              peerProfiles={sortedFriends}
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
            privacyListsStatus={privacyListsStatus}
            onRetryPrivacyLists={onRetryPrivacyLists}
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
      {mainSection === "chats" && onOpenNewConversation ? (
        <MessengerHomePrimaryActionButton
          label={t("cm_ui_new_conversation")}
          onClick={onOpenNewConversation}
          dataAttr="new-conversation"
        />
      ) : null}
      <MessengerReceivedFriendRequestsSheet
        open={friendRequestsSheet !== null}
        onClose={() => setFriendRequestsSheet(null)}
        initialTab={friendRequestsSheet ?? "received"}
        requests={friendRequests}
        onChanged={(handledRequestId) => {
          onFriendRequestsChanged?.(handledRequestId);
        }}
      />
    </section>
  );
});

MessengerHomeMainSections.displayName = "MessengerHomeMainSections";
