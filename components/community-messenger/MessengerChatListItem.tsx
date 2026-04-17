"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { prefetchCommunityMessengerRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import { markCommunityMessengerRoomNavTap } from "@/lib/community-messenger/room-nav-timing";
import { useMessengerLongPress } from "@/lib/community-messenger/use-messenger-long-press";
import {
  messengerRoomMenuItemId,
  messengerRoomSwipeItemId,
  type MessengerChatListContext,
} from "@/lib/community-messenger/messenger-ia";
import { communityMessengerRoomIsInboxHidden, type CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import {
  formatConversationTimestamp,
  getRoomTypeBadgeLabel,
  type UnifiedRoomListItem,
} from "@/lib/community-messenger/use-community-messenger-home-state";
import { useCommunityMessengerPeerPresence } from "@/lib/community-messenger/realtime/presence/use-community-messenger-peer-presence";
import { CommunityMessengerPresenceDot } from "@/components/community-messenger/CommunityMessengerPresenceDot";

const ACTION_W = 78;
const ACTION_TOTAL = ACTION_W * 3;
const DRAG_START_X = 16;
const DRAG_CANCEL_Y = 14;
const PRESS_RELEASE_MS = 90;
const LONG_PRESS_THRESHOLD_MS = 560;

export type MessengerMenuAnchorRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

type Props = {
  item: UnifiedRoomListItem;
  favoriteFriendIds: Set<string>;
  busyId: string | null;
  onTogglePin: (room: CommunityMessengerRoomSummary) => void;
  onToggleMute: (room: CommunityMessengerRoomSummary) => void;
  onMarkRead: (room: CommunityMessengerRoomSummary) => void;
  onToggleArchive: (room: CommunityMessengerRoomSummary) => void;
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
};

export const MessengerChatListItem = memo(function MessengerChatListItem({
  item,
  favoriteFriendIds,
  busyId: _busyId,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onToggleArchive,
  onOpenRoomActions,
  listContext = "default",
  compact = false,
  onCompactLongPress,
  openedSwipeItemId = null,
  onOpenSwipeItem,
  onCloseMenuItem,
  onResetTransientUi,
}: Props) {
  const router = useRouter();
  const room = item.room;
  const rowRef = useRef<HTMLDivElement | null>(null);
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
  const roomTypeLabel = getRoomTypeBadgeLabel(room);
  const commerceMeta = room.contextMeta;
  const isFavorite = room.peerUserId ? favoriteFriendIds.has(room.peerUserId) : false;
  const peerPresence = useCommunityMessengerPeerPresence(room.peerUserId ?? null);
  const titleSuffix = room.roomType !== "direct" && room.memberCount > 0 ? String(room.memberCount) : "";
  const commerceSubline =
    commerceMeta && (commerceMeta.headline || commerceMeta.priceLabel)
      ? [commerceMeta.headline, commerceMeta.priceLabel].filter(Boolean).join(" · ")
      : null;
  const settingsBusy = _busyId === `room-settings:${room.id}`;
  const archiveBusy = _busyId === `room-archive:${room.id}`;
  const readBusy = _busyId === `room-read:${room.id}`;
  const swipeItemId = messengerRoomSwipeItemId(room.id, listContext);
  const menuItemId = messengerRoomMenuItemId(room.id, listContext);
  const tradeRoleLabel = commerceMeta?.kind === "trade" ? commerceMeta.roleLabel?.trim() || null : null;
  const tradeItemStateLabel = commerceMeta?.kind === "trade" ? commerceMeta.itemStateLabel?.trim() || null : null;
  const deliveryStepLabel = commerceMeta?.kind === "delivery" ? commerceMeta.stepLabel?.trim() || null : null;

  const secondaryHint =
    item.previewKind === "call" && item.callStatus === "missed"
      ? "부재중"
      : room.isReadonly
        ? "읽기 전용"
        : communityMessengerRoomIsInboxHidden(room)
          ? "보관됨"
          : null;

  const navigateToCommunityRoom = useCallback(
    (rid: string) => {
      const id = String(rid ?? "").trim();
      if (!id) return;
      const href = `/community-messenger/rooms/${encodeURIComponent(id)}`;
      void prefetchCommunityMessengerRoomSnapshot(id);
      void router.prefetch(href);
      router.push(href);
    },
    [router]
  );

  const closeSwipe = useCallback(() => {
    dragXRef.current = 0;
    setDragX(0);
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
      setDragX(0);
    }
  }, [openedSwipeItemId, swipeItemId]);

  useEffect(() => {
    if (openedSwipeItemId === swipeItemId) {
      dragXRef.current = -ACTION_TOTAL;
      setDragX(-ACTION_TOTAL);
      setIsPressedVisual(false);
    }
  }, [openedSwipeItemId, swipeItemId]);

  useEffect(() => {
    if (openedSwipeItemId === swipeItemId) {
      releasePressedVisual();
    }
  }, [openedSwipeItemId, releasePressedVisual, swipeItemId]);

  const clamp = useCallback((x: number) => Math.max(-ACTION_TOTAL, Math.min(0, x)), []);
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
    {
      const href = `/community-messenger/rooms/${encodeURIComponent(room.id)}`;
      void prefetchCommunityMessengerRoomSnapshot(room.id);
      void router.prefetch(href);
    }
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origin: dragXRef.current,
      active: true,
      dragging: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [clearReleasePressTimer, compact, room.id, router, swipeOpen]);

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
        setIsDragging(true);
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
      setIsDragging(false);
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
        navigateToCommunityRoom(room.id);
        setIsPressedVisual(true);
        releasePressedVisual(PRESS_RELEASE_MS);
        return;
      }
      const snap = dragXRef.current < -ACTION_TOTAL / 2 ? -ACTION_TOTAL : 0;
      dragXRef.current = snap;
      setDragX(snap);
      onCloseMenuItem?.(menuItemId);
      onOpenSwipeItem?.(snap === -ACTION_TOTAL ? swipeItemId : null);
      releasePressedVisual();
    },
    [
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

  const rowContent = (
    <div
      className="flex items-start gap-2 transition-transform duration-[110ms] ease-out"
      style={{
        transform: pressVisualActive
          ? "translate3d(0,0.5px,0) scale(0.992)"
          : "translate3d(0,0,0) scale(1)",
      }}
    >
      {commerceMeta?.thumbnailUrl ? (
        <div className="relative">
          <CommerceThumb src={commerceMeta.thumbnailUrl} fallbackAvatarUrl={room.avatarUrl} fallbackLabel={room.title} />
          {room.roomType === "direct" && peerPresence ? (
            <CommunityMessengerPresenceDot state={peerPresence.state} />
          ) : null}
        </div>
      ) : (
        <div className="relative">
          <AvatarCircle src={room.avatarUrl} label={room.title} sizeClassName="h-9 w-9" textClassName="text-[12px]" />
          {room.roomType === "direct" && peerPresence ? (
            <CommunityMessengerPresenceDot state={peerPresence.state} />
          ) : null}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="min-w-0 truncate text-[13px] font-semibold leading-tight" style={{ color: "var(--messenger-text)" }}>
            {room.title}
          </p>
          {titleSuffix ? (
            <span className="shrink-0 text-[11px]" style={{ color: "var(--messenger-text-secondary)" }}>
              {titleSuffix}
            </span>
          ) : null}
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold leading-none ${getRoomTypeBadgeClassName(
              roomTypeLabel
            )}`}
          >
            {roomTypeLabel}
          </span>
          {commerceMeta?.kind === "trade" && tradeItemStateLabel ? (
            <span className="shrink-0 rounded-full border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-2 py-0.5 text-[9px] font-semibold text-[color:var(--messenger-text-secondary)]">
              {tradeItemStateLabel}
            </span>
          ) : null}
        </div>
        {commerceMeta?.kind === "trade" ? (
          tradeRoleLabel ? (
            <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--messenger-text-secondary)" }}>
              {tradeRoleLabel}
            </p>
          ) : null
        ) : commerceSubline ? (
          <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--messenger-text-secondary)" }}>
            {commerceSubline}
          </p>
        ) : null}
        <div className="mt-0.5 flex items-center gap-1">
          {commerceMeta?.kind === "delivery" ? (
            deliveryStepLabel ? (
              <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-semibold text-amber-700">
                {deliveryStepLabel}
              </span>
            ) : null
          ) : null}
          {secondaryHint ? (
            <span
              className="shrink-0 rounded-sm border border-[color:var(--messenger-divider)] px-1 py-px text-[10px] font-medium"
              style={{ color: "var(--messenger-text-secondary)" }}
            >
              {secondaryHint}
            </span>
          ) : null}
          {isFavorite ? (
            <span className="shrink-0 text-[10px]" style={{ color: "var(--messenger-primary)" }}>
              ★
            </span>
          ) : null}
          <p
            className={`min-w-0 truncate text-[11px] ${room.unreadCount > 0 ? "font-medium" : ""}`}
            style={{ color: room.unreadCount > 0 ? "var(--messenger-text)" : "var(--messenger-text-secondary)" }}
          >
            {item.preview}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 pl-0.5">
        <span className="text-[10px] tabular-nums" style={{ color: "var(--messenger-text-secondary)" }}>
          {formatConversationTimestamp(item.lastEventAt)}
        </span>
        <div className="flex items-center gap-0.5">
          {room.isPinned ? (
            <span style={{ color: "var(--messenger-text-secondary)" }} aria-label="고정됨">
              <PinIcon />
            </span>
          ) : null}
          {room.isMuted ? (
            <span style={{ color: "var(--messenger-text-secondary)" }} aria-label="알림 끔">
              <MuteIcon />
            </span>
          ) : null}
          {room.unreadCount > 0 ? (
            <span className="min-w-[16px] rounded-full bg-[color:var(--messenger-primary)] px-1 py-px text-center text-[9px] font-semibold leading-none text-white">
              {room.unreadCount > 999 ? "999+" : room.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (compact && onCompactLongPress) {
    return (
      <div
        role="button"
        tabIndex={0}
        {...bind}
        onClick={() => {
          if (consumeClickSuppression()) return;
          navigateToCommunityRoom(room.id);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (consumeClickSuppression()) return;
            navigateToCommunityRoom(room.id);
          }
        }}
        className="block cursor-default rounded-[calc(var(--messenger-radius-md)-2px)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-2.5 py-2 touch-manipulation transition-[background-color,border-color,transform] duration-100 ease-out active:translate-y-[0.5px] active:scale-[0.994] active:border-[color:var(--messenger-primary)] active:bg-[color:var(--messenger-primary-soft)]"
      >
        {rowContent}
      </div>
    );
  }

  if (compact) {
    return (
      <Link
        prefetch
        href={`/community-messenger/rooms/${encodeURIComponent(room.id)}`}
        onPointerDown={() => {
          void prefetchCommunityMessengerRoomSnapshot(room.id);
          void router.prefetch(`/community-messenger/rooms/${encodeURIComponent(room.id)}`);
        }}
        className="block rounded-[calc(var(--messenger-radius-md)-2px)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-2.5 py-2 transition-[background-color,border-color,transform] duration-100 ease-out active:translate-y-[0.5px] active:scale-[0.994] active:border-[color:var(--messenger-primary)] active:bg-[color:var(--messenger-primary-soft)]"
      >
        {rowContent}
      </Link>
    );
  }

  return (
    <div
      ref={rowRef}
      className="relative overflow-hidden rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)]"
      data-messenger-chat-row="true"
    >
      <div className="absolute inset-y-0 right-0 flex" aria-hidden={dragX === 0}>
        <button
          type="button"
          onClick={() => runRowAction(() => onTogglePin(room))}
          disabled={settingsBusy}
          className="flex w-[78px] items-center justify-center bg-violet-600 px-2 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {room.isPinned ? "고정 해제" : "고정"}
        </button>
        <button
          type="button"
          onClick={() => runRowAction(() => onToggleMute(room))}
          disabled={settingsBusy}
          className="flex w-[78px] items-center justify-center bg-slate-600 px-2 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {room.isMuted ? "알림 켜기" : "알림 끄기"}
        </button>
        <button
          type="button"
          onClick={() =>
            runRowAction(() => {
              if (room.unreadCount > 0 && !readBusy) onMarkRead(room);
              onToggleArchive(room);
            })
          }
          disabled={archiveBusy || readBusy}
          className="flex w-[78px] items-center justify-center bg-amber-600 px-2 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {listContext === "archive" ? "복원" : "보관"}
        </button>
      </div>
      <div
        className="relative flex min-w-0 flex-row bg-[color:var(--messenger-surface)] touch-pan-y"
        style={{
          transform: `translate3d(${dragX}px,0,0)`,
          transition: isDragging ? "none" : "transform 0.2s ease-out",
          willChange: isDragging ? "transform" : undefined,
        }}
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
              navigateToCommunityRoom(room.id);
            }
          }}
          className="block w-full flex-1 cursor-default rounded-[calc(var(--messenger-radius-md)-2px)] border px-2.5 py-2 transition-[background-color,border-color,transform] duration-100 ease-out"
          style={{
            minWidth: 0,
            flex: "1 1 0%",
            backgroundColor: pressVisualActive
              ? "var(--messenger-primary-soft)"
              : "var(--messenger-surface)",
            borderColor: pressVisualActive
              ? "var(--messenger-primary)"
              : "var(--messenger-divider)",
            transform: pressVisualActive ? "translate3d(0,0.5px,0)" : "translate3d(0,0,0)",
          }}
        >
          {rowContent}
        </div>
      </div>
    </div>
  );
});

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
    return <AvatarCircle src={fallbackAvatarUrl} label={fallbackLabel} sizeClassName="h-9 w-9" textClassName="text-[12px]" />;
  }
  return (
    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-ui-rect border border-ui-border bg-ui-page">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={36}
        height={36}
        className="h-full w-full object-cover"
        decoding="async"
        fetchPriority="low"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function AvatarCircle({
  src,
  label,
  sizeClassName,
  textClassName,
}: {
  src?: string | null;
  label: string;
  sizeClassName: string;
  textClassName: string;
}) {
  const safeSrc = typeof src === "string" && src.trim().length > 0 ? src.trim() : "";
  const [imageFailed, setImageFailed] = useState(false);
  const initial = label.trim().slice(0, 1).toUpperCase() || "?";

  useEffect(() => {
    setImageFailed(false);
  }, [safeSrc]);

  return (
    <div className={`shrink-0 overflow-hidden rounded-full bg-ui-hover ${sizeClassName}`}>
      {safeSrc && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={safeSrc}
          alt=""
          width={36}
          height={36}
          className="h-full w-full object-cover"
          decoding="async"
          fetchPriority="low"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className={`flex h-full w-full items-center justify-center font-semibold text-ui-muted ${textClassName}`}>{initial}</div>
      )}
    </div>
  );
}

function getRoomTypeBadgeClassName(label: string): string {
  if (label.startsWith("1:1")) return "border border-violet-200 bg-violet-50 text-violet-700";
  if (label.startsWith("그룹")) return "border border-sky-200 bg-sky-50 text-sky-700";
  if (label.startsWith("오픈")) return "border border-cyan-200 bg-cyan-50 text-cyan-700";
  if (label.startsWith("거래")) return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  if (label.startsWith("배달")) return "border border-amber-200 bg-amber-50 text-amber-700";
  return "border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] text-[color:var(--messenger-text-secondary)]";
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

