"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { messengerFriendSwipeItemId } from "@/lib/community-messenger/messenger-ia";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import { useCommunityMessengerPeerPresence } from "@/lib/community-messenger/realtime/presence/use-community-messenger-peer-presence";
import { CommunityMessengerPresenceDot } from "@/components/community-messenger/CommunityMessengerPresenceDot";
import { MessengerListRow } from "@/components/community-messenger/line-ui";

const ACTION_W = 72;
const LEFT_ACTION_TOTAL = ACTION_W * 2;
const RIGHT_ACTION_TOTAL = ACTION_W * 2;
const DRAG_START_X = 16;
const DRAG_CANCEL_Y = 14;
/** 퀵 메뉴(롱프레스) — 이보다 짧게 누르면 탭은 메뉴를 열지 않음 */
const FRIEND_QUICK_MENU_LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_CANCEL_PX = 14;

type Props = {
  friend: CommunityMessengerProfileLite;
  busyFavorite: boolean;
  /** 부모에서 안정 참조로 전달 — 행은 `friend.id`로 호출한다. */
  onToggleFavorite: (userId: string) => void;
  friendKind: "trade" | "delivery" | null;
  openedSwipeItemId: string | null;
  onOpenSwipeItem: (id: string | null) => void;
  onOpenFriendQuickMenu: (userId: string) => void;
  onCloseFriendQuickMenu: () => void;
  onCloseMenuItem: (id?: string) => void;
  onHideFriend: (userId: string) => void;
  onRemoveFriend: (userId: string) => void;
  onBlockFriend: (userId: string) => void;
};

