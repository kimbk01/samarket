"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { messengerFriendSwipeItemId } from "@/lib/community-messenger/messenger-ia";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import { useCommunityMessengerPeerPresence } from "@/lib/community-messenger/realtime/presence/use-community-messenger-peer-presence";
import { CommunityMessengerPresenceDot } from "@/components/community-messenger/CommunityMessengerPresenceDot";

const ACTION_W = 72;
const LEFT_ACTION_TOTAL = ACTION_W * 2;
const RIGHT_ACTION_TOTAL = ACTION_W * 2;
const DRAG_START_X = 16;
const DRAG_CANCEL_Y = 14;

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

  useEffect(() => {
    dragXRef.current = dragX;
  }, [dragX]);

  const avatarSrc = friend.avatarUrl?.trim() ? friend.avatarUrl.trim() : null;
  const initial = friend.label.trim().slice(0, 1) || "?";
  const handleLineRaw = friend.subtitle?.trim() ?? "";
  const handleLine = handleLineRaw.startsWith("@") ? handleLineRaw.slice(1).trim() : handleLineRaw;
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

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    suppressTapRef.current = false;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origin: dragXRef.current,
      active: true,
      dragging: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (!dragRef.current.dragging) {
        if (Math.abs(dy) > DRAG_CANCEL_Y && Math.abs(dy) > Math.abs(dx)) {
          dragRef.current.active = false;
          return;
        }
        if (Math.abs(dx) < DRAG_START_X || Math.abs(dx) <= Math.abs(dy)) {
          return;
        }
        dragRef.current.dragging = true;
        suppressTapRef.current = true;
        setIsDragging(true);
      }
      const next = clamp(dragRef.current.origin + dx);
      dragXRef.current = next;
      setDragX(next);
    },
    [clamp]
  );

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    dragRef.current.active = false;
    dragRef.current.dragging = false;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

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

  const openQuickMenu = useCallback(() => {
    snapClosed();
    onOpenFriendQuickMenu(friend.id);
  }, [friend.id, onOpenFriendQuickMenu, snapClosed]);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
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
        // 모바일/포인터 캡처 환경에서 onClick이 누락되는 케이스가 있어 tap은 여기서 확정한다.
        if (!suppressTapRef.current && Math.abs(dragXRef.current) <= 6) {
          suppressTapRef.current = true;
          openQuickMenu();
          if (e.pointerType === "touch") {
            e.preventDefault();
          }
          e.stopPropagation();
        }
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
    [leftSwipeItemId, onCloseFriendQuickMenu, onCloseMenuItem, onOpenSwipeItem, openQuickMenu, rightSwipeItemId]
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
          className="flex w-[72px] items-center justify-center bg-violet-600 text-[12px] font-semibold text-white active:opacity-90"
        >
          {friend.isFavoriteFriend ? "해제" : "즐겨찾기"}
        </button>
        <button
          type="button"
          onClick={() => runAction(swipeHideFriend)}
          className="flex w-[72px] items-center justify-center bg-amber-600 text-[12px] font-semibold text-white active:opacity-90"
        >
          {hideLabel}
        </button>
      </div>
      <div className="absolute inset-y-0 right-0 flex" aria-hidden={dragX >= 0}>
        <button
          type="button"
          onClick={() => runAction(swipeRemoveFriend)}
          className="flex w-[72px] items-center justify-center bg-orange-600 text-[12px] font-semibold text-white active:opacity-90"
        >
          삭제
        </button>
        <button
          type="button"
          onClick={() => runAction(swipeBlockFriend)}
          className="flex w-[72px] items-center justify-center bg-red-600 text-[12px] font-semibold text-white active:opacity-90"
        >
          {blockLabel}
        </button>
      </div>

      <div
        className="relative flex min-w-0 flex-row bg-[color:var(--messenger-surface)] touch-pan-y"
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
          className="relative flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-3 touch-manipulation active:bg-[color:var(--messenger-primary-soft)]"
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
              return;
            }
            openQuickMenu();
          }}
        >
          <div className="relative h-12 w-12 shrink-0">
            <div className="h-full w-full overflow-hidden rounded-full bg-[color:var(--messenger-primary-soft)] ring-1 ring-[color:var(--messenger-primary-soft-2)]">
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-[14px] font-semibold"
                  style={{ color: "var(--messenger-text-secondary)" }}
                >
                  {initial}
                </div>
              )}
            </div>
            <CommunityMessengerPresenceDot state={peerPresence?.state} />
          </div>
          <div className="min-w-0 flex-1 pr-0.5">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-[15px] font-semibold" style={{ color: "var(--messenger-text)" }}>
                {friend.label}
              </p>
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  friendKind === "trade"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    : friendKind === "delivery"
                      ? "border border-amber-200 bg-amber-50 text-amber-700"
                      : "border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] text-[color:var(--messenger-text-secondary)]"
                }`}
              >
                {friendKind === "trade" ? "거래 친구" : friendKind === "delivery" ? "배달 친구" : "친구"}
              </span>
              {friend.isFavoriteFriend ? (
                <span
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: "var(--messenger-primary-soft)",
                    color: "var(--messenger-primary)",
                  }}
                >
                  즐겨찾기
                </span>
              ) : null}
              {friend.blocked ? (
                <span
                  className="shrink-0 rounded-sm border border-[color:var(--messenger-divider)] px-1 py-px text-[9px] font-medium"
                  style={{ color: "var(--messenger-text-secondary)" }}
                >
                  차단
                </span>
              ) : null}
            </div>
            {handleLine ? (
              <p className="truncate text-[12px]" style={{ color: "var(--messenger-text-secondary)" }}>
                {handleLine}
              </p>
            ) : null}
            {bioLine ? (
              <p className="line-clamp-2 text-[11px] leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
                {bioLine}
              </p>
            ) : null}
          </div>
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
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-full px-2 text-[12px] font-semibold disabled:opacity-50"
            style={{
              color: friend.isFavoriteFriend ? "var(--messenger-primary)" : "var(--messenger-text-secondary)",
              backgroundColor: friend.isFavoriteFriend ? "var(--messenger-primary-soft)" : "transparent",
            }}
            aria-label={friend.isFavoriteFriend ? "즐겨찾기 해제" : "즐겨찾기"}
            aria-pressed={friend.isFavoriteFriend}
          >
            {friend.isFavoriteFriend ? "★" : "☆"}
          </button>
        </div>
      </div>
    </div>
  );
});

MessengerLineFriendRow.displayName = "MessengerLineFriendRow";
