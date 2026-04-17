"use client";

import dynamic from "next/dynamic";
import { CommunityMessengerHomeShellSkeleton } from "@/components/community-messenger/CommunityMessengerRouteSkeletons";
import type { MessengerMenuAnchorRect } from "@/components/community-messenger/MessengerChatListItem";
import { MessengerHomeMainSections } from "@/components/community-messenger/MessengerHomeMainSections";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerFriendRequest,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";
import type {
  MessengerArchiveSection,
  MessengerChatInboxFilter,
  MessengerChatKindFilter,
  MessengerChatListContext,
  MessengerMainSection,
} from "@/lib/community-messenger/messenger-ia";

const MessengerIncomingFriendRequestPopup = dynamic(
  () =>
    import("@/components/community-messenger/MessengerIncomingFriendRequestPopup").then(
      (m) => m.MessengerIncomingFriendRequestPopup
    ),
  { ssr: false, loading: () => null }
);

type Props = {
  loading: boolean;
  authRequired: boolean;
  data: CommunityMessengerBootstrap | null;
  actionError: string | null;
  mainSection: MessengerMainSection;
  onPrimarySectionChange: (next: MessengerMainSection) => void;
  openedSwipeItemId: string | null;
  openedMenuItemId: string | null;
  friendQuickMenuBlocksTabSwipeRef: React.MutableRefObject<boolean>;
  messengerOverlayGeneration: number;
  selectedArchiveSection: MessengerArchiveSection | null;
  isScrolling: boolean;
  resetMessengerTransientUi: () => void;
  notifyMessengerListScroll: () => void;
  openMessengerMenuItem: (id: string) => void;
  closeMessengerMenuItem: (id?: string) => void;
  setOpenedSwipeItemId: (id: string | null) => void;
  setSelectedArchiveSection: (section: MessengerArchiveSection | null) => void;
  sortedFriends: CommunityMessengerProfileLite[];
  friendStateModel: MessengerFriendStateModel;
  busyId: string | null;
  onOpenFriendsPrivacySummary: () => void;
  onOpenProfile: (profile: CommunityMessengerProfileLite) => void;
  toggleFavoriteFriend: (userId: string) => void;
  toggleHiddenFriend: (userId: string) => void;
  removeFriend: (userId: string) => void;
  toggleBlock: (userId: string) => void;
  startDirectRoom: (userId: string) => void;
  onFriendRowVoiceCallStable: (userId: string) => void;
  onFriendRowVideoCallStable: (userId: string) => void;
  getFriendDirectRoomMutedStable: (userId: string) => boolean | undefined;
  getFriendDirectRoomKindStable: (userId: string) => "trade" | "delivery" | null;
  friendNotificationsBusyStable: (userId: string) => boolean;
  onFriendToggleRoomMuteStable: (userId: string) => void;
  friendHasDirectRoomStable: (userId: string) => boolean;
  primaryListItems: UnifiedRoomListItem[];
  favoriteFriendIds: Set<string>;
  handleMessengerHomeTogglePin: (room: CommunityMessengerRoomSummary) => void;
  handleMessengerHomeToggleMute: (room: CommunityMessengerRoomSummary) => void;
  handleMessengerHomeMarkRoomRead: (room: CommunityMessengerRoomSummary) => void;
  handleMessengerHomeToggleRoomArchive: (room: CommunityMessengerRoomSummary) => void;
  openRoomActions: (
    item: UnifiedRoomListItem,
    listContext: MessengerChatListContext,
    anchorRect: MessengerMenuAnchorRect | null
  ) => void;
  chatInboxFilter: MessengerChatInboxFilter;
  chatKindFilter: MessengerChatKindFilter;
  onChatListChipChange: (next: any) => void;
  openChatJoinedItems: UnifiedRoomListItem[];
  filteredDiscoverableGroups: any[];
  onPreviewOpenGroupStable: (groupId: string) => void;
  incomingRequestCount: number;
  incomingFriendRequestPopup: CommunityMessengerFriendRequest | null;
  setIncomingFriendRequestPopup: (value: CommunityMessengerFriendRequest | null) => void;
  respondRequest: (requestId: string, action: "accept" | "reject" | "cancel") => Promise<void>;
  pageError: string | null;
  loginRequiredText: string;
  retryText: string;
  onRetry: () => void;
};

