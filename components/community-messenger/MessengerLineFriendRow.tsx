"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMessengerLongPress } from "@/lib/community-messenger/use-messenger-long-press";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

const ACTION_W = 72;
const ACTION_TOTAL = ACTION_W * 3;

type Props = {
  friend: CommunityMessengerProfileLite;
  busyFavorite: boolean;
  onRowPress: () => void;
  onOpenActions: () => void;
  onToggleFavorite: () => void;
  /** 다른 행이 열리면 이 행은 닫힘 */
  openSwipeFriendId: string | null;
  onOpenSwipeFriendId: (id: string | null) => void;
  onHideFriend: () => void;
  onRemoveFriend: () => void;
  onBlockFriend: () => void;
};

/**
 * 모바일 친구 행 — 탭=프로필, 롱프레스=액션 시트, 좌→우 스와이프=숨기기·삭제·차단
 */
export function MessengerLineFriendRow({
  friend,
  busyFavorite,
  onRowPress,
  onOpenActions,
  onToggleFavorite,
  openSwipeFriendId,
  onOpenSwipeFriendId,
  onHideFriend,
  onRemoveFriend,
  onBlockFriend,
}: Props) {
  const { bind, consumeClickSuppression } = useMessengerLongPress(onOpenActions);

  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, origin: 0, active: false });

  const avatarSrc = friend.avatarUrl?.trim() ? friend.avatarUrl.trim() : null;
  const initial = friend.label.trim().slice(0, 1) || "?";
  const handleLine = friend.subtitle?.trim() || `ID · ${friend.id.slice(0, 8)}…`;
  const bioLine = friend.bio?.trim() ?? "";

  const snapClosed = useCallback(() => {
    setDragX(0);
    onOpenSwipeFriendId(null);
  }, [onOpenSwipeFriendId]);

  /** 다른 행이 열리면 닫기 */
  useEffect(() => {
    if (openSwipeFriendId && openSwipeFriendId !== friend.id) {
      setDragX(0);
    }
  }, [openSwipeFriendId, friend.id]);

  /** 부모가 이 행을 열린 상태로 두도록 할 때 */
  useEffect(() => {
    if (openSwipeFriendId === friend.id) {
      setDragX(-ACTION_TOTAL);
    }
  }, [openSwipeFriendId, friend.id]);

  const clamp = useCallback((x: number) => Math.max(-ACTION_TOTAL, Math.min(0, x)), []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      setIsDragging(true);
      dragRef.current = {
        startX: e.clientX,
        origin: dragX,
        active: true,
      };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [dragX]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.startX;
      const next = clamp(dragRef.current.origin + dx);
      setDragX(next);
    },
    [clamp]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      setIsDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        /* noop */
      }
      setDragX((cur) => {
        const threshold = -ACTION_TOTAL / 2;
        if (cur < threshold) {
          onOpenSwipeFriendId(friend.id);
          return -ACTION_TOTAL;
        }
        onOpenSwipeFriendId(null);
        return 0;
      });
    },
    [friend.id, onOpenSwipeFriendId]
  );

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    dragRef.current.active = false;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  const runAction = useCallback(
    (fn: () => void) => {
      setDragX(0);
      onOpenSwipeFriendId(null);
      fn();
    },
    [onOpenSwipeFriendId]
  );

  const hideLabel = friend.isHiddenFriend ? "숨김 해제" : "숨기기";
  const blockLabel = friend.blocked ? "차단 해제" : "차단";

  return (
    <div className="relative overflow-hidden border-b border-[color:var(--messenger-divider)] last:border-b-0">
      <div
        className="absolute inset-y-0 right-0 z-0 flex"
        style={{ width: ACTION_TOTAL }}
        aria-hidden={dragX === 0}
      >
        <button
          type="button"
          onClick={() => runAction(onHideFriend)}
          className="flex w-[72px] shrink-0 items-center justify-center bg-amber-600/90 text-[12px] font-semibold text-white active:opacity-90"
        >
          {hideLabel}
        </button>
        <button
          type="button"
          onClick={() => runAction(onRemoveFriend)}
          className="flex w-[72px] shrink-0 items-center justify-center bg-orange-600/95 text-[12px] font-semibold text-white active:opacity-90"
        >
          삭제
        </button>
        <button
          type="button"
          onClick={() => runAction(onBlockFriend)}
          className="flex w-[72px] shrink-0 items-center justify-center bg-red-600 text-[12px] font-semibold text-white active:opacity-90"
        >
          {blockLabel}
        </button>
      </div>

      <div
        className="relative z-10 flex min-h-[var(--ui-tap-min,48px)] items-stretch bg-[color:var(--messenger-surface)] shadow-[1px_0_0_var(--messenger-divider)]"
        style={{
          transform: `translateX(${dragX}px)`,
          transition: isDragging ? "none" : "transform 0.2s ease-out",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
      >
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (dragX < -16) {
              snapClosed();
              return;
            }
            onToggleFavorite();
          }}
          disabled={busyFavorite}
          className="flex w-9 shrink-0 touch-manipulation items-center justify-center active:bg-[color:var(--messenger-primary-soft)] disabled:opacity-50"
          style={{ color: friend.isFavoriteFriend ? "var(--messenger-primary)" : "var(--messenger-text-secondary)" }}
          aria-label={friend.isFavoriteFriend ? "즐겨찾기 해제" : "즐겨찾기"}
          aria-pressed={friend.isFavoriteFriend}
        >
          <span className="text-[17px] leading-none">{friend.isFavoriteFriend ? "★" : "☆"}</span>
        </button>

        <div
          role="button"
          tabIndex={0}
          className="relative flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 pl-0 pr-3 touch-manipulation active:bg-[color:var(--messenger-primary-soft)]"
          {...bind}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              onRowPress();
            }
          }}
          onClick={() => {
            if (consumeClickSuppression()) return;
            if (dragX < -16) {
              snapClosed();
              return;
            }
            onRowPress();
          }}
        >
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[color:var(--messenger-primary-soft)]">
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
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <p className="truncate text-[15px] font-semibold" style={{ color: "var(--messenger-text)" }}>
                {friend.label}
              </p>
              {friend.blocked ? (
                <span
                  className="shrink-0 rounded-sm border border-[color:var(--messenger-divider)] px-1 py-px text-[9px] font-medium"
                  style={{ color: "var(--messenger-text-secondary)" }}
                >
                  차단
                </span>
              ) : null}
            </div>
            <p className="truncate text-[12px]" style={{ color: "var(--messenger-text-secondary)" }}>
              {handleLine}
            </p>
            {bioLine ? (
              <p className="line-clamp-2 text-[11px] leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
                {bioLine}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
