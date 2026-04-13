"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessengerFriendRowQuickPopup } from "@/components/community-messenger/MessengerFriendRowQuickPopup";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

const ACTION_W = 72;
const ACTION_TOTAL = ACTION_W * 3;

type Props = {
  friend: CommunityMessengerProfileLite;
  busyId: string | null;
  busyFavorite: boolean;
  onRowPress: () => void;
  onToggleFavorite: () => void;
  /** ⋮ 팝업 — 1:1 채팅 / 통화 / 대화 알림 */
  onFriendChat: () => void;
  onFriendVoiceCall: () => void;
  onFriendVideoCall: () => void;
  showMuteRow: boolean;
  directRoomMuted: boolean | undefined;
  notificationsBusy: boolean;
  onToggleDirectMute?: () => void;
  /** 다른 행이 열리면 이 행은 닫힘 */
  openSwipeFriendId: string | null;
  onOpenSwipeFriendId: (id: string | null) => void;
  onHideFriend: () => void;
  onRemoveFriend: () => void;
  onBlockFriend: () => void;
};

/**
 * 모바일 친구 행 — 탭=프로필, ⋮=빠른 팝업, 좌→우 스와이프=숨기기·삭제·차단
 */
export function MessengerLineFriendRow({
  friend,
  busyId,
  busyFavorite,
  onRowPress,
  onToggleFavorite,
  onFriendChat,
  onFriendVoiceCall,
  onFriendVideoCall,
  showMuteRow,
  directRoomMuted,
  notificationsBusy,
  onToggleDirectMute,
  openSwipeFriendId,
  onOpenSwipeFriendId,
  onHideFriend,
  onRemoveFriend,
  onBlockFriend,
}: Props) {
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, origin: 0, active: false });
  const dragXRef = useRef(0);

  const [quickOpen, setQuickOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    dragXRef.current = dragX;
  }, [dragX]);

  const avatarSrc = friend.avatarUrl?.trim() ? friend.avatarUrl.trim() : null;
  const initial = friend.label.trim().slice(0, 1) || "?";
  const handleLine = friend.subtitle?.trim() || `ID · ${friend.id.slice(0, 8)}…`;
  const bioLine = friend.bio?.trim() ?? "";

  const snapClosed = useCallback(() => {
    setDragX(0);
    onOpenSwipeFriendId(null);
  }, [onOpenSwipeFriendId]);

  useEffect(() => {
    if (openSwipeFriendId && openSwipeFriendId !== friend.id) {
      setDragX(0);
    }
  }, [openSwipeFriendId, friend.id]);

  useEffect(() => {
    if (openSwipeFriendId === friend.id) {
      setDragX(-ACTION_TOTAL);
    }
  }, [openSwipeFriendId, friend.id]);

  const clamp = useCallback((x: number) => Math.max(-ACTION_TOTAL, Math.min(0, x)), []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      origin: dragXRef.current,
      active: true,
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.startX;
      const next = clamp(dragRef.current.origin + dx);
      dragXRef.current = next;
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
      const cur = dragXRef.current;
      const threshold = -ACTION_TOTAL / 2;
      const snap = cur < threshold ? -ACTION_TOTAL : 0;
      dragXRef.current = snap;
      setDragX(snap);
      const openId = snap === -ACTION_TOTAL ? friend.id : null;
      queueMicrotask(() => {
        onOpenSwipeFriendId(openId);
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

  const openQuickMenu = useCallback(
    (el: HTMLElement) => {
      snapClosed();
      setAnchorRect(el.getBoundingClientRect());
      setQuickOpen(true);
    },
    [snapClosed]
  );

  const hideLabel = friend.isHiddenFriend ? "숨김 해제" : "숨기기";
  const blockLabel = friend.blocked ? "차단 해제" : "차단";

  return (
    <div className="relative w-full min-w-0 overflow-hidden border-b border-[color:var(--messenger-divider)] last:border-b-0">
      <div
        className="flex min-w-0 flex-row touch-pan-y"
        style={{
          width: `calc(100% + ${ACTION_TOTAL}px)`,
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
          className="relative flex min-h-[var(--ui-tap-min,48px)] min-w-0 flex-1 shrink items-stretch bg-[color:var(--messenger-surface)] shadow-[1px_0_0_var(--messenger-divider)]"
          style={{ flex: "1 1 0%", minWidth: 0 }}
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
            className="relative flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-2 pl-0 pr-1 touch-manipulation active:bg-[color:var(--messenger-primary-soft)]"
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                onRowPress();
              }
            }}
            onClick={() => {
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
            <div className="min-w-0 flex-1 pr-0.5">
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

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              openQuickMenu(e.currentTarget);
            }}
            className="flex w-10 shrink-0 touch-manipulation items-center justify-center active:bg-[color:var(--messenger-primary-soft)]"
            style={{ color: "var(--messenger-text-secondary)" }}
            aria-label="더보기"
          >
            <span className="text-[18px] font-bold leading-none">⋮</span>
          </button>
        </div>

        <div
          className="flex h-full shrink-0 self-stretch"
          style={{ width: ACTION_TOTAL, flex: `0 0 ${ACTION_TOTAL}px` }}
          aria-hidden={dragX === 0}
        >
          <button
            type="button"
            onClick={() => runAction(onHideFriend)}
            className="flex w-[72px] shrink-0 items-center justify-center bg-amber-600 text-[12px] font-semibold text-white active:opacity-90"
          >
            {hideLabel}
          </button>
          <button
            type="button"
            onClick={() => runAction(onRemoveFriend)}
            className="flex w-[72px] shrink-0 items-center justify-center bg-orange-600 text-[12px] font-semibold text-white active:opacity-90"
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
      </div>

      <MessengerFriendRowQuickPopup
        profile={friend}
        open={quickOpen}
        anchorRect={anchorRect}
        onClose={() => {
          setQuickOpen(false);
          setAnchorRect(null);
        }}
        busyId={busyId}
        onChat={onFriendChat}
        onVoiceCall={onFriendVoiceCall}
        onVideoCall={onFriendVideoCall}
        showMuteRow={showMuteRow}
        directRoomMuted={directRoomMuted}
        notificationsBusy={notificationsBusy}
        onToggleMute={onToggleDirectMute}
      />
    </div>
  );
}
