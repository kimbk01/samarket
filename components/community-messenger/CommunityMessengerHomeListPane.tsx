"use client";

import {
  bumpMessengerRenderPerf,
  recordMessengerBootstrapFirstInteractive,
  recordMessengerBootstrapFirstListItemRender,
  recordMessengerBootstrapFullListRender,
  tryTrackFirstMenuListRender,
} from "@/lib/runtime/samarket-runtime-debug";
import {
  getCmClientFirstPaintActiveSessionId,
  markCmClientFirstPaint,
  recordCmLiteListPaneRenderForFirstPaint,
} from "@/lib/community-messenger/cm-client-first-paint-perf";
import {
  markCmClientMergeFirstRowRendered,
  markCmClientMergeInteractive,
  markCmClientMergeSkeletonRemoved,
  recordCmClientMergeListRenderMs,
  recordCmClientMergePaneRender,
} from "@/lib/community-messenger/cm-client-merge-breakdown";
import { useLayoutEffect, useRef, type ReactElement } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { shouldFreezeRoomListSubtree } from "@/lib/community-messenger/room/cm-room-list-render-pause";
import type { MessengerChatListVisual, MessengerMenuAnchorRect } from "@/components/community-messenger/MessengerChatListItem";
import { MessengerHomeMainSections } from "@/components/community-messenger/MessengerHomeMainSections";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerCallLog,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import type {
  MessengerPillarSummary,
  UnifiedRoomListItem,
} from "@/lib/community-messenger/use-community-messenger-home-state";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";
import type {
  MessengerArchiveSection,
  MessengerChatInboxFilter,
  MessengerChatKindFilter,
  MessengerChatListContext,
  MessengerMainSection,
} from "@/lib/community-messenger/messenger-ia";

type Props = {
  loading: boolean;
  /** critical 전 리스트 영역 스켈레톤 — `loading`(데이터 있는 새로고침 오버레이)과 분리 */
  listPlaceholder?: boolean;
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
  handleMessengerHomeLeaveRoom: (room: CommunityMessengerRoomSummary) => void;
  openRoomActions: (
    item: UnifiedRoomListItem,
    listContext: MessengerChatListContext,
    anchorRect: MessengerMenuAnchorRect | null
  ) => void;
  chatInboxFilter: MessengerChatInboxFilter;
  chatKindFilter: MessengerChatKindFilter;
  onChatListChipChange: (next: any) => void;
  openChatJoinedItems: UnifiedRoomListItem[];
  onOpenMeetingFindStable: () => void;
  incomingRequestCount: number;
  pageError: string | null;
  loginRequiredText: string;
  retryText: string;
  onRetry: () => void;
  /** 인박스 묶음 행(거래·배달). pillar 모드에선 null. */
  pillarSummaries?: { trade: MessengerPillarSummary; delivery: MessengerPillarSummary } | null;
  /** 인박스 진입 시점의 `?from=...` — 묶음 행이 서브 라우트로 진입할 때 보존. */
  entryOriginQuery?: string | null;
  chatListVisual?: MessengerChatListVisual;
  bootstrapCalls?: CommunityMessengerCallLog[];
  callsHydrating?: boolean;
  showSectionTabs?: boolean;
  onOpenFriendManager?: () => void;
};