export const MessengerLineFriendRow = memo(function MessengerLineFriendRow({
  friend,
  busyFavorite,
  onToggleFavorite,
  friendKind,
  openedSwipeItemId,
  onOpenSwipeItem,
  onOpenFriendQuickMenu,
  onCloseFriendQuickMenu,
  onCloseMenuItem,
  onHideFriend,
  onRemoveFriend,
  onBlockFriend,
}: Props) {
  const peerPresence = useCommunityMessengerPeerPresence(friend.id);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({
    startX: 0,
    startY: 0,
    origin: 0,
    active: false,
    dragging: false,
  });
  const dragXRef = useRef(0);
  const suppressTapRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  useEffect(() => {
    dragXRef.current = dragX;
  }, [dragX]);

  const avatarSrc = friend.avatarUrl?.trim() ? friend.avatarUrl.trim() : null;
  const initial = friend.label.trim().slice(0, 1) || "?";
  const bioLine = friend.bio?.trim() ?? "";
  const swipeItemId = messengerFriendSwipeItemId(friend.id);
  const rightSwipeItemId = `${swipeItemId}:right`;
  const leftSwipeItemId = `${swipeItemId}:left`;

  const snapClosed = useCallback(() => {
    dragXRef.current = 0;
    setDragX(0);
    onOpenSwipeItem(null);
  }, [onOpenSwipeItem]);

  useEffect(() => {
    if (openedSwipeItemId && openedSwipeItemId !== leftSwipeItemId && openedSwipeItemId !== rightSwipeItemId) {
      dragXRef.current = 0;
      setDragX(0);
    }
  }, [leftSwipeItemId, openedSwipeItemId, rightSwipeItemId]);

  useEffect(() => {
    if (openedSwipeItemId === leftSwipeItemId) {
      dragXRef.current = -LEFT_ACTION_TOTAL;
      setDragX(-LEFT_ACTION_TOTAL);
      return;
    }
    if (openedSwipeItemId === rightSwipeItemId) {
      dragXRef.current = RIGHT_ACTION_TOTAL;
      setDragX(RIGHT_ACTION_TOTAL);
    }
  }, [leftSwipeItemId, openedSwipeItemId, rightSwipeItemId]);

  const clamp = useCallback((x: number) => Math.max(-LEFT_ACTION_TOTAL, Math.min(RIGHT_ACTION_TOTAL, x)), []);

  const openQuickMenu = useCallback(() => {
    snapClosed();
    onOpenFriendQuickMenu(friend.id);
  }, [friend.id, onOpenFriendQuickMenu, snapClosed]);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      clearLongPressTimer();
      longPressFiredRef.current = false;
      suppressTapRef.current = false;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origin: dragXRef.current,
        active: true,
        dragging: false,
      };
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        longPressFiredRef.current = true;
        suppressTapRef.current = true;
        openQuickMenu();
      }, FRIEND_QUICK_MENU_LONG_PRESS_MS);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [clearLongPressTimer, openQuickMenu]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.active) return;
      if (longPressTimerRef.current) {
        const mdx = Math.abs(e.clientX - dragRef.current.startX);
        const mdy = Math.abs(e.clientY - dragRef.current.startY);
        if (mdx > LONG_PRESS_MOVE_CANCEL_PX || mdy > LONG_PRESS_MOVE_CANCEL_PX) {
          clearLongPressTimer();
        }
      }
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (!dragRef.current.dragging) {
        if (Math.abs(dy) > DRAG_CANCEL_Y && Math.abs(dy) > Math.abs(dx)) {
          clearLongPressTimer();
          dragRef.current.active = false;
          return;
        }
        if (Math.abs(dx) < DRAG_START_X || Math.abs(dx) <= Math.abs(dy)) {
          return;
        }
        clearLongPressTimer();
        dragRef.current.dragging = true;
        suppressTapRef.current = true;
        setIsDragging(true);
      }
      const next = clamp(dragRef.current.origin + dx);
      dragXRef.current = next;
      setDragX(next);
    },
    [clamp, clearLongPressTimer]
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      clearLongPressTimer();
      longPressFiredRef.current = false;
      dragRef.current.active = false;
      dragRef.current.dragging = false;
      setIsDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        /* noop */
      }
    },
    [clearLongPressTimer]
  );

  const runAction = useCallback(
    (fn: () => void) => {
      snapClosed();
      onCloseFriendQuickMenu();
      fn();
    },
    [onCloseFriendQuickMenu, snapClosed]
  );

  const swipeToggleFavorite = useCallback(() => {
    onToggleFavorite(friend.id);
  }, [friend.id, onToggleFavorite]);

  const swipeHideFriend = useCallback(() => {
    onHideFriend(friend.id);
  }, [friend.id, onHideFriend]);

  const swipeRemoveFriend = useCallback(() => {
    onRemoveFriend(friend.id);
  }, [friend.id, onRemoveFriend]);

  const swipeBlockFriend = useCallback(() => {
    onBlockFriend(friend.id);
  }, [friend.id, onBlockFriend]);

  const starToggleFavorite = useCallback(() => {
    onToggleFavorite(friend.id);
  }, [friend.id, onToggleFavorite]);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      clearLongPressTimer();
      if (!dragRef.current.active) {
        longPressFiredRef.current = false;
        return;
      }
      dragRef.current.active = false;
      const wasDragging = dragRef.current.dragging;
      dragRef.current.dragging = false;
      setIsDragging(false);
      longPressFiredRef.current = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        /* noop */
      }
      if (!wasDragging) {
        return;
      }
      const cur = dragXRef.current;
      const snap =
        cur < -LEFT_ACTION_TOTAL / 2 ? -LEFT_ACTION_TOTAL : cur > RIGHT_ACTION_TOTAL / 2 ? RIGHT_ACTION_TOTAL : 0;
      dragXRef.current = snap;
      setDragX(snap);
      if (snap !== 0) {
        onCloseFriendQuickMenu();
        onCloseMenuItem();
      }
      onOpenSwipeItem(snap === -LEFT_ACTION_TOTAL ? leftSwipeItemId : snap === RIGHT_ACTION_TOTAL ? rightSwipeItemId : null);
    },
    [clearLongPressTimer, leftSwipeItemId, onCloseFriendQuickMenu, onCloseMenuItem, onOpenSwipeItem, rightSwipeItemId]
  );

  const hideLabel = friend.isHiddenFriend ? "숨김 해제" : "숨기기";
  const blockLabel = friend.blocked ? "차단 해제" : "차단";

  return (
    <div
      data-messenger-friend-row="true"
      className="relative w-full min-w-0 overflow-hidden border-b border-[color:var(--messenger-divider)] last:border-b-0"
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-y-0 left-0 flex" aria-hidden={dragX <= 0}>
        <button
          type="button"
          onClick={() => runAction(swipeToggleFavorite)}
          className="flex w-[72px] items-center justify-center bg-violet-600 sam-text-helper font-semibold text-white active:opacity-90"
        >
          {friend.isFavoriteFriend ? "해제" : "즐겨찾기"}
        </button>
        <button
          type="button"
          onClick={() => runAction(swipeHideFriend)}
          className="flex w-[72px] items-center justify-center bg-amber-600 sam-text-helper font-semibold text-white active:opacity-90"
        >
          {hideLabel}
        </button>
      </div>
      <div className="absolute inset-y-0 right-0 flex" aria-hidden={dragX >= 0}>
        <button
          type="button"
          onClick={() => runAction(swipeRemoveFriend)}
          className="flex w-[72px] items-center justify-center bg-orange-600 sam-text-helper font-semibold text-white active:opacity-90"
        >
          삭제
        </button>
        <button
          type="button"
          onClick={() => runAction(swipeBlockFriend)}
          className="flex w-[72px] items-center justify-center bg-red-600 sam-text-helper font-semibold text-white active:opacity-90"
        >
          {blockLabel}
        </button>
      </div>

      <div
        className="relative flex min-w-0 flex-row bg-[color:var(--messenger-bg)] touch-pan-y"
        style={{
          transform: `translate3d(${dragX}px,0,0)`,
          transition: isDragging ? "none" : "transform 0.2s ease-out",
          willChange: isDragging ? "transform" : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
      >
        <div
          role="button"
          tabIndex={0}
          className="relative min-w-0 flex-1 select-none touch-manipulation active:bg-[color:var(--messenger-surface-muted)]"
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              openQuickMenu();
            }
          }}
          onClick={() => {
            if (suppressTapRef.current) {
              suppressTapRef.current = false;
              return;
            }
            if (Math.abs(dragX) > 16) {
              snapClosed();
            }
          }}
        >
          <MessengerListRow
            centerWithAvatar
            trailingLayout="center"
            avatar={
              <div className="relative h-12 w-12">
                <div className="h-full w-full overflow-hidden rounded-full bg-[color:var(--messenger-surface-muted)] ring-1 ring-[color:var(--messenger-divider)]">
                  {avatarSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center sam-text-body font-semibold"
                      style={{ color: "var(--messenger-text-secondary)" }}
                    >
                      {initial}
                    </div>
                  )}
                </div>
                <CommunityMessengerPresenceDot state={peerPresence?.state} />
              </div>
            }
            trailing={
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (dragX < -16) {
                    snapClosed();
                    return;
                  }
                  if (dragX > 16) {
                    snapClosed();
                    return;
                  }
                  starToggleFavorite();
                }}
                disabled={busyFavorite}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full sam-text-body font-semibold disabled:opacity-50"
                style={{
                  color: friend.isFavoriteFriend ? "var(--messenger-primary)" : "var(--messenger-text-secondary)",
                  backgroundColor: friend.isFavoriteFriend ? "var(--messenger-primary-soft)" : "transparent",
                }}
                aria-label={friend.isFavoriteFriend ? "즐겨찾기 해제" : "즐겨찾기"}
                aria-pressed={friend.isFavoriteFriend}
              >
                {friend.isFavoriteFriend ? "★" : "☆"}
              </button>
            }
          >
            <div className="flex min-w-0 items-center gap-1">
              <p className="truncate sam-text-body font-semibold" style={{ color: "var(--messenger-text)" }}>
                {friend.label}
              </p>
              <span
                className={
                  friendKind === "trade"
                    ? "shrink-0 rounded-[6px] border border-[color:color-mix(in_srgb,var(--messenger-success)32%,var(--messenger-surface))] bg-[color:var(--messenger-badge-trade-bg)] px-1 py-px text-[10.5px] font-medium leading-tight text-[color:var(--messenger-success)]"
                    : friendKind === "delivery"
                      ? "shrink-0 rounded-[6px] border border-[color:color-mix(in_srgb,var(--sam-warning)38%,var(--messenger-surface))] bg-[color:var(--messenger-badge-delivery-bg)] px-1 py-px text-[10.5px] font-medium leading-tight text-[color:var(--sam-warning)]"
                      : "shrink-0 rounded-[6px] border border-[color:color-mix(in_srgb,var(--messenger-primary)32%,var(--messenger-surface))] bg-[color:var(--messenger-badge-direct-bg)] px-1 py-px text-[10.5px] font-medium leading-tight text-[color:var(--messenger-primary)]"
                }
              >
                {friendKind === "trade" ? "거래 친구" : friendKind === "delivery" ? "배달 친구" : "친구"}
              </span>
              {friend.blocked ? (
                <span
                  className="shrink-0 rounded-[6px] border border-[color:var(--messenger-divider)] px-1 py-px sam-text-xxs font-medium"
                  style={{ color: "var(--messenger-text-secondary)" }}
                >
                  차단
                </span>
              ) : null}
            </div>
            {bioLine ? (
              <p
                className="line-clamp-2 whitespace-pre-wrap break-words sam-text-helper font-normal leading-snug"
                style={{ color: "var(--messenger-text-secondary)" }}
              >
                {bioLine}
              </p>
            ) : null}
          </MessengerListRow>
        </div>
      </div>
    </div>
  );
});

MessengerLineFriendRow.displayName = "MessengerLineFriendRow";