export function CommunityMessengerHomeListPane(props: Props) {
  const canRenderList = !props.authRequired && Boolean(props.data);
  const showRefreshingOverlay = props.loading && canRenderList;
  const showCompactSkeleton = props.loading && !canRenderList;

  return (
    <>
      <div
        className="relative min-h-[56dvh]"
        data-cm-home-frame="true"
        data-cm-home-state={
          canRenderList
            ? showRefreshingOverlay
              ? "list-refreshing"
              : "list-ready"
            : showCompactSkeleton
              ? "skeleton"
              : props.authRequired
                ? "auth-required"
                : "empty"
        }
      >
        {canRenderList && props.data ? (
          <div data-cm-home-list-mounted="true">
            <MessengerHomeMainSections
              mainSection={props.mainSection}
              onPrimarySectionChange={props.onPrimarySectionChange}
              openedSwipeItemId={props.openedSwipeItemId}
              openedMenuItemId={props.openedMenuItemId}
              friendQuickMenuBlocksTabSwipeRef={props.friendQuickMenuBlocksTabSwipeRef}
              messengerOverlayGeneration={props.messengerOverlayGeneration}
              selectedArchiveSection={props.selectedArchiveSection}
              pendingCallTarget={null}
              isScrolling={props.isScrolling}
              onResetTransientUi={props.resetMessengerTransientUi}
              onListScrollStart={props.notifyMessengerListScroll}
              onOpenMenuItem={props.openMessengerMenuItem}
              onCloseMenuItem={props.closeMessengerMenuItem}
              onOpenSwipeItem={props.setOpenedSwipeItemId}
              onSelectArchiveSection={props.setSelectedArchiveSection}
              me={props.data.me}
              sortedFriends={props.sortedFriends}
              friendStateModel={props.friendStateModel}
              busyId={props.busyId}
              onOpenFriendsPrivacySummary={props.onOpenFriendsPrivacySummary}
              onOpenProfile={props.onOpenProfile}
              onToggleFavoriteFriend={props.toggleFavoriteFriend}
              onFriendSwipeHide={props.toggleHiddenFriend}
              onFriendSwipeRemove={props.removeFriend}
              onFriendSwipeBlock={props.toggleBlock}
              onFriendRowChat={props.startDirectRoom}
              onFriendRowVoiceCall={props.onFriendRowVoiceCallStable}
              onFriendRowVideoCall={props.onFriendRowVideoCallStable}
              getFriendDirectRoomMuted={props.getFriendDirectRoomMutedStable}
              getFriendDirectRoomKind={props.getFriendDirectRoomKindStable}
              friendNotificationsBusy={props.friendNotificationsBusyStable}
              onFriendToggleRoomMute={props.onFriendToggleRoomMuteStable}
              friendHasDirectRoom={props.friendHasDirectRoomStable}
              primaryListItems={props.primaryListItems}
              favoriteFriendIds={props.favoriteFriendIds}
              onTogglePin={props.handleMessengerHomeTogglePin}
              onToggleMute={props.handleMessengerHomeToggleMute}
              onMarkRead={props.handleMessengerHomeMarkRoomRead}
              onToggleArchive={props.handleMessengerHomeToggleRoomArchive}
              onOpenRoomActions={props.openRoomActions}
              chatInboxFilter={props.chatInboxFilter}
              chatKindFilter={props.chatKindFilter}
              onChatListChipChange={props.onChatListChipChange}
              openChatJoinedItems={props.openChatJoinedItems}
              filteredDiscoverableGroups={props.filteredDiscoverableGroups}
              onPreviewOpenGroup={props.onPreviewOpenGroupStable}
              incomingRequestCount={props.incomingRequestCount}
            />
          </div>
        ) : null}

        {props.loading && canRenderList ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] flex justify-center px-2 pt-1">
            <div
              className="inline-flex items-center rounded-full border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)]/95 px-3 py-1.5 text-[11px] font-medium shadow-[var(--messenger-shadow-soft)] backdrop-blur-sm"
              style={{ color: "var(--messenger-text-secondary)" }}
              data-cm-home-refresh-overlay="true"
            >
              기존 목록을 유지한 채 새 데이터를 반영하는 중입니다.
            </div>
          </div>
        ) : null}

        {props.loading && !canRenderList ? <CommunityMessengerHomeShellSkeleton compact /> : null}

        {props.incomingFriendRequestPopup ? (
          <MessengerIncomingFriendRequestPopup
            request={props.incomingFriendRequestPopup}
            busyId={props.busyId}
            onDismiss={() => props.setIncomingFriendRequestPopup(null)}
            onRespond={(requestId, action) => void props.respondRequest(requestId, action)}
          />
        ) : null}
      </div>

      {props.actionError ? (
        <div
          className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-3 text-[13px] shadow-[var(--messenger-shadow-soft)]"
          style={{ color: "var(--messenger-text)" }}
        >
          {props.actionError}
        </div>
      ) : null}

      {!props.loading && props.authRequired ? (
        <section
          className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-8 text-center shadow-[var(--messenger-shadow-soft)]"
          style={{ color: "var(--messenger-text)" }}
        >
          <p className="text-[16px] font-semibold">로그인이 필요합니다.</p>
          <p className="mt-2 text-[13px]" style={{ color: "var(--messenger-text-secondary)" }}>
            {props.pageError ?? props.loginRequiredText}
          </p>
        </section>
      ) : null}

      {!props.loading && !props.authRequired && !props.data ? (
        <section
          className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-8 text-center shadow-[var(--messenger-shadow-soft)]"
          style={{ color: "var(--messenger-text)" }}
        >
          <p className="text-[16px] font-semibold">메신저를 불러오지 못했습니다.</p>
          <p className="mt-2 text-[13px]" style={{ color: "var(--messenger-text-secondary)" }}>
            {props.pageError ?? props.retryText}
          </p>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={props.onRetry}
              className="rounded-[var(--messenger-radius-md)] bg-[color:var(--messenger-primary)] px-4 py-3 text-[14px] font-semibold text-white active:opacity-90"
            >
              다시 불러오기
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
