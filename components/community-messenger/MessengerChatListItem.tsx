"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { prefetchCommunityMessengerRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import { communityMessengerRoomIsInboxHidden, type CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import {
  formatConversationTimestamp,
  getRoomTypeBadgeLabel,
  type UnifiedRoomListItem,
} from "@/lib/community-messenger/use-community-messenger-home-state";

const ROOM_ROW_ACTION_WIDTH = 224;
const ROOM_ROW_ACTION_CLOSE_THRESHOLD = 56;
const ROOM_ROW_AXIS_LOCK_THRESHOLD = 8;

type Props = {
  item: UnifiedRoomListItem;
  favoriteFriendIds: Set<string>;
  busyId: string | null;
  onTogglePin: (room: CommunityMessengerRoomSummary) => void;
  onToggleMute: (room: CommunityMessengerRoomSummary) => void;
  onMarkRead: (room: CommunityMessengerRoomSummary) => void;
  onToggleArchive: (room: CommunityMessengerRoomSummary) => void;
  compact?: boolean;
};

export function MessengerChatListItem({
  item,
  favoriteFriendIds,
  busyId,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onToggleArchive,
  compact = false,
}: Props) {
  const router = useRouter();
  const room = item.room;
  const badgeLabel = getRoomTypeBadgeLabel(room);
  const commerceMeta = room.contextMeta;
  const isFavorite = room.peerUserId ? favoriteFriendIds.has(room.peerUserId) : false;
  const titleSuffix = room.roomType !== "direct" && room.memberCount > 0 ? String(room.memberCount) : "";
  const commerceSubline =
    commerceMeta && (commerceMeta.headline || commerceMeta.priceLabel)
      ? [commerceMeta.headline, commerceMeta.priceLabel].filter(Boolean).join(" · ")
      : null;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const activeDrag = useRef(false);
  const dragAxis = useRef<"x" | "y" | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
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
      void prefetchCommunityMessengerRoomSnapshot(id);
      router.push(`/community-messenger/rooms/${encodeURIComponent(id)}`);
    },
    [router]
  );

  const closeActions = useCallback(() => setOffset(0), []);
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const isSettingsBusy = busyId === `room-settings:${room.id}`;
  const isReadBusy = busyId === `room-read:${room.id}`;
  const isArchiveBusy = busyId === `room-archive:${room.id}`;

  const onPointerDown = (e: React.PointerEvent) => {
    if (compact || !e.isPrimary) return;
    activeDrag.current = true;
    dragAxis.current = null;
    setDragging(true);
    startX.current = e.clientX;
    startY.current = e.clientY;
    startOffset.current = offset;
    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      activeDrag.current = false;
      setDragging(false);
      setOffset(0);
      longPressTriggeredRef.current = true;
      setMenuOpen(true);
    }, 520);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (compact || !activeDrag.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (dragAxis.current == null) {
      if (Math.abs(dx) < ROOM_ROW_AXIS_LOCK_THRESHOLD && Math.abs(dy) < ROOM_ROW_AXIS_LOCK_THRESHOLD) return;
      dragAxis.current = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
    }
    clearLongPressTimer();
    if (dragAxis.current !== "x") return;
    let next = startOffset.current + dx;
    if (next > 0) next = 0;
    if (next < -ROOM_ROW_ACTION_WIDTH) next = -ROOM_ROW_ACTION_WIDTH;
    setOffset(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (compact) return;
    activeDrag.current = false;
    dragAxis.current = null;
    setDragging(false);
    clearLongPressTimer();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setOffset((cur) => (cur < -ROOM_ROW_ACTION_CLOSE_THRESHOLD ? -ROOM_ROW_ACTION_WIDTH : 0));
  };

  useEffect(() => () => clearLongPressTimer(), [clearLongPressTimer]);

  const rowContent = (
    <div className="flex items-start gap-3">
      {commerceMeta?.thumbnailUrl ? (
        <CommerceThumb src={commerceMeta.thumbnailUrl} fallbackAvatarUrl={room.avatarUrl} fallbackLabel={room.title} />
      ) : (
        <AvatarCircle src={room.avatarUrl} label={room.title} sizeClassName="h-11 w-11" textClassName="text-[14px]" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 truncate text-[15px] font-semibold leading-tight text-ui-fg">{room.title}</p>
          {titleSuffix ? <span className="shrink-0 text-[12px] text-ui-muted">{titleSuffix}</span> : null}
          <span className={`shrink-0 rounded-ui-rect border px-1.5 py-0.5 text-[10px] font-medium leading-none ${getRoomTypeBadgeClassName(badgeLabel)}`}>
            {badgeLabel}
          </span>
          {commerceMeta?.stepLabel ? (
            <span className="max-w-[40%] shrink-0 truncate rounded-ui-rect border border-ui-border bg-ui-page px-1.5 py-0.5 text-[10px] font-medium text-ui-muted">
              {commerceMeta.stepLabel}
            </span>
          ) : null}
        </div>
        {commerceSubline ? <p className="mt-0.5 truncate text-[12px] text-ui-muted">{commerceSubline}</p> : null}
        <div className="mt-1 flex items-center gap-1.5">
          {secondaryHint ? (
            <span className="shrink-0 rounded-sm border border-ui-border px-1.5 py-0.5 text-[10px] font-medium text-ui-muted">
              {secondaryHint}
            </span>
          ) : null}
          {isFavorite ? <span className="shrink-0 text-[11px] text-ui-muted">★</span> : null}
          <p className={`min-w-0 truncate text-[13px] ${room.unreadCount > 0 ? "font-medium text-ui-fg" : "text-ui-muted"}`}>
            {item.preview}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 pl-1">
        <span className="text-[11px] tabular-nums text-ui-muted">{formatConversationTimestamp(item.lastEventAt)}</span>
        <div className="flex items-center gap-1">
          {room.isPinned ? (
            <span className="text-ui-muted" aria-label="고정됨">
              <PinIcon />
            </span>
          ) : null}
          {room.isMuted ? (
            <span className="text-ui-muted" aria-label="알림 끔">
              <MuteIcon />
            </span>
          ) : null}
          {room.unreadCount > 0 ? (
            <span className="min-w-[18px] rounded-ui-rect bg-ui-fg px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-ui-surface">
              {room.unreadCount > 999 ? "999+" : room.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (compact) {
    return (
      <Link
        href={`/community-messenger/rooms/${room.id}`}
        onPointerEnter={() => void prefetchCommunityMessengerRoomSnapshot(room.id)}
        onPointerDown={() => void prefetchCommunityMessengerRoomSnapshot(room.id)}
        className="block border-b border-gray-100 px-3 py-3 last:border-b-0"
      >
        {rowContent}
      </Link>
    );
  }

  return (
    <div className="relative overflow-hidden border-b border-gray-100 last:border-b-0">
      <div className="absolute inset-y-0 right-0 flex w-[168px] items-stretch border-l border-gray-200 bg-white" style={{ pointerEvents: offset < -8 ? "auto" : "none" }}>
        <button
          type="button"
          disabled={isSettingsBusy}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(room);
            closeActions();
          }}
          className="flex w-[56px] items-center justify-center border-r border-gray-200 bg-white px-1 text-[11px] font-semibold text-gray-700 disabled:opacity-50"
        >
          {room.isPinned ? "해제" : "고정"}
        </button>
        <button
          type="button"
          disabled={isSettingsBusy}
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute(room);
            closeActions();
          }}
          className="flex w-[56px] items-center justify-center border-r border-gray-200 bg-white px-1 text-[11px] font-semibold text-gray-700 disabled:opacity-50"
        >
          {room.isMuted ? "해제" : "알림"}
        </button>
        <button
          type="button"
          disabled={isReadBusy || room.unreadCount < 1}
          onClick={(e) => {
            e.stopPropagation();
            onMarkRead(room);
            closeActions();
          }}
          className="flex w-[56px] items-center justify-center border-r border-gray-200 bg-gray-900 px-1 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          읽음
        </button>
        <button
          type="button"
          disabled={isArchiveBusy}
          onClick={(e) => {
            e.stopPropagation();
            onToggleArchive(room);
            closeActions();
          }}
          className="flex w-[56px] items-center justify-center bg-white px-1 text-[11px] font-semibold text-gray-700 disabled:opacity-50"
        >
          {communityMessengerRoomIsInboxHidden(room) ? "해제" : "보관"}
        </button>
      </div>
      <div
        role="button"
        tabIndex={0}
        onPointerEnter={() => void prefetchCommunityMessengerRoomSnapshot(room.id)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          if (offset < -20) {
            closeActions();
            return;
          }
          if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false;
            return;
          }
          navigateToCommunityRoom(room.id);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (offset < -20) {
              closeActions();
              return;
            }
            navigateToCommunityRoom(room.id);
          }
        }}
        className="relative bg-white px-3 py-3 transition hover:bg-gray-50 touch-pan-y"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 0.2s ease-out",
          touchAction: "pan-y",
        }}
      >
        {rowContent}
      </div>
      {menuOpen ? (
        <div className="fixed inset-0 z-[45] flex flex-col justify-end bg-black/35" onClick={() => setMenuOpen(false)}>
          <div className="rounded-t-[10px] border-t border-gray-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3" onClick={(event) => event.stopPropagation()}>
            <p className="text-center text-[14px] font-semibold text-gray-900">{room.title}</p>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  navigateToCommunityRoom(room.id);
                }}
                className="rounded-ui-rect border border-gray-200 px-4 py-3 text-left text-[14px] font-medium text-gray-900"
              >
                채팅방 열기
              </button>
              <button
                type="button"
                disabled={isSettingsBusy}
                onClick={() => {
                  onTogglePin(room);
                  setMenuOpen(false);
                }}
                className="rounded-ui-rect border border-gray-200 px-4 py-3 text-left text-[14px] font-medium text-gray-900 disabled:opacity-40"
              >
                {room.isPinned ? "고정 해제" : "채팅방 고정"}
              </button>
              <button
                type="button"
                disabled={isSettingsBusy}
                onClick={() => {
                  onToggleMute(room);
                  setMenuOpen(false);
                }}
                className="rounded-ui-rect border border-gray-200 px-4 py-3 text-left text-[14px] font-medium text-gray-900 disabled:opacity-40"
              >
                {room.isMuted ? "알림 켜기" : "알림 끄기"}
              </button>
              <button
                type="button"
                disabled={isReadBusy || room.unreadCount < 1}
                onClick={() => {
                  onMarkRead(room);
                  setMenuOpen(false);
                }}
                className="rounded-ui-rect border border-gray-200 px-4 py-3 text-left text-[14px] font-medium text-gray-900 disabled:opacity-40"
              >
                읽음 처리
              </button>
              <button
                type="button"
                disabled={isArchiveBusy}
                onClick={() => {
                  onToggleArchive(room);
                  setMenuOpen(false);
                }}
                className="rounded-ui-rect border border-gray-200 px-4 py-3 text-left text-[14px] font-medium text-gray-900 disabled:opacity-40"
              >
                {communityMessengerRoomIsInboxHidden(room) ? "채팅방 보관 해제" : "채팅방 보관"}
              </button>
            </div>
            <button type="button" className="mt-3 w-full py-3 text-[14px] text-gray-500" onClick={() => setMenuOpen(false)}>
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

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
    return <AvatarCircle src={fallbackAvatarUrl} label={fallbackLabel} sizeClassName="h-11 w-11" textClassName="text-[14px]" />;
  }
  return (
    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-ui-rect border border-ui-border bg-ui-page">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
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
    <div className={`shrink-0 overflow-hidden rounded-full bg-gray-100 ${sizeClassName}`}>
      {safeSrc && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={safeSrc} alt="" className="h-full w-full object-cover" onError={() => setImageFailed(true)} />
      ) : (
        <div className={`flex h-full w-full items-center justify-center font-semibold text-gray-600 ${textClassName}`}>{initial}</div>
      )}
    </div>
  );
}

function getRoomTypeBadgeClassName(label: string): string {
  if (label === "친구") return "border-gray-200 bg-white text-gray-600";
  if (label === "그룹") return "border-gray-300 bg-gray-50 text-gray-700";
  if (label === "오픈") return "border-gray-200 bg-gray-50 text-gray-600";
  if (label === "거래") return "border-gray-200 bg-gray-50 text-gray-600";
  if (label === "배달") return "border-gray-200 bg-gray-50 text-gray-600";
  return "border-gray-200 bg-gray-50 text-gray-600";
}

function PinIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 4l6 6-3 1-3 6-2-2-4 5-1-1 5-4-2-2 6-3 1-3z" />
    </svg>
  );
}

function MuteIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 9v6h4l5 4V5l-5 4H5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l5 8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8l-5 8" />
    </svg>
  );
}