export function CommunityMessengerHomeListPane(props: Props) {
  const { t } = useI18n();
  const frozenTreeRef = useRef<ReactElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const listFrozen = shouldFreezeRoomListSubtree();
  const canRenderList = !props.authRequired && Boolean(props.data);
  const listHold = Boolean(props.listPlaceholder);
  const showRefreshingOverlay = props.loading && canRenderList;
  const showCompactSkeleton = (props.loading || listHold) && !canRenderList && !props.authRequired;

  if (getCmClientFirstPaintActiveSessionId()) {
    recordCmLiteListPaneRenderForFirstPaint();
  }
  recordCmClientMergePaneRender();
  const isPillarChatList = props.chatListVisual === "trade" || props.chatListVisual === "delivery";

  useLayoutEffect(() => {
    if (listFrozen) return;
    const frame = frameRef.current;
    if (!frame) return;
    const rowSelector = '[data-messenger-chat-row="true"]';
    const skeletonSelector = "[data-cm-home-skeleton]";
    const unreadBadgeSelector = "[data-cm-unread-badge='true']";

    const probeFirstPaintDom = () => {
      const trackingLite = Boolean(getCmClientFirstPaintActiveSessionId());
      const tProbe0 = typeof performance !== "undefined" ? performance.now() : 0;
      const rowCount = frame.querySelectorAll(rowSelector).length;
      if (rowCount > 0) {
        recordMessengerBootstrapFirstListItemRender();
        if (trackingLite) markCmClientFirstPaint("first_room_row_rendered");
        markCmClientMergeFirstRowRendered();
        if (rowCount >= props.primaryListItems.length) {
          recordMessengerBootstrapFullListRender();
        }
      }
      if (!frame.querySelector(skeletonSelector)) {
        if (trackingLite) markCmClientFirstPaint("skeleton_removed");
        markCmClientMergeSkeletonRemoved();
      }
      if (frame.querySelector(unreadBadgeSelector)) {
        if (trackingLite) markCmClientFirstPaint("unread_badge_rendered");
      }
      const interactiveTarget =
        frame.querySelector('[data-messenger-chat-row="true"] a[href*="/community-messenger/rooms/"]') ??
        frame.querySelector('[data-messenger-chat-row="true"] [role="button"]') ??
        frame.querySelector('[data-messenger-chat-row="true"]');
      if (interactiveTarget instanceof HTMLElement) {
        recordMessengerBootstrapFirstInteractive();
        if (trackingLite) markCmClientFirstPaint("list_interactive");
        markCmClientMergeInteractive();
      }
      if (typeof performance !== "undefined") {
        recordCmClientMergeListRenderMs(Math.round(performance.now() - tProbe0));
      }
    };

    if (!canRenderList || !props.data) {
      if (!listHold && !props.authRequired && !frame.querySelector(skeletonSelector)) {
        if (getCmClientFirstPaintActiveSessionId()) markCmClientFirstPaint("skeleton_removed");
      }
      return;
    }

    probeFirstPaintDom();
    if (typeof requestAnimationFrame !== "function") return;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      probeFirstPaintDom();
      raf2 = requestAnimationFrame(() => {
        probeFirstPaintDom();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [listFrozen, canRenderList, props.data, props.primaryListItems.length, listHold, props.authRequired]);

  if (listFrozen) {
    if (frozenTreeRef.current) return frozenTreeRef.current;
    return (
      <div
        className="relative min-h-[56dvh]"
        data-cm-home-frame="true"
        data-cm-home-frozen="true"
        aria-hidden
      />
    );
  }

  bumpMessengerRenderPerf("messenger_home_list_render");
  tryTrackFirstMenuListRender();

  const tree = (
    <>
      <div
        ref={frameRef}
        className={`relative min-h-[56dvh] ${isPillarChatList ? "sam-messenger-pillar-list-enter" : ""}`}
        data-cm-home-frame="true"
        data-cm-pillar-list={isPillarChatList ? props.chatListVisual : undefined}
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
              viewerUserId={props.data.me?.id ?? null}
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
              onLeaveRoom={props.handleMessengerHomeLeaveRoom}
              onOpenRoomActions={props.openRoomActions}
              chatInboxFilter={props.chatInboxFilter}
              chatKindFilter={props.chatKindFilter}
              onChatListChipChange={props.onChatListChipChange}
              openChatJoinedItems={props.openChatJoinedItems}
              onOpenMeetingFind={props.onOpenMeetingFindStable}
              incomingRequestCount={props.incomingRequestCount}
              pillarSummaries={props.pillarSummaries ?? null}
              entryOriginQuery={props.entryOriginQuery ?? null}
              chatListVisual={props.chatListVisual ?? "default"}
              bootstrapCalls={props.bootstrapCalls ?? []}
              callsHydrating={props.callsHydrating ?? false}
              showSectionTabs={props.showSectionTabs}
              onPrimarySectionChange={props.onPrimarySectionChange}
              onOpenFriendManager={props.onOpenFriendManager}
            />
          </div>
        ) : null}

        {props.loading && canRenderList ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] flex justify-center px-2 pt-1">
            <div
              className="inline-flex items-center rounded-full border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)]/95 px-3 py-1.5 sam-text-xxs font-medium shadow-[var(--messenger-shadow-soft)] backdrop-blur-sm"
              style={{ color: "var(--messenger-text-secondary)" }}
              data-cm-home-refresh-overlay="true"
            >
              {t("cm_ui_updating_with_existing_list")}
            </div>
          </div>
        ) : null}

        {props.loading && !canRenderList ? <CommunityMessengerHomePendingBlank /> : null}

      </div>

      {props.actionError ? (
        <div
          className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-3 sam-text-body-secondary shadow-[var(--messenger-shadow-soft)]"
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
          <p className="sam-text-body-lg font-semibold">{t("nav_messenger_login_required")}</p>
          <p className="mt-2 sam-text-body-secondary" style={{ color: "var(--messenger-text-secondary)" }}>
            {props.pageError ?? props.loginRequiredText}
          </p>
        </section>
      ) : null}

      {!props.loading && !listHold && !props.authRequired && !props.data ? (
        <section
          className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-8 text-center shadow-[var(--messenger-shadow-soft)]"
          style={{ color: "var(--messenger-text)" }}
        >
          <p className="sam-text-body-lg font-semibold">{t("cm_ui_failed_to_load_messenger")}</p>
          <p className="mt-2 sam-text-body-secondary" style={{ color: "var(--messenger-text-secondary)" }}>
            {props.pageError ?? props.retryText}
          </p>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={props.onRetry}
              className="rounded-[var(--messenger-radius-md)] bg-[color:var(--messenger-primary)] px-4 py-3 sam-text-body font-semibold text-white active:opacity-90"
            >
              {t("cm_ui_reload")}
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
  frozenTreeRef.current = tree;
  return tree;
}

function CommunityMessengerHomePendingBlank() {
  return (
    <div
      className="min-h-[min(42vh,360px)]"
      aria-busy="true"
      data-community-messenger-home-pending-blank="true"
    />
  );
}
