"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { prefetchCommunityMessengerRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import { useMessengerLongPress } from "@/lib/community-messenger/use-messenger-long-press";
import type { MessengerChatListContext } from "@/lib/community-messenger/messenger-ia";
import { communityMessengerRoomIsInboxHidden, type CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import {
  formatConversationTimestamp,
  getRoomTypeBadgeLabel,
  type UnifiedRoomListItem,
} from "@/lib/community-messenger/use-community-messenger-home-state";

type Props = {
  item: UnifiedRoomListItem;
  favoriteFriendIds: Set<string>;
  busyId: string | null;
  onTogglePin: (room: CommunityMessengerRoomSummary) => void;
  onToggleMute: (room: CommunityMessengerRoomSummary) => void;
  onMarkRead: (room: CommunityMessengerRoomSummary) => void;
  onToggleArchive: (room: CommunityMessengerRoomSummary) => void;
  onOpenRoomActions?: (item: UnifiedRoomListItem, listContext: MessengerChatListContext) => void;
  /** 보관함 탭 등 액션 시트 분기 */
  listContext?: MessengerChatListContext;
  compact?: boolean;
  /** 검색 시트 등: 탭은 방 이동, 롱프레스는 부모 액션 시트 */
  onCompactLongPress?: () => void;
};

export function MessengerChatListItem({
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
  const prefetchOnceRef = useRef(false);

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

  const longPressHandler = useCallback(() => {
    if (compact && onCompactLongPress) {
      onCompactLongPress();
      return;
    }
    if (!compact) {
      onOpenRoomActions?.(item, listContext);
    }
  }, [compact, item, listContext, onCompactLongPress, onOpenRoomActions]);

  const { bind, consumeClickSuppression } = useMessengerLongPress(longPressHandler, { thresholdMs: 480 });

  const rowContent = (
    <div className="flex items-start gap-2">
      {commerceMeta?.thumbnailUrl ? (
        <CommerceThumb src={commerceMeta.thumbnailUrl} fallbackAvatarUrl={room.avatarUrl} fallbackLabel={room.title} />
      ) : (
        <AvatarCircle src={room.avatarUrl} label={room.title} sizeClassName="h-9 w-9" textClassName="text-[12px]" />
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
          <span className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold leading-none ${getRoomTypeBadgeClassName(badgeLabel)}`}>
            {badgeLabel}
          </span>
          {commerceMeta?.stepLabel ? (
            <span className="max-w-[38%] shrink-0 truncate rounded-ui-rect border border-ui-border bg-ui-page px-1 py-px text-[9px] font-medium text-ui-muted">
              {commerceMeta.stepLabel}
            </span>
          ) : null}
        </div>
        {commerceSubline ? (
          <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--messenger-text-secondary)" }}>
            {commerceSubline}
          </p>
        ) : null}
        <div className="mt-0.5 flex items-center gap-1">
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
          if (!prefetchOnceRef.current) {
            prefetchOnceRef.current = true;
            void prefetchCommunityMessengerRoomSnapshot(room.id);
          }
          navigateToCommunityRoom(room.id);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (consumeClickSuppression()) return;
            navigateToCommunityRoom(room.id);
          }
        }}
        className="block cursor-default px-2 py-2 touch-manipulation active:bg-[color:var(--messenger-primary-soft)]"
      >
        {rowContent}
      </div>
    );
  }

  if (compact) {
    return (
      <Link
        href={`/community-messenger/rooms/${encodeURIComponent(room.id)}`}
        onPointerDown={() => {
          if (prefetchOnceRef.current) return;
          prefetchOnceRef.current = true;
          void prefetchCommunityMessengerRoomSnapshot(room.id);
        }}
        className="block px-2 py-2 active:bg-[color:var(--messenger-primary-soft)]"
      >
        {rowContent}
      </Link>
    );
  }

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
      className="block w-full cursor-default bg-[color:var(--messenger-surface)] px-2.5 py-1.5 transition active:bg-[color:var(--messenger-primary-soft)] touch-pan-y"
    >
      {rowContent}
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
    return <AvatarCircle src={fallbackAvatarUrl} label={fallbackLabel} sizeClassName="h-9 w-9" textClassName="text-[12px]" />;
  }
  return (
    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-ui-rect border border-ui-border bg-ui-page">
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
    <div className={`shrink-0 overflow-hidden rounded-full bg-ui-hover ${sizeClassName}`}>
      {safeSrc && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={safeSrc} alt="" className="h-full w-full object-cover" onError={() => setImageFailed(true)} />
      ) : (
        <div className={`flex h-full w-full items-center justify-center font-semibold text-ui-muted ${textClassName}`}>{initial}</div>
      )}
    </div>
  );
}

function getRoomTypeBadgeClassName(label: string): string {
  if (label === "친구") return "border-transparent bg-[color:var(--messenger-badge-direct-bg)] text-[color:var(--messenger-primary)]";
  if (label === "그룹") return "border-transparent bg-[color:var(--messenger-badge-group-bg)] text-violet-900";
  if (label === "오픈") return "border-transparent bg-[color:var(--messenger-badge-openchat-bg)] text-sky-800";
  if (label === "거래") return "border-transparent bg-[color:var(--messenger-badge-trade-bg)] text-emerald-900";
  if (label === "배달") return "border-transparent bg-[color:var(--messenger-badge-delivery-bg)] text-amber-900";
  return "border-transparent bg-[color:var(--messenger-surface-muted)] text-[color:var(--messenger-text-secondary)]";
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
