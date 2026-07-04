"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { philifeMeetingMemberRoleLabel } from "@/lib/community-messenger/cm-ui-translate";
import { messengerRoomPrefetchPriorityScore } from "@/lib/community-messenger/room-prefetch-queue";
import { armMessengerRoomRoutePrefetch } from "@/lib/community-messenger/room/arm-messenger-room-route-prefetch";
import { runCommunityMessengerRoomForwardNavigation } from "@/lib/community-messenger/community-messenger-room-forward-navigation";
import { useMessengerRoomListPrefetchRefCallback } from "@/lib/community-messenger/use-messenger-room-list-prefetch-intersection";
import {
  communityMessengerRoomHref,
  MESSENGER_ENTRY_ORIGIN_QUERY_KEY,
  messengerRoomListSourceFromPathname,
} from "@/lib/community-messenger/messenger-entry-origin";
import { markCommunityMessengerRoomNavTap } from "@/lib/community-messenger/room-nav-timing";
import { cmReceiveBadgeLog } from "@/lib/community-messenger/read/cm-receive-badge-log";
import { cmReadUiLog } from "@/lib/community-messenger/read/cm-read-ui-log";
import { shouldFreezeRoomListSubtree } from "@/lib/community-messenger/room/cm-room-list-render-pause";
import { bumpMessengerRenderPerf } from "@/lib/runtime/samarket-runtime-debug";
import { useMessengerLongPress } from "@/lib/community-messenger/use-messenger-long-press";
import {
  messengerRoomMenuItemId,
  messengerRoomSwipeItemId,
  type MessengerChatListContext,
} from "@/lib/community-messenger/messenger-ia";
import { communityMessengerRoomIsInboxHidden, type CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { CommunityMessengerChatTypeBadge } from "@/components/community-messenger/chat-list/CommunityMessengerChatTypeBadge";
import {
  formatConversationTimestamp,
  messengerStringSetsEqual,
  unifiedListItemRowDisplayEqual,
  type UnifiedRoomListItem,
} from "@/lib/community-messenger/use-community-messenger-home-state";
import {
  getSwipeActions,
  type MessengerSwipeActionDef,
  type MessengerSwipeActionKind,
} from "@/lib/messenger-policy/chat-room-swipe-actions";
import { toMessengerPolicyRoomType } from "@/lib/messenger-policy/messenger-policy-room-type";
import { incomingCallPeerNicknameLabel } from "@/lib/users/user-label";
import { MessengerChatListItemPresenceDot } from "@/components/community-messenger/MessengerChatListItemPresenceDot";
import { MessengerListRow } from "@/components/community-messenger/line-ui";
import {
  buildTradeChatListPreviewLine,
  buildTradeChatListRowModel,
} from "@/lib/community-messenger/trade-chat-list/view-model";
import { messengerTradeViewerRoleFromContextMeta } from "@/lib/community-messenger/messenger-trade-viewer-role";
import { TradeChatListRowContent } from "@/components/community-messenger/trade-chat-list/TradeChatListRowContent";
import { TradeProductThumb } from "@/components/community-messenger/trade-chat-list/TradeProductThumb";
import { formatTradeChatListTimestamp } from "@/lib/community-messenger/trade-chat-list/trade-chat-list-timestamp";
import { DeliveryChatListRowContent } from "@/components/community-messenger/delivery-chat-list/DeliveryChatListRowContent";
import { StoreProfileThumb } from "@/components/community-messenger/delivery-chat-list/StoreProfileThumb";
import {
  buildDeliveryChatListRowModel,
} from "@/lib/community-messenger/delivery-chat-list/view-model";
import { formatDeliveryChatListShortTimestamp } from "@/lib/community-messenger/delivery-chat-list/delivery-chat-list-timestamp";
import { buildDeliveryChatListPreviewLine } from "@/lib/community-messenger/delivery-chat-list/delivery-chat-list-preview";
import { prefetchStoreProfileThumbnailIfNeeded } from "@/lib/community-messenger/delivery-chat-list/store-profile-thumbnail-cache";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";
import { prefetchTradePostThumbnailIfNeeded } from "@/lib/community-messenger/trade-chat-list/trade-post-thumbnail-cache";
import { resolveCommerceChatListPresentation } from "@/lib/community-messenger/commerce-chat-list-presentation";
import { useTradeChatListPostPreviewFields } from "@/lib/community-messenger/trade-chat-list/use-trade-chat-list-post-preview-fields";
import { useMessengerChatListUnread } from "@/lib/community-messenger/read/messenger-chat-list-unread-display";
import {
  normalizeMessengerRealtimeRoomId,
  useMessengerRealtimeStore,
} from "@/lib/community-messenger/stores/messenger-realtime-store";
import {
  logCmMemoPropDiff,
  logCmMemoPropEqual,
  useCmDevRenderTrace,
} from "@/lib/community-messenger/dev/cm-event-loop-dev";

const ACTION_W = 78;
const MESSENGER_CHAT_LIST_ITEM_NOOP_LEAVE_ROOM = (_room: CommunityMessengerRoomSummary) => {};
const DRAG_START_X = 16;
const DRAG_CANCEL_Y = 14;
const PRESS_RELEASE_MS = 90;
const LONG_PRESS_THRESHOLD_MS = 560;

function swipeActionLabel(
  action: MessengerSwipeActionDef,
  safeT: ReturnType<typeof useI18n>["safeT"]
): string {
  switch (action.labelKey) {
    case "cm_ui_swipe_mark_read":
      return safeT(action.labelKey, { fallbackKo: "읽음", fallbackEn: "Read" });
    case "cm_ui_swipe_restore":
      return safeT(action.labelKey, { fallbackKo: "복원", fallbackEn: "Restore" });
    case "cm_ui_archive":
      return safeT(action.labelKey, { fallbackKo: "보관", fallbackEn: "Archive" });
    case "cm_ui_leave":
      return safeT(action.labelKey, { fallbackKo: "나가기", fallbackEn: "Leave" });
    default:
      return safeT(action.labelKey, { fallbackKo: "확인", fallbackEn: "Confirm" });
  }
}

export type MessengerMenuAnchorRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

/** `/trade-chats` · `/delivery-chats` 전용 행 레이아웃 */
export type MessengerChatListVisual = "default" | "trade" | "delivery";

type Props = {
  item: UnifiedRoomListItem;
  viewerUserId?: string | null;
  favoriteFriendIds: Set<string>;
  /** 친구 목록(saved)에 없는 1:1 general peer — 「친구 아님」 배지 */
  savedFriendIds?: Set<string>;
  busyId: string | null;
  onTogglePin: (room: CommunityMessengerRoomSummary) => void;
  onToggleMute: (room: CommunityMessengerRoomSummary) => void;
  onMarkRead: (room: CommunityMessengerRoomSummary) => void;
  onToggleArchive: (room: CommunityMessengerRoomSummary) => void;
  /** 비스와이프(compact) 행에서는 호출되지 않음 — 검색 시트 등에서 생략 가능 */
  onLeaveRoom?: (room: CommunityMessengerRoomSummary) => void;
  onOpenRoomActions?: (
    item: UnifiedRoomListItem,
    listContext: MessengerChatListContext,
    anchorRect: MessengerMenuAnchorRect | null
  ) => void;
  /** 보관함 탭 등 액션 시트 분기 */
  listContext?: MessengerChatListContext;
  compact?: boolean;
  /** 검색 시트 등: 탭은 방 이동, 롱프레스는 부모 액션 시트 */
  onCompactLongPress?: () => void;
  openedSwipeItemId?: string | null;
  onOpenSwipeItem?: (id: string | null) => void;
  onCloseMenuItem?: (id?: string) => void;
  onResetTransientUi?: () => void;
  /** 거래 채팅 서브라우트(`/trade-chats`) 전용 레이아웃 */
  listVisual?: MessengerChatListVisual;
};

function favoriteFriendIdsEqual(prev: Set<string>, next: Set<string>): boolean {
  return prev === next || messengerStringSetsEqual(prev, next);
}

function messengerChatListItemPropsEqual(prev: Props, next: Props): boolean {
  const reasons: string[] = [];
  const roomId = next.item.room.id;

  if (prev.item !== next.item && !unifiedListItemRowDisplayEqual(prev.item, next.item)) {
    if (prev.item.room.id !== next.item.room.id) reasons.push("item.roomId");
    else if (prev.item.room !== next.item.room) reasons.push("item.roomRef");
    else reasons.push("item.display");
  }
  if (prev.viewerUserId !== next.viewerUserId) reasons.push("viewerUserId");
  if (!favoriteFriendIdsEqual(prev.favoriteFriendIds, next.favoriteFriendIds)) reasons.push("favoriteFriendIds");
  if (!favoriteFriendIdsEqual(prev.savedFriendIds ?? new Set(), next.savedFriendIds ?? new Set()))
    reasons.push("savedFriendIds");
  if (prev.busyId !== next.busyId) reasons.push("busyId");
  if (prev.openedSwipeItemId !== next.openedSwipeItemId) reasons.push("openedSwipeItemId");
  if (prev.listContext !== next.listContext) reasons.push("listContext");
  if (prev.compact !== next.compact) reasons.push("compact");
  if (prev.listVisual !== next.listVisual) reasons.push("listVisual");
  if (prev.onTogglePin !== next.onTogglePin) reasons.push("onTogglePin");
  if (prev.onToggleMute !== next.onToggleMute) reasons.push("onToggleMute");
  if (prev.onMarkRead !== next.onMarkRead) reasons.push("onMarkRead");
  if (prev.onToggleArchive !== next.onToggleArchive) reasons.push("onToggleArchive");
  if (prev.onLeaveRoom !== next.onLeaveRoom) reasons.push("onLeaveRoom");
  if (prev.onOpenRoomActions !== next.onOpenRoomActions) reasons.push("onOpenRoomActions");
  if (prev.onOpenSwipeItem !== next.onOpenSwipeItem) reasons.push("onOpenSwipeItem");
  if (prev.onCloseMenuItem !== next.onCloseMenuItem) reasons.push("onCloseMenuItem");
  if (prev.onResetTransientUi !== next.onResetTransientUi) reasons.push("onResetTransientUi");
  if (prev.onCompactLongPress !== next.onCompactLongPress) reasons.push("onCompactLongPress");

  if (reasons.length > 0) {
    logCmMemoPropDiff("MessengerChatListItem", roomId, reasons);
    return false;
  }
  logCmMemoPropEqual("MessengerChatListItem", roomId);
  return true;
}

export const MessengerChatListItem = memo(function MessengerChatListItem({
  item,
  viewerUserId = null,
  favoriteFriendIds,
  savedFriendIds,
  busyId: _busyId,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onToggleArchive,
  onLeaveRoom: onLeaveRoomProp,
  onOpenRoomActions,
  listContext = "default",
  compact = false,
  onCompactLongPress,
  openedSwipeItemId = null,
  onOpenSwipeItem,
  onCloseMenuItem,
  onResetTransientUi,
  listVisual = "default",
}: Props) {
  const { t, safeT } = useI18n();
  useCmDevRenderTrace("MessengerChatListItem");
  const onLeaveRoom = onLeaveRoomProp ?? MESSENGER_CHAT_LIST_ITEM_NOOP_LEAVE_ROOM;
  if (!shouldFreezeRoomListSubtree()) {
    bumpMessengerRenderPerf("messenger_room_row_render");
  }
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const fromEntryOrigin = searchParams.get(MESSENGER_ENTRY_ORIGIN_QUERY_KEY);
  const roomListSource = useMemo(() => messengerRoomListSourceFromPathname(pathname), [pathname]);
  const roomReturnHref = useMemo(() => {
    if (roomListSource === "inbox") return null;
    const qs = searchParams.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, roomListSource, searchParams]);
  const room = item.room;
  const rowRef = useRef<HTMLDivElement | null>(null);
  const roomPrefetchPriority = useMemo(
    () => messengerRoomPrefetchPriorityScore(room.lastMessageAt),
    [room.lastMessageAt]
  );
  const roomHref = useMemo(
    () => communityMessengerRoomHref(room.id, fromEntryOrigin, roomListSource, roomReturnHref),
    [room.id, fromEntryOrigin, roomListSource, roomReturnHref]
  );
  const prefetchAttach = useMessengerRoomListPrefetchRefCallback(
    room.id,
    true,
    roomPrefetchPriority,
    roomHref
  );
  const hoverPrefetchOnceRef = useRef(false);
  const setMainRowRef = useCallback(
    (node: HTMLDivElement | null) => {
      rowRef.current = node;
      prefetchAttach(node);
    },
    [prefetchAttach]
  );
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isPressedVisual, setIsPressedVisual] = useState(false);
  const dragRef = useRef({
    startX: 0,
    startY: 0,
    origin: 0,
    active: false,
    dragging: false,
  });
  const dragXRef = useRef(0);
  const suppressTapRef = useRef(false);
  const tapNavigateArmedRef = useRef(false);
  const longPressTriggeredRef = useRef(false);
  const releasePressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commerceMeta = room.contextMeta;
  const isFavorite = room.peerUserId ? favoriteFriendIds.has(room.peerUserId) : false;
  const showStrangerBadge =
    room.roomType === "direct" &&
    !room.contextMeta?.kind &&
    Boolean(room.peerUserId?.trim()) &&
    savedFriendIds != null &&
    !savedFriendIds.has((room.peerUserId ?? "").trim());
  /** presence dot — 일반 1:1 direct 만 구독 (거래·배달·시스템 묶음 행 제외) */
  const presencePeerUserId =
    room.roomType === "direct" &&
    commerceMeta?.kind !== "trade" &&
    commerceMeta?.kind !== "delivery"
      ? room.peerUserId ?? null
      : null;
  const titleSuffix = room.roomType !== "direct" && room.memberCount > 0 ? String(room.memberCount) : "";
  const commerceSubline =
    commerceMeta && (commerceMeta.headline || commerceMeta.priceLabel)
      ? [commerceMeta.headline, commerceMeta.priceLabel].filter(Boolean).join(" · ")
      : null;
  const archiveBusy = _busyId === `room-archive:${room.id}`;
  const readBusy = _busyId === `room-read:${room.id}`;
  const leaveBusy = _busyId === `room-leave:${room.id}`;
  const policyType = toMessengerPolicyRoomType({
    roomType: room.roomType,
    contextMeta: room.contextMeta ?? null,
  });
  const swipeActions = useMemo(() => getSwipeActions({ policyType, listContext }), [listContext, policyType]);
  const actionTotalPx = ACTION_W * swipeActions.length;
  const swipeItemId = messengerRoomSwipeItemId(room.id, listContext);
  const menuItemId = messengerRoomMenuItemId(room.id, listContext);
  const tradeRoleLabel = commerceMeta?.kind === "trade" ? commerceMeta.roleLabel?.trim() || null : null;
  const tradeViewerRoleForTint = messengerTradeViewerRoleFromContextMeta(commerceMeta ?? undefined);
  const commerceListPresentation = useMemo(
    () => resolveCommerceChatListPresentation(room),
    [room]
  );
  const tradeItemStateLabel = useMemo(() => {
    if (commerceMeta?.kind !== "trade") return null;
    if (commerceListPresentation.statusLabelKey) {
      return t(commerceListPresentation.statusLabelKey);
    }
    return commerceMeta.itemStateLabel?.trim() || null;
  }, [commerceMeta, commerceListPresentation.statusLabelKey, t]);
  const deliveryStepLabel = useMemo(() => {
    if (commerceMeta?.kind !== "delivery") return null;
    if (commerceListPresentation.statusLabelKey) {
      return t(commerceListPresentation.statusLabelKey);
    }
    return commerceMeta.stepLabel?.trim() || null;
  }, [commerceMeta, commerceListPresentation.statusLabelKey, t]);

  const isTradeChatListVisual = listVisual === "trade";
  const isDeliveryChatListVisual = listVisual === "delivery";
  const isPillarChatListVisual = isTradeChatListVisual || isDeliveryChatListVisual;
  const listDisplayTitle = useMemo(() => {
    if (isPillarChatListVisual || room.roomType !== "direct") return room.title;
    return incomingCallPeerNicknameLabel(room.title) || room.title;
  }, [isPillarChatListVisual, room.roomType, room.title]);
  const tradeListRowBgClass = isTradeChatListVisual
    ? "bg-white"
    : commerceMeta?.kind === "trade" && tradeViewerRoleForTint === "seller"
      ? "bg-[color:var(--messenger-trade-list-seller-bg)]"
      : commerceMeta?.kind === "trade" && tradeViewerRoleForTint === "buyer"
        ? "bg-[color:var(--messenger-trade-list-buyer-bg)]"
        : "bg-[color:var(--messenger-bg)]";
  const tradeListRowShellClass = isPillarChatListVisual
    ? "border-b border-[#E5EEE9] bg-white"
    : `border-b border-[color:var(--messenger-divider)] ${tradeListRowBgClass}`;
  const roomStoreId = useMemo(() => normalizeMessengerRealtimeRoomId(room.id), [room.id]);
  const tradeRowModel = useMemo(
    () => (isTradeChatListVisual ? buildTradeChatListRowModel(room, t, viewerUserId) : null),
    [isTradeChatListVisual, room, t, viewerUserId]
  );
  const tradeListTimeLabel = useMemo(
    () => (isTradeChatListVisual ? formatTradeChatListTimestamp(item.lastEventAt) : ""),
    [isTradeChatListVisual, item.lastEventAt]
  );
  const deliveryRowModel = useMemo(
    () => (isDeliveryChatListVisual ? buildDeliveryChatListRowModel(room, t) : null),
    [isDeliveryChatListVisual, room, t]
  );
  const deliveryListTimeLabel = useMemo(
    () => (isDeliveryChatListVisual ? formatDeliveryChatListShortTimestamp(item.lastEventAt) : ""),
    [isDeliveryChatListVisual, item.lastEventAt]
  );
  const tradeListPreview = useTradeChatListPostPreviewFields({
    postId: tradeRowModel?.postId,
    productTitle: tradeRowModel?.productTitle ?? "",
    productPriceText: tradeRowModel?.productPriceText,
  });
  const bootstrapUnreadFloor = Math.max(0, Math.floor(Number(room.unreadCount) || 0));
  const { count: displayedUnreadCount, tier: unreadDisplayTier } = useMessengerChatListUnread(room.id, bootstrapUnreadFloor);

  const unreadTierLoggedRef = useRef<string | null>(null);
  useEffect(() => {
    const sig = `${roomStoreId}:${unreadDisplayTier}:${displayedUnreadCount}`;
    if (unreadTierLoggedRef.current === sig) return;
    unreadTierLoggedRef.current = sig;
    cmReadUiLog("unread_source_selected", {
      roomId: room.id,
      postId: commerceMeta?.kind === "trade" ? commerceMeta.postId ?? null : null,
      productChatId: commerceMeta?.kind === "trade" ? commerceMeta.productChatId ?? null : null,
      source: unreadDisplayTier === "bootstrap-room" ? "local" : "cm",
      tier: unreadDisplayTier,
      beforeUnread: null,
      afterUnread: displayedUnreadCount,
      reason: "list_row_render",
    });
  }, [commerceMeta, displayedUnreadCount, room.id, roomStoreId, unreadDisplayTier]);

  const tradeUnreadBadgeLoggedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isTradeChatListVisual) return;
    const sig = `${roomStoreId}:${unreadDisplayTier}:${displayedUnreadCount}`;
    if (tradeUnreadBadgeLoggedRef.current === sig) return;
    tradeUnreadBadgeLoggedRef.current = sig;
    const routeRoomId =
      typeof window !== "undefined"
        ? window.location.pathname.match(/\/community-messenger\/rooms\/([^/?#]+)/)?.[1]?.trim().toLowerCase() ?? null
        : null;
    const unreadSource: "realtime" | "home-sync" | "silent_delta" | "manual" =
      unreadDisplayTier === "bootstrap-room" ? "home-sync" : "realtime";
    cmReceiveBadgeLog("trade_list_row_unread_render", {
      roomId: room.id,
      messageId: null,
      senderId: null,
      myUserId: viewerUserId ?? null,
      activeRoomId: useMessengerRealtimeStore.getState().activeRoomId,
      routeRoomId,
      isSelf: false,
      isActiveRoom: false,
      tier: unreadDisplayTier,
      beforeUnread: null,
      afterUnread: displayedUnreadCount,
      source: unreadSource,
    });
  }, [displayedUnreadCount, isTradeChatListVisual, room.id, roomStoreId, unreadDisplayTier, viewerUserId]);
  const lastClientMessage = useMessengerRealtimeStore((s) => {
    if (!isPillarChatListVisual) return null;
    const arr = s.messagesByRoomId[roomStoreId];
    if (!arr?.length) return null;
    return arr[arr.length - 1] ?? null;
  });
  const tradePreviewLine = useMemo(() => {
    if (commerceListPresentation.previewKey) {
      return t(commerceListPresentation.previewKey);
    }
    if (!isTradeChatListVisual || !tradeRowModel) return item.preview;
    return buildTradeChatListPreviewLine({
      listPreview: item.preview,
      peerName: tradeRowModel.peerName,
      lastClientMessage,
      t,
    });
  }, [
    commerceListPresentation.previewKey,
    isTradeChatListVisual,
    tradeRowModel,
    item.preview,
    lastClientMessage,
    t,
  ]);

  const deliveryPreviewLine = useMemo(() => {
    if (commerceListPresentation.previewKey && isDeliveryChatListVisual) {
      return t(commerceListPresentation.previewKey);
    }
    if (!isDeliveryChatListVisual || !deliveryRowModel) return item.preview;
    return buildDeliveryChatListPreviewLine({
      listPreview: item.preview,
      storeName: deliveryRowModel.storeName,
      lastClientMessage,
      t,
    });
  }, [
    commerceListPresentation.previewKey,
    deliveryRowModel,
    isDeliveryChatListVisual,
    item.preview,
    lastClientMessage,
    t,
  ]);

  useEffect(() => {
    if (!isTradeChatListVisual || process.env.NODE_ENV !== "development") return;
    const m = commerceMeta?.kind === "trade" ? commerceMeta : null;
    const postId = tradeRowModel?.postId ?? null;
    const titleFromMeta = tradeRowModel?.productTitle?.trim() ?? "";
    const weakTitle = !titleFromMeta || titleFromMeta === "거래";
    console.info("[trade-chat-link-debug]", {
      roomId: room.id,
      directKey: room.messengerDirectKey ?? null,
      productChatId: m?.productChatId ?? null,
      productChatRoomId: room.id,
      postId,
      postFound: Boolean(postId),
      postTitle: tradeListPreview.displayTitle,
      postCategory: m?.categoryMenuLabel ?? null,
      finalCategoryMenuLabel: tradeRowModel?.categoryChipLabel ?? null,
      finalHeadline: tradeListPreview.displayTitle,
      weakMetaHeadline: weakTitle,
    });
  }, [
    isTradeChatListVisual,
    room.id,
    room.messengerDirectKey,
    commerceMeta,
    tradeRowModel?.postId,
    tradeRowModel?.productTitle,
    tradeRowModel?.categoryChipLabel,
    tradeListPreview.displayTitle,
  ]);

  const secondaryHint =
    item.previewKind === "call" && item.callStatus === "missed"
      ? t("cm_ui_missed_call")
      : room.isReadonly
        ? t("cm_ui_read_only")
        : communityMessengerRoomIsInboxHidden(room)
          ? t("cm_ui_archived")
          : null;

  const kickRoomNavPrefetchOnPointerDown = useCallback(() => {
    armMessengerRoomRoutePrefetch({
      roomId: room.id,
      href: roomHref,
      router,
      source: "pointerdown",
      priorityScore: roomPrefetchPriority,
      viewerUserId,
      roomForPrime: room,
    });
    if (listVisual === "trade" && tradeRowModel?.postId) {
      prefetchTradePostThumbnailIfNeeded(tradeRowModel.postId);
    }
    if (listVisual === "delivery" && deliveryRowModel?.storeId) {
      prefetchStoreProfileThumbnailIfNeeded(deliveryRowModel.storeId);
    }
  }, [deliveryRowModel?.storeId, listVisual, room, roomHref, roomPrefetchPriority, router, tradeRowModel?.postId, viewerUserId]);

  const kickRoomNavPrefetchOnPointerEnter = useCallback(() => {
    if (hoverPrefetchOnceRef.current) return;
    hoverPrefetchOnceRef.current = true;
    armMessengerRoomRoutePrefetch({
      roomId: room.id,
      href: roomHref,
      router,
      source: "pointerenter",
      priorityScore: roomPrefetchPriority,
    });
  }, [room.id, roomHref, roomPrefetchPriority, router]);

  const navigateToCommunityRoom = useCallback(
    (rid: string) => {
      void runCommunityMessengerRoomForwardNavigation({
        router,
        roomId: rid,
        listSource: roomListSource,
        fromEntryOrigin,
        viewerUserId,
        roomForPrime: room,
      });
    },
    [fromEntryOrigin, room, roomListSource, router, viewerUserId]
  );

  const closeSwipe = useCallback(() => {
    dragXRef.current = 0;
    setDragX((prev) => (prev === 0 ? prev : 0));
    onOpenSwipeItem?.(null);
  }, [onOpenSwipeItem]);

  const clearReleasePressTimer = useCallback(() => {
    if (releasePressTimerRef.current) {
      clearTimeout(releasePressTimerRef.current);
      releasePressTimerRef.current = null;
    }
  }, []);

  const releasePressedVisual = useCallback(
    (delayMs = 0) => {
      clearReleasePressTimer();
      if (delayMs <= 0) {
        setIsPressedVisual(false);
        return;
      }
      releasePressTimerRef.current = setTimeout(() => {
        releasePressTimerRef.current = null;
        setIsPressedVisual(false);
      }, delayMs);
    },
    [clearReleasePressTimer]
  );

  const longPressHandler = useCallback(() => {
    closeSwipe();
    longPressTriggeredRef.current = true;
    tapNavigateArmedRef.current = false;
    setIsPressedVisual(true);
    releasePressedVisual(PRESS_RELEASE_MS);
    const rect = rowRef.current?.getBoundingClientRect();
    const anchorRect = rect
      ? {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }
      : null;
    if (compact && onCompactLongPress) {
      onCompactLongPress();
      return;
    }
    if (!compact) {
      onOpenRoomActions?.(item, listContext, anchorRect);
    }
  }, [closeSwipe, compact, item, listContext, onCompactLongPress, onOpenRoomActions, releasePressedVisual]);

  const { bind, cancelPending, consumeClickSuppression } = useMessengerLongPress(longPressHandler, {
    thresholdMs: LONG_PRESS_THRESHOLD_MS,
  });

  useEffect(() => {
    return () => {
      clearReleasePressTimer();
    };
  }, [clearReleasePressTimer]);

  useEffect(() => {
    dragXRef.current = dragX;
  }, [dragX]);

  useEffect(() => {
    if (openedSwipeItemId && openedSwipeItemId !== swipeItemId) {
      dragXRef.current = 0;
      setDragX((prev) => (prev === 0 ? prev : 0));
    }
  }, [openedSwipeItemId, swipeItemId]);

  useEffect(() => {
    if (openedSwipeItemId === swipeItemId) {
      dragXRef.current = -actionTotalPx;
      setDragX(-actionTotalPx);
      setIsPressedVisual(false);
    }
  }, [actionTotalPx, openedSwipeItemId, swipeItemId]);

  useEffect(() => {
    if (openedSwipeItemId === swipeItemId) {
      releasePressedVisual();
    }
  }, [openedSwipeItemId, releasePressedVisual, swipeItemId]);

  const clamp = useCallback((x: number) => Math.max(-actionTotalPx, Math.min(0, x)), [actionTotalPx]);
  const swipeOpen = openedSwipeItemId === swipeItemId;
  const pressVisualActive = isPressedVisual && !isDragging && !swipeOpen;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (compact) return;
    if (e.button !== 0) return;
    clearReleasePressTimer();
    suppressTapRef.current = false;
    longPressTriggeredRef.current = false;
    tapNavigateArmedRef.current = true;
    setIsPressedVisual(!swipeOpen);
    kickRoomNavPrefetchOnPointerDown();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origin: dragXRef.current,
      active: true,
      dragging: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [clearReleasePressTimer, compact, kickRoomNavPrefetchOnPointerDown, swipeOpen]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (compact) return;
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (!dragRef.current.dragging) {
        if (Math.abs(dy) > DRAG_CANCEL_Y && Math.abs(dy) > Math.abs(dx)) {
          dragRef.current.active = false;
          releasePressedVisual();
          return;
        }
        if (Math.abs(dx) < DRAG_START_X || Math.abs(dx) <= Math.abs(dy)) {
          return;
        }
        dragRef.current.dragging = true;
        cancelPending();
        suppressTapRef.current = true;
        tapNavigateArmedRef.current = false;
        setIsDragging((prev) => (prev ? prev : true));
        releasePressedVisual();
      }
      const next = clamp(dragRef.current.origin + dx);
      dragXRef.current = next;
      setDragX(next);
    },
    [cancelPending, clamp, compact, releasePressedVisual]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (compact) return;
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      const wasDragging = dragRef.current.dragging;
      dragRef.current.dragging = false;
      setIsDragging((prev) => (prev ? false : prev));
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        /* noop */
      }
      if (!wasDragging) {
        if (suppressTapRef.current) {
          suppressTapRef.current = false;
          tapNavigateArmedRef.current = false;
          releasePressedVisual();
          return;
        }
        if (!tapNavigateArmedRef.current) {
          releasePressedVisual();
          return;
        }
        tapNavigateArmedRef.current = false;
        if (longPressTriggeredRef.current || consumeClickSuppression()) {
          releasePressedVisual(PRESS_RELEASE_MS);
          return;
        }
        if (dragXRef.current < -16) {
          closeSwipe();
          releasePressedVisual();
          return;
        }
        // 라우팅을 가장 먼저 시작(메인스레드 정리/리렌더보다 우선) — 체감 멈칫 최소화.
        markCommunityMessengerRoomNavTap(room.id);
        void navigateToCommunityRoom(room.id);
        setIsPressedVisual(true);
        releasePressedVisual(PRESS_RELEASE_MS);
        return;
      }
      const snap = dragXRef.current < -actionTotalPx / 2 ? -actionTotalPx : 0;
      dragXRef.current = snap;
      setDragX(snap);
      onCloseMenuItem?.(menuItemId);
      onOpenSwipeItem?.(snap === -actionTotalPx ? swipeItemId : null);
      releasePressedVisual();
    },
    [
      actionTotalPx,
      closeSwipe,
      compact,
      consumeClickSuppression,
      menuItemId,
      onCloseMenuItem,
      onOpenSwipeItem,
      onResetTransientUi,
      releasePressedVisual,
      navigateToCommunityRoom,
      room.id,
      swipeItemId,
    ]
  );

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    dragRef.current.active = false;
    dragRef.current.dragging = false;
    setIsDragging(false);
    releasePressedVisual();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }
  }, [releasePressedVisual]);

  const runRowAction = useCallback(
    (fn: () => void) => {
      closeSwipe();
      onCloseMenuItem?.(menuItemId);
      fn();
    },
    [closeSwipe, menuItemId, onCloseMenuItem]
  );

  const swipeActionSurfaceClass = useCallback((kind: MessengerSwipeActionKind) => {
    if (kind === "leave") return "bg-orange-600";
    if (kind === "read") return "bg-slate-500";
    return "bg-amber-600";
  }, []);

  const runSwipeKind = useCallback(
    (kind: MessengerSwipeActionKind) => {
      if (kind === "archive") runRowAction(() => onToggleArchive(room));
      else if (kind === "read") runRowAction(() => onMarkRead(room));
      else runRowAction(() => onLeaveRoom(room));
    },
    [onLeaveRoom, onMarkRead, onToggleArchive, room, runRowAction]
  );

  const swipeActionDisabled = useCallback(
    (kind: MessengerSwipeActionKind) => {
      if (kind === "archive") return archiveBusy;
      if (kind === "read") return readBusy || displayedUnreadCount <= 0;
      return leaveBusy;
    },
    [archiveBusy, displayedUnreadCount, leaveBusy, readBusy]
  );

  const avatarBlock =
    isDeliveryChatListVisual && deliveryRowModel ? (
      <StoreProfileThumb
        src={deliveryRowModel.storeThumbnailUrl}
        storeId={deliveryRowModel.storeId}
        storeName={deliveryRowModel.storeName}
      />
    ) : isTradeChatListVisual && tradeRowModel ? (
      <TradeProductThumb
        src={tradeRowModel.productThumbnailUrl}
        postId={tradeRowModel.postId}
        categoryChipLabel={tradeRowModel.categoryChipLabel}
      />
    ) : commerceMeta?.thumbnailUrl ? (
      <div className="relative">
        <CommerceThumb src={commerceMeta.thumbnailUrl} fallbackAvatarUrl={room.avatarUrl} fallbackLabel={listDisplayTitle} />
        {presencePeerUserId ? <MessengerChatListItemPresenceDot peerUserId={presencePeerUserId} /> : null}
      </div>
    ) : (
      <div className="relative">
        <AvatarCircle
          src={room.avatarUrl}
          label={listDisplayTitle}
          roomType={room.roomType}
          sizeClassName="h-12 w-12"
          textClassName="sam-text-body"
        />
        {presencePeerUserId ? <MessengerChatListItemPresenceDot peerUserId={presencePeerUserId} /> : null}
      </div>
    );

  const productStatusForTrailing =
    !isTradeChatListVisual && commerceMeta?.kind === "trade" && commerceMeta.itemStateLabel?.trim()
      ? commerceMeta.itemStateLabel.trim()
      : null;

  const trailingBlock =
    isDeliveryChatListVisual && deliveryRowModel ? (
      <>
        <span
          className="whitespace-nowrap text-right sam-text-helper font-normal tabular-nums leading-none"
          style={{ color: "var(--messenger-text-secondary)" }}
        >
          {deliveryListTimeLabel}
        </span>
        {displayedUnreadCount > 0 ? (
          <span
            data-cm-unread-badge="true"
            className="mt-1.5 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#006241] px-1 text-center sam-text-xxs font-semibold leading-[18px] text-white"
          >
            {displayedUnreadCount > 999 ? "999+" : displayedUnreadCount}
          </span>
        ) : (
          <span className="mt-1.5 block h-[18px]" aria-hidden />
        )}
      </>
    ) : isTradeChatListVisual && tradeRowModel ? (
      <>
        <span
          className="whitespace-nowrap text-right sam-text-helper font-normal tabular-nums leading-none"
          style={{ color: "var(--messenger-text-secondary)" }}
        >
          {tradeListTimeLabel}
        </span>
        {displayedUnreadCount > 0 ? (
          <span
            data-cm-unread-badge="true"
            className="mt-1.5 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#006241] px-1 text-center sam-text-xxs font-semibold leading-[18px] text-white"
          >
            {displayedUnreadCount > 999 ? "999+" : displayedUnreadCount}
          </span>
        ) : (
          <span className="mt-1.5 block h-[18px]" aria-hidden />
        )}
      </>
    ) : (
      <>
        <span className="sam-text-helper font-normal tabular-nums" style={{ color: "var(--messenger-text-secondary)" }}>
          {formatConversationTimestamp(item.lastEventAt)}
        </span>
        <div className="flex flex-col items-end gap-0.5">
          <div className="flex items-center gap-0.5">
            {room.isPinned ? (
              <span style={{ color: "var(--messenger-text-secondary)" }} aria-label={t("cm_ui_pinned")}>
                <PinIcon />
              </span>
            ) : null}
            {room.isMuted ? (
              <span style={{ color: "var(--messenger-text-secondary)" }} aria-label={t("cm_ui_notifications_off")}>
                <MuteIcon />
              </span>
            ) : null}
            {displayedUnreadCount > 0 ? (
              <span
                data-cm-unread-badge="true"
                className="min-h-[18px] min-w-[18px] rounded-full bg-[color:var(--messenger-primary)] px-1 text-center sam-text-xxs font-semibold leading-[18px] text-white"
              >
                {displayedUnreadCount > 999 ? "999+" : displayedUnreadCount}
              </span>
            ) : null}
          </div>
          {productStatusForTrailing ? (
            <span
              className="max-w-[6rem] truncate text-right sam-text-xxs font-normal leading-none"
              style={{ color: "var(--messenger-text-secondary)" }}
            >
              {productStatusForTrailing}
            </span>
          ) : null}
        </div>
      </>
    );

  const rowSurfaceClass = `transition-colors duration-100 ${pressVisualActive ? "bg-[color:var(--messenger-surface-muted)]" : ""}`;

  const rowContent =
    isDeliveryChatListVisual && deliveryRowModel ? (
      <DeliveryChatListRowContent
        rowSurfaceClass={rowSurfaceClass}
        avatar={avatarBlock}
        trailing={trailingBlock}
        storeName={deliveryRowModel.storeName}
        previewLine={deliveryPreviewLine}
        statusLabel={deliveryRowModel.orderStatusLabel ?? ""}
        statusBadgeClassName={deliveryRowModel.statusBadgeClassName}
        unread={displayedUnreadCount > 0}
      />
    ) : isTradeChatListVisual && tradeRowModel ? (
      <TradeChatListRowContent
        rowSurfaceClass={rowSurfaceClass}
        avatar={avatarBlock}
        trailing={trailingBlock}
        productTitle={tradeListPreview.displayTitle}
        previewLine={tradePreviewLine}
        rolePrefix={tradeRowModel.rolePrefix}
        productPriceText={tradeListPreview.displayPriceText}
        statusLabel={tradeRowModel.statusLabel}
        statusBadgeClassName={tradeRowModel.statusBadgeClassName}
        unread={displayedUnreadCount > 0}
      />
    ) : (
      <MessengerListRow className={rowSurfaceClass} avatar={avatarBlock} trailing={trailingBlock}>
        <div className="flex min-w-0 items-center gap-1">
          <p className="min-w-0 truncate sam-text-body font-semibold leading-tight" style={{ color: "var(--messenger-text)" }}>
            {listDisplayTitle}
          </p>
          {titleSuffix ? (
            <span className="shrink-0 sam-text-helper font-normal" style={{ color: "var(--messenger-text-secondary)" }}>
              {titleSuffix}
            </span>
          ) : null}
          <CommunityMessengerChatTypeBadge room={room} />
          {showStrangerBadge ? (
            <span className="shrink-0 rounded-[6px] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-1 py-px sam-text-xxs font-medium text-[color:var(--messenger-text-secondary)]">
              {t("cm_peer_badge_not_friend")}
            </span>
          ) : null}
          {room.philifeMeetingMemberLabel ? (
            <span
              className="shrink-0 rounded-[6px] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-1 py-px sam-text-xxs font-medium text-[color:var(--messenger-text-secondary)]"
              title={t("cm_ui_philife_meeting")}
            >
              {philifeMeetingMemberRoleLabel(room.philifeMeetingMemberLabel)}
            </span>
          ) : null}
          {commerceMeta?.kind === "trade" && tradeItemStateLabel ? (
            <span className="shrink-0 rounded-[6px] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-1 py-px sam-text-xxs font-medium text-[color:var(--messenger-text-secondary)]">
              {tradeItemStateLabel}
            </span>
          ) : null}
        </div>
        {commerceMeta?.kind === "trade" ? (
          tradeRoleLabel ? (
            <p className="mt-0.5 truncate sam-text-helper font-normal leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
              {tradeRoleLabel}
            </p>
          ) : null
        ) : commerceSubline ? (
          <p className="mt-0.5 truncate sam-text-helper font-normal leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
            {commerceSubline}
          </p>
        ) : null}
        <div className="mt-0.5 flex min-w-0 items-center gap-1">
          {commerceMeta?.kind === "delivery" && deliveryStepLabel ? (
            <span className="shrink-0 rounded-[6px] border border-[color:var(--messenger-divider)] px-1 py-px sam-text-xxs font-medium text-[color:var(--messenger-text-secondary)]">
              {deliveryStepLabel}
            </span>
          ) : null}
          {secondaryHint ? (
            <span
              className="shrink-0 rounded-[6px] border border-[color:var(--messenger-divider)] px-1 py-px sam-text-xxs font-normal"
              style={{ color: "var(--messenger-text-secondary)" }}
            >
              {secondaryHint}
            </span>
          ) : null}
          {isFavorite ? (
            <span className="shrink-0 sam-text-xxs" style={{ color: "var(--messenger-primary)" }}>
              ★
            </span>
          ) : null}
          <p
            className={`min-w-0 truncate sam-text-body-secondary font-normal leading-snug ${displayedUnreadCount > 0 ? "font-medium" : ""}`}
            style={{
              color: displayedUnreadCount > 0 ? "var(--messenger-text)" : "var(--messenger-text-secondary)",
            }}
          >
            {item.preview}
          </p>
        </div>
      </MessengerListRow>
    );

  if (compact && onCompactLongPress) {
    return (
      <div
        ref={prefetchAttach}
        role="button"
        tabIndex={0}
        {...bind}
        onPointerEnter={kickRoomNavPrefetchOnPointerEnter}
        onPointerDown={(e) => {
          kickRoomNavPrefetchOnPointerDown();
          bind.onPointerDown(e);
        }}
        onClick={() => {
          if (consumeClickSuppression()) return;
          void navigateToCommunityRoom(room.id);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (consumeClickSuppression()) return;
            void navigateToCommunityRoom(room.id);
          }
        }}
        className={`block cursor-default px-0 py-0 touch-manipulation transition-colors duration-100 ease-out ${tradeListRowShellClass}`}
      >
        {rowContent}
      </div>
    );
  }

  if (compact) {
    return (
      <Link
        ref={prefetchAttach}
        prefetch={false}
        href={roomHref}
        onPointerEnter={kickRoomNavPrefetchOnPointerEnter}
        onPointerDown={() => {
          kickRoomNavPrefetchOnPointerDown();
        }}
        onClick={(e) => {
          e.preventDefault();
          void navigateToCommunityRoom(room.id);
        }}
        className={`block px-0 py-0 transition-colors duration-100 ease-out ${tradeListRowShellClass}`}
      >
        {rowContent}
      </Link>
    );
  }

  return (
    <div
      ref={setMainRowRef}
      className={`relative w-full min-w-0 overflow-hidden ${tradeListRowShellClass}`}
      data-messenger-chat-row="true"
      data-messenger-trade-row-role={tradeViewerRoleForTint ?? undefined}
    >
      <div className="absolute inset-y-0 right-0 flex" aria-hidden={dragX === 0}>
        {swipeActions.map((action) => (
          <button
            key={action.kind}
            type="button"
            onClick={() => runSwipeKind(action.kind)}
            disabled={swipeActionDisabled(action.kind)}
            className={`flex w-[78px] items-center justify-center px-2 sam-text-helper font-semibold text-white disabled:opacity-50 ${swipeActionSurfaceClass(action.kind)}`}
          >
            {swipeActionLabel(action, safeT)}
          </button>
        ))}
      </div>
      <div
        className={`relative flex min-w-0 flex-row ${tradeListRowBgClass} touch-pan-y`}
        style={{
          transform: `translate3d(${dragX}px,0,0)`,
          transition: isDragging ? "none" : "transform 0.2s ease-out",
          willChange: isDragging ? "transform" : undefined,
        }}
        onPointerEnter={kickRoomNavPrefetchOnPointerEnter}
        onPointerDown={(e) => {
          if (!compact && e.button === 0) bind.onPointerDown(e);
          onPointerDown(e);
        }}
        onPointerMove={(e) => {
          if (!compact) bind.onPointerMove(e);
          onPointerMove(e);
        }}
        onPointerUp={(e) => {
          if (!compact) bind.onPointerUp(e);
          onPointerUp(e);
        }}
        onPointerCancel={(e) => {
          if (!compact) bind.onPointerCancel(e);
          onPointerCancel(e);
        }}
        onLostPointerCapture={(e) => {
          if (!compact) bind.onPointerCancel(e);
          onPointerCancel(e);
        }}
      >
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (longPressTriggeredRef.current || consumeClickSuppression()) return;
              if (dragXRef.current < -16) {
                closeSwipe();
                return;
              }
              void navigateToCommunityRoom(room.id);
            }
          }}
          className="block w-full flex-1 cursor-default border-0 px-0 py-0 transition-colors duration-100 ease-out"
          style={{
            minWidth: 0,
            flex: "1 1 0%",
            backgroundColor: "transparent",
          }}
        >
          {rowContent}
        </div>
      </div>
    </div>
  );
}, messengerChatListItemPropsEqual);

MessengerChatListItem.displayName = "MessengerChatListItem";

function CommerceThumb({
  src,
  fallbackAvatarUrl,
  fallbackLabel,
}: {
  src: string;
  fallbackAvatarUrl: string | null;
  fallbackLabel: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <SamarketUserAvatarThumb
        avatarUrl={fallbackAvatarUrl}
        size={48}
        roundedClassName="rounded-full"
        className="border border-[color:var(--messenger-divider)] bg-ui-hover h-12 w-12"
      />
    );
  }
  return (
    <SamarketThumbnail
      src={src}
      size={48}
      roundedClassName="rounded-[8px]"
      className="border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)]"
      fallbackSrc=""
      fallbackNode={
        <SamarketUserAvatarThumb
          avatarUrl={fallbackAvatarUrl}
          size={48}
          roundedClassName="rounded-full"
          className="border border-[color:var(--messenger-divider)] bg-ui-hover h-12 w-12"
        />
      }
      onImageError={() => setFailed(true)}
    />
  );
}

function AvatarCircle({
  src,
  label,
  roomType,
  sizeClassName,
  textClassName,
}: {
  src?: string | null;
  label: string;
  roomType?: string;
  sizeClassName: string;
  textClassName: string;
}) {
  if (roomType === "direct") {
    return (
      <SamarketUserAvatarThumb
        avatarUrl={src}
        size={48}
        roundedClassName="rounded-full"
        className={`bg-ui-hover ${sizeClassName}`}
      />
    );
  }

  const safeSrc = typeof src === "string" && src.trim().length > 0 ? src.trim() : "";
  const [imageFailed, setImageFailed] = useState(false);
  const initial = label.trim().slice(0, 1).toUpperCase() || "?";

  useEffect(() => {
    setImageFailed(false);
  }, [safeSrc]);

  return (
    <SamarketThumbnail
      src={safeSrc && !imageFailed ? safeSrc : null}
      size={48}
      roundedClassName="rounded-full"
      className={`bg-ui-hover ${sizeClassName}`}
      fallbackSrc=""
      fallbackNode={<div className={`flex h-full w-full items-center justify-center font-semibold text-ui-muted ${textClassName}`}>{initial}</div>}
      onImageError={() => setImageFailed(true)}
    />
  );
}

function getRoomTypeBadgeClassName(_label: string): string {
  return "bg-[color:var(--messenger-surface-muted)] text-[color:var(--messenger-text-secondary)]";
}

function PinIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 4l6 6-3 1-3 6-2-2-4 5-1-1 5-4-2-2 6-3 1-3z" />
    </svg>
  );
}

function MuteIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 9v6h4l5 4V5l-5 4H5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l5 8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8l-5 8" />
    </svg>
  );
}

